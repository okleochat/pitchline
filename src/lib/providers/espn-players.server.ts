import "server-only"

import type { LeagueId } from "@/data/football"
import { getEspnJson } from "@/lib/espn/transport.server"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { deriveEspnPlayerScores, deriveSquadFactors, normaliseSquadPlayer } from "@/lib/pro-player-model"
import type {
  PlayerDataStatus,
  PlayerScores,
  PlayerTeamContext,
  ProPlayerData,
  ProTeamSquad,
  SquadPlayer,
} from "@/lib/pro-player-data"

type Dict = Record<string, unknown>
type CacheEntry = { expiresAt: number; value: unknown }

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer"
const ROSTER_CACHE_MS = 12 * 60 * 60 * 1000
const PLAYER_STATS_CACHE_MS = 8 * 60 * 60 * 1000
const EMPTY_CACHE_MS = 15 * 60 * 1000
const MAX_PROFILE_PLAYERS_PER_TEAM = 22
const PROFILE_CONCURRENCY = 6
const memoryCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

const LEAGUE_SLUGS: Partial<Record<LeagueId, string>> = {
  eng: "eng.1",
  ch: "eng.2",
  esp: "esp.1",
  ita: "ita.1",
  ger: "ger.1",
  fra: "fra.1",
  ned: "ned.1",
  por: "por.1",
  tur: "tur.1",
  ksa: "ksa.1",
  mls: "usa.1",
  bra: "bra.1",
  mx: "mex.1",
  ucl: "uefa.champions",
  uel: "uefa.europa",
  uecl: "uefa.europa.conf",
  int: "fifa.world",
}

const KNOWN_LEAGUE_SLUGS = new Set(Object.values(LEAGUE_SLUGS).filter((value): value is string => Boolean(value)))

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function cacheGet<T>(key: string): { hit: boolean; value?: T } {
  const entry = memoryCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return { hit: false }
  }
  return { hit: true, value: entry.value as T }
}

function cacheSet(key: string, value: unknown, ttl: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttl })
  if (memoryCache.size > 1800) {
    const first = memoryCache.keys().next().value
    if (first) memoryCache.delete(first)
  }
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const existing = cacheGet<T>(key)
  if (existing.hit) return existing.value as T
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const task = (async () => {
    const documentId = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 900)
    try {
      const doc = await getFirebaseAdminFirestore()
        .collection("provider_api_cache")
        .doc(documentId)
        .get()
      const stored = doc.data()
      if (stored && stored.cacheKey === key && typeof stored.expiresAt === "number") {
        if (stored.expiresAt > Date.now()) {
          cacheSet(key, stored.value, stored.expiresAt - Date.now())
          return stored.value as T
        }
        void doc.ref.delete().catch(() => {})
      }
    } catch {
      // The instance-local cache remains usable when Firestore is unavailable.
    }

    const value = await load()
    const effectiveTtl = value === null ? EMPTY_CACHE_MS : ttl
    cacheSet(key, value, effectiveTtl)
    try {
      await getFirebaseAdminFirestore()
        .collection("provider_api_cache")
        .doc(documentId)
        .set({
          cacheKey: key,
          value,
          expiresAt: Date.now() + effectiveTtl,
          cachedAt: Date.now(),
        })
    } catch {
      // Provider data can still be used if cache persistence fails.
    }
    return value
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, task)
  return task
}

function leagueSlug(team: PlayerTeamContext): string | null {
  const supplied = team.feedSlug?.trim()
  if (supplied && KNOWN_LEAGUE_SLUGS.has(supplied)) return supplied
  if (supplied && /^[a-z0-9.-]{1,50}$/.test(supplied)) return supplied
  const rateLeague = team.rateLeague ?? team.league
  return LEAGUE_SLUGS[rateLeague] ?? LEAGUE_SLUGS[team.league] ?? null
}

function seasonFor(date: Date, team: PlayerTeamContext, slug: string): number {
  const year = date.getUTCFullYear()
  const seasonLeague = team.rateLeague && team.rateLeague !== "int" ? team.rateLeague : team.league
  if (
    seasonLeague === "mls" || seasonLeague === "bra" || seasonLeague === "ksa" || seasonLeague === "mx" ||
    ["usa.1", "bra.1", "ksa.1", "mex.1"].includes(slug)
  ) {
    return year
  }
  if (team.league === "int" && slug === "fifa.world") return year
  return date.getUTCMonth() + 1 >= 8 ? year : year - 1
}

function athleteRecord(value: unknown): Dict | null {
  const item = record(value)
  if (!item) return null
  return record(item.athlete) ?? record(item.player) ?? item
}

function isRosterAthlete(value: unknown): boolean {
  const athlete = athleteRecord(value)
  if (!athlete) return false
  const id = numberValue(athlete.id ?? athlete.athleteId ?? athlete.athlete_id)
  const name = stringValue(athlete.fullName ?? athlete.displayName ?? athlete.name ?? athlete.display_name)
  return id !== null && Boolean(name)
}

function rosterEntries(payload: unknown): unknown[] {
  const root = record(payload)
  if (!root) return []

  const result: unknown[] = []
  const seen = new Set<string>()
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value === null || value === undefined) return
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1))
      return
    }
    const item = record(value)
    if (!item) return
    if (isRosterAthlete(item)) {
      const athlete = athleteRecord(item)
      const id = numberValue(athlete?.id ?? athlete?.athleteId ?? athlete?.athlete_id)
      if (id !== null && !seen.has(String(id))) {
        seen.add(String(id))
        result.push(item)
      }
      return
    }
    for (const key of ["athletes", "players", "items", "roster", "entries", "groups"]) {
      if (item[key] !== undefined) visit(item[key], depth + 1)
    }
  }

  visit(root.athletes ?? root.players ?? root.roster ?? root, 0)
  return result
}

async function currentRoster(slug: string, teamId: string): Promise<unknown[] | null> {
  const key = "espn-pro-roster:v1:" + slug + ":" + teamId
  return cached(key, ROSTER_CACHE_MS, async () => {
    const url = ESPN_SITE_BASE + "/" + slug + "/teams/" + teamId + "/roster?limit=500"
    const payload = await getEspnJson(url)
    if (!payload) return null
    const players = rosterEntries(payload)
    return players.length ? players : null
  })
}

function nestedRecord(source: Dict, key: string): Dict | null {
  return record(source[key])
}

function validSlug(value: unknown): string | null {
  const slug = stringValue(value)
  return slug && KNOWN_LEAGUE_SLUGS.has(slug) ? slug : null
}

function playerCompetitionSlug(raw: unknown, fallback: string): string {
  const item = record(raw)
  const athlete = athleteRecord(raw)
  const sources = [
    nestedRecord(item ?? {}, "team"),
    nestedRecord(item ?? {}, "currentTeam"),
    nestedRecord(item ?? {}, "club"),
    nestedRecord(athlete ?? {}, "team"),
    nestedRecord(athlete ?? {}, "currentTeam"),
    nestedRecord(athlete ?? {}, "club"),
    nestedRecord(item ?? {}, "league"),
    nestedRecord(athlete ?? {}, "league"),
  ].filter((value): value is Dict => Boolean(value))

  for (const source of sources) {
    const league = record(source.league)
    const competition = record(source.competition)
    const candidates = [
      source.feedSlug,
      source.leagueSlug,
      source.competitionSlug,
      source.slug,
      league?.slug,
      competition?.slug,
    ]
    for (const candidate of candidates) {
      const slug = validSlug(candidate)
      if (slug) return slug
      if (typeof candidate === "string") {
        const match = candidate.match(/\/sports\/soccer\/([a-z0-9.]+)\/(?:teams|athletes)\//i)
        if (match && validSlug(match[1])) return match[1]
      }
    }
  }
  return fallback
}

async function playerSeasonStats(slug: string, playerId: string, season: number): Promise<Dict | null> {
  const key = "espn-pro-player-stats:v1:" + slug + ":" + playerId + ":" + season
  return cached(key, PLAYER_STATS_CACHE_MS, async () => {
    const base = ESPN_WEB_BASE + "/" + slug + "/athletes/" + playerId
    const stats = await getEspnJson(base + "/stats?season=" + season)
    if (stats) return stats

    // Some ESPN soccer competitions expose the same season snapshot through
    // the athlete overview route rather than the dedicated stats route.
    return getEspnJson(base + "/overview?season=" + season)
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  }))
  return results
}

function balancedProfileOrder(players: SquadPlayer[]): SquadPlayer[] {
  const positions: SquadPlayer["position"][] = ["GK", "DF", "MF", "FW", "UNK"]
  const groups = new Map(positions.map((position) => [
    position,
    players.filter((player) => player.position === position),
  ]))
  const ordered: SquadPlayer[] = []
  let remaining = players.length
  while (remaining > 0) {
    let added = false
    for (const position of positions) {
      const group = groups.get(position)
      const player = group?.shift()
      if (!player) continue
      ordered.push(player)
      remaining -= 1
      added = true
    }
    if (!added) break
  }
  return ordered
}

type TeamSquadLookup = {
  squad: ProTeamSquad | null
  providerUnavailable: boolean
}

async function loadTeamSquad(
  team: PlayerTeamContext,
  teamId: string,
  slug: string,
  date: Date,
): Promise<TeamSquadLookup> {
  const rawPlayers = await currentRoster(slug, teamId)
  if (!rawPlayers?.length) return { squad: null, providerUnavailable: true }

  const emptyStats = new Map<string, PlayerScores>()
  const basePlayers = rawPlayers
    .map((entry) => normaliseSquadPlayer(entry, emptyStats))
    .filter((player): player is SquadPlayer => player !== null)
  if (!basePlayers.length) return { squad: null, providerUnavailable: false }

  const playerRawById = new Map<string, unknown>()
  rawPlayers.forEach((entry) => {
    const athlete = athleteRecord(entry)
    const id = numberValue(athlete?.id ?? athlete?.athleteId ?? athlete?.athlete_id)
    if (id !== null) playerRawById.set(String(id), entry)
  })

  const candidates = balancedProfileOrder(basePlayers).slice(0, MAX_PROFILE_PLAYERS_PER_TEAM)
  const statsRows = await mapWithConcurrency(candidates, PROFILE_CONCURRENCY, async (player) => {
    const raw = playerRawById.get(player.id)
    const statsSlug = playerCompetitionSlug(raw, slug)
    const season = seasonFor(date, team, statsSlug)
    try {
      const profile = await playerSeasonStats(statsSlug, player.id, season)
      return { id: player.id, scores: profile ? deriveEspnPlayerScores(profile) : null }
    } catch {
      return { id: player.id, scores: null }
    }
  })

  const playerStats = new Map<string, PlayerScores>()
  statsRows.forEach((row) => {
    if (row.scores) playerStats.set(row.id, row.scores)
  })

  const players = rawPlayers
    .map((entry) => normaliseSquadPlayer(entry, playerStats))
    .filter((player): player is SquadPlayer => player !== null)
  if (!players.length) return { squad: null, providerUnavailable: false }

  const derived = deriveSquadFactors(players)
  return {
    squad: {
      teamName: team.name,
      squadCount: players.length,
      ratedPlayerCount: derived.factors.ratedPlayers,
      attackIndex: derived.attackIndex,
      creativityIndex: derived.creativityIndex,
      defenceIndex: derived.defenceIndex,
      factors: derived.factors,
    },
    providerUnavailable: false,
  }
}

function resultData(
  status: PlayerDataStatus,
  note: string,
  home: ProTeamSquad | null = null,
  away: ProTeamSquad | null = null,
): ProPlayerData {
  return {
    provider: "ESPN",
    status,
    note,
    home,
    away,
    adjustmentsApplied: Boolean(home?.factors.applied && away?.factors.applied),
  }
}

/**
 * ESPN's current team roster is joined to player-season statistics. The
 * lookup is independent of fixtures, kick-off times, matchday squads and
 * formations. Raw player payloads remain on the server.
 */
export async function getProPlayerData(input: {
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  const homeSlug = leagueSlug(input.home)
  const awaySlug = leagueSlug(input.away)
  if (!input.home.espnId || !input.away.espnId || !homeSlug || !awaySlug) {
    return resultData(
      "team_not_found",
      "ESPN team identity is missing for one or both selected teams. Refresh the live board so Pitchline can use the current ESPN team mapping.",
    )
  }

  if (!/^\d{1,12}$/.test(input.home.espnId) || !/^\d{1,12}$/.test(input.away.espnId)) {
    return resultData("team_not_found", "ESPN returned an invalid team identifier for one or both selected teams.")
  }

  try {
    const now = new Date()
    const [homeLookup, awayLookup] = await Promise.all([
      loadTeamSquad(input.home, input.home.espnId, homeSlug, now),
      loadTeamSquad(input.away, input.away.espnId, awaySlug, now),
    ])
    const home = homeLookup.squad
    const away = awayLookup.squad
    if (!home || !away) {
      const note = homeLookup.providerUnavailable || awayLookup.providerUnavailable
        ? "ESPN did not return a usable current roster for both teams. The Pro simulation will continue with team-level inputs."
        : "ESPN returned a roster without enough identifiable players to calculate squad intelligence. The Pro simulation will continue with team-level inputs."
      return resultData("squad_not_available", note, home, away)
    }

    const bothApplied = home.factors.applied && away.factors.applied
    const coverageNote = [
      input.home.name + " " + home.ratedPlayerCount + "/" + home.squadCount,
      input.away.name + " " + away.ratedPlayerCount + "/" + away.squadCount,
    ].join("; ")

    return resultData(
      bothApplied ? "available" : "partial",
      bothApplied
        ? "ESPN current-roster players have sufficient season-stat coverage on both sides. Pitchline's squad indices are incorporated into the Pro simulation; no matchday starting XI or formation is required."
        : "ESPN returned current rosters, but player-season statistics do not cover enough of both squads to adjust team strength. Player multipliers remain neutral for both teams. Coverage: " + coverageNote + ".",
      home,
      away,
    )
  } catch {
    return resultData(
      "provider_error",
      "ESPN could not provide current roster and player-season data for this matchup. The Pro simulation will use team-level inputs.",
    )
  }
}
