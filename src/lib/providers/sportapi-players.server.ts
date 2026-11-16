import "server-only"

import type { LeagueId } from "@/data/football"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import {
  deriveSportApiPlayerScores,
  deriveSquadFactors,
  normaliseSquadPlayer,
} from "@/lib/pro-player-model"
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
type ProviderResponse = {
  status: number
  data: Dict | null
  dailyRemaining: string | null
  monthlyRemaining: string | null
}
type ResolvedTeam = {
  id: string
  players: unknown[]
}
type SeasonWindow = {
  start: string
  end: string
}

const SPORTAPI_BASE = "https://sportapi.ai/api"
const TEAM_CACHE_MS = 12 * 60 * 60 * 1000
const PLAYER_STATS_CACHE_MS = 8 * 60 * 60 * 1000
const EMPTY_CACHE_MS = 15 * 60 * 1000
const MAX_PROFILE_PLAYERS_PER_TEAM = 22
const PROFILE_CONCURRENCY = 4
const memoryCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

const TEAM_SLUG_OVERRIDES: Record<string, string[]> = {
  "tottenham": ["tottenham-hotspur", "tottenham"],
  "inter": ["inter", "inter-milan", "internazionale"],
  "milan": ["ac-milan", "milan"],
  "dortmund": ["borussia-dortmund", "dortmund"],
  "leverkusen": ["bayer-leverkusen", "leverkusen"],
  "bayern munich": ["bayern-munich", "bayern"],
  "gladbach": ["borussia-monchengladbach", "monchengladbach"],
  "mainz": ["mainz-05", "mainz"],
  "paris saint germain": ["paris-saint-germain", "psg"],
  "racing santander": ["racing-santander", "racing-de-santander"],
  "deportivo": ["deportivo-la-coruna", "deportivo"],
  "athletic club": ["athletic-club", "athletic-bilbao"],
  "atletico madrid": ["atletico-madrid", "atletico"],
  "real sociedad": ["real-sociedad"],
  "barcelona": ["barcelona", "fc-barcelona"],
  "manchester united": ["manchester-united"],
  "manchester city": ["manchester-city"],
  "newcastle": ["newcastle-united", "newcastle"],
  "brighton": ["brighton-and-hove-albion", "brighton"],
  "nottingham forest": ["nottingham-forest", "nottm-forest"],
  "paris fc": ["paris-fc"],
}

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

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(value: string): string {
  return foldName(value).replace(/\s+/g, "-")
}

function teamSlugCandidates(name: string): string[] {
  const folded = foldName(name)
  const aliases = TEAM_SLUG_OVERRIDES[folded] ?? []
  return [...new Set([...aliases, slugify(name)].filter(Boolean))]
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
  if (memoryCache.size > 2200) {
    const first = memoryCache.keys().next().value
    if (first) memoryCache.delete(first)
  }
}

async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
  isEmpty: (value: T) => boolean = (value) => value === null,
): Promise<T> {
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
      // Instance-local caching remains available when Firestore is unavailable.
    }

    const value = await load()
    const effectiveTtl = isEmpty(value) ? EMPTY_CACHE_MS : ttl
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
      // Provider data can still be used when cache persistence fails.
    }
    return value
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, task)
  return task
}

async function sportApiGet(path: string, apiKey: string): Promise<ProviderResponse> {
  try {
    const response = await fetch(SPORTAPI_BASE + path, {
      signal: AbortSignal.timeout(9000),
      headers: {
        accept: "application/json",
        "X-Api-Key": apiKey,
      },
      cache: "no-store",
    })
    const dailyRemaining = response.headers.get("X-RateLimit-Remaining")
    const monthlyRemaining = response.headers.get("X-RateLimit-Month-Remaining")
    if (!response.ok) {
      return {
        status: response.status,
        data: null,
        dailyRemaining,
        monthlyRemaining,
      }
    }
    const payload: unknown = await response.json()
    const outer = record(payload)
    if (!outer || outer.success === false) {
      return {
        status: response.status,
        data: null,
        dailyRemaining,
        monthlyRemaining,
      }
    }
    return { status: response.status, data: outer, dailyRemaining, monthlyRemaining }
  } catch {
    return { status: 0, data: null, dailyRemaining: null, monthlyRemaining: null }
  }
}

function responsePayload(value: Dict): Dict {
  return record(value.data) ?? value
}

function seasonWindow(date: Date, team: PlayerTeamContext): SeasonWindow {
  const league = team.rateLeague ?? team.league
  const year = date.getUTCFullYear()
  const calendarSeason: LeagueId[] = ["mls", "bra", "mx", "int"]
  if (calendarSeason.includes(league)) {
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    }
  }

  const startYear = date.getUTCMonth() >= 7 ? year : year - 1
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
  }
}

function providerRoster(value: Dict): ResolvedTeam | null {
  const payload = responsePayload(value)
  const team = record(payload.team) ?? payload
  const id = numberValue(team.id)
  const rawPlayers = Array.isArray(payload.squad)
    ? payload.squad
    : Array.isArray(team.squad)
      ? team.squad
      : []
  if (id === null || !rawPlayers.length) return null

  const players = rawPlayers.filter((entry) => {
    const item = record(entry)
    return numberValue(item?.id) !== null &&
      Boolean(stringValue(item?.full_name ?? item?.name ?? item?.display_name))
  })
  return players.length ? { id: String(id), players } : null
}

async function resolveTeam(
  team: PlayerTeamContext,
  apiKey: string,
): Promise<{ team: ResolvedTeam | null; statuses: number[] }> {
  const statuses: number[] = []
  for (const slug of teamSlugCandidates(team.name)) {
    const response = await cached(
      "sportapi-team-slug:v1:" + slug,
      TEAM_CACHE_MS,
      () => sportApiGet("/teams/slug/" + encodeURIComponent(slug), apiKey),
      (value) => value.data === null,
    )
    statuses.push(response.status)
    if (!response.data) continue

    const resolved = providerRoster(response.data)
    if (resolved) return { team: resolved, statuses }

    const payload = responsePayload(response.data)
    const teamRecord = record(payload.team) ?? payload
    const teamId = numberValue(teamRecord.id)
    if (teamId === null) continue

    const squadResponse = await cached(
      "sportapi-team-squad:v1:" + teamId,
      TEAM_CACHE_MS,
      () => sportApiGet("/teams/" + teamId + "/squad", apiKey),
      (value) => value.data === null,
    )
    statuses.push(squadResponse.status)
    if (!squadResponse.data) continue
    const squadPayload = responsePayload(squadResponse.data)
    const players = Array.isArray(squadPayload.squad) ? squadPayload.squad : []
    const usable = players.filter((entry) => {
      const item = record(entry)
      return numberValue(item?.id) !== null &&
        Boolean(stringValue(item?.full_name ?? item?.name ?? item?.display_name))
    })
    if (usable.length) return { team: { id: String(teamId), players: usable }, statuses }
  }

  return { team: null, statuses }
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
  apiKey: string,
  date: Date,
): Promise<TeamSquadLookup> {
  const resolved = await resolveTeam(team, apiKey)
  if (!resolved.team) {
    console.warn("[Pitchline SportAPI] Team squad unavailable", {
      team: team.name,
      competition: team.rateLeague ?? team.league,
      httpStatuses: resolved.statuses,
    })
    return { squad: null, providerUnavailable: true }
  }

  const emptyStats = new Map<string, PlayerScores>()
  const basePlayers = resolved.team.players
    .map((entry) => normaliseSquadPlayer(entry, emptyStats))
    .filter((player): player is SquadPlayer => player !== null)
  if (!basePlayers.length) return { squad: null, providerUnavailable: false }

  const minimumRatedRequired = Math.max(12, Math.ceil(basePlayers.length * 0.6))
  const profileBudget = Math.min(
    MAX_PROFILE_PLAYERS_PER_TEAM,
    basePlayers.length,
    minimumRatedRequired + 2,
  )
  const candidates = balancedProfileOrder(basePlayers).slice(0, profileBudget)
  const window = seasonWindow(date, team)
  const statsRows = await mapWithConcurrency(candidates, PROFILE_CONCURRENCY, async (player) => {
    const raw = resolved.team?.players.find((entry) => {
      const item = record(entry)
      return String(item?.id ?? "") === player.id
    })
    const row = record(raw)
    const playerName = stringValue(row?.full_name ?? row?.name ?? row?.display_name) ?? player.name
    const shirt = numberValue(row?.jersey_number ?? row?.shirt_number ?? row?.number ?? row?.jersey)
    const query = new URLSearchParams({
      name: playerName,
      team_id: resolved.team?.id ?? "",
    })
    if (shirt !== null) query.set("shirt_number", String(shirt))

    const cacheKey = [
      "sportapi-player-matchlog:v1",
      resolved.team?.id,
      player.id,
      window.start,
    ].join(":")
    const response = await cached(
      cacheKey,
      PLAYER_STATS_CACHE_MS,
      () => sportApiGet("/players/stats?" + query.toString(), apiKey),
      (value) => value.data === null || !Array.isArray(responsePayload(value.data).matches) ||
        (responsePayload(value.data).matches as unknown[]).length === 0,
    )
    const payload = response.data ? responsePayload(response.data) : null
    return {
      id: player.id,
      status: response.status,
      scores: response.data ? deriveSportApiPlayerScores(response.data, window.start, window.end) : null,
      matchRows: Array.isArray(payload?.matches) ? payload.matches.length : 0,
      dailyRemaining: response.dailyRemaining,
      monthlyRemaining: response.monthlyRemaining,
    }
  })

  const playerStats = new Map<string, PlayerScores>()
  const statusCounts = new Map<number, number>()
  let matchRows = 0
  const dailyRemaining = statsRows.map((row) => row.dailyRemaining)
    .filter((value): value is string => value !== null)
  const monthlyRemaining = statsRows.map((row) => row.monthlyRemaining)
    .filter((value): value is string => value !== null)
  statsRows.forEach((row) => {
    if (row.scores) playerStats.set(row.id, row.scores)
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
    matchRows += row.matchRows
  })

  console.info("[Pitchline SportAPI] Player-stat lookup", {
    competition: team.rateLeague ?? team.league,
    team: team.name,
    teamId: resolved.team.id,
    rosterSize: basePlayers.length,
    attempted: candidates.length,
    rated: playerStats.size,
    matchRows,
    httpStatuses: Object.fromEntries(statusCounts),
    dailyRequestsRemaining: dailyRemaining.at(-1) ?? null,
    monthlyRequestsRemaining: monthlyRemaining.at(-1) ?? null,
    seasonStart: window.start,
    seasonEnd: window.end,
  })

  const players = resolved.team.players
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

function resultData(
  status: PlayerDataStatus,
  note: string,
  home: ProTeamSquad | null = null,
  away: ProTeamSquad | null = null,
): ProPlayerData {
  return {
    provider: "SportAPI.ai",
    status,
    note,
    home,
    away,
    adjustmentsApplied: Boolean(home?.factors.applied && away?.factors.applied),
  }
}

/**
 * Current provider squads are joined to this-season match-level player
 * statistics. Career totals are intentionally ignored by the score model.
 * Player records and API credentials remain server-side.
 */
export async function getProPlayerData(input: {
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  const apiKey = process.env.SPORTAPI_API_KEY?.trim()
  if (!apiKey) {
    return resultData(
      "provider_error",
      "SportAPI.ai is not configured yet. Add the SPORTAPI_API_KEY secret to Firebase App Hosting to enable free player and squad statistics.",
    )
  }

  try {
    const now = new Date()
    const [homeLookup, awayLookup] = await Promise.all([
      loadTeamSquad(input.home, apiKey, now),
      loadTeamSquad(input.away, apiKey, now),
    ])
    const home = homeLookup.squad
    const away = awayLookup.squad

    if (!home || !away) {
      const note = homeLookup.providerUnavailable || awayLookup.providerUnavailable
        ? "SportAPI.ai could not match both teams to a current squad. The Pro simulation will continue with team-level inputs."
        : "SportAPI.ai returned incomplete squad records. The Pro simulation will continue with team-level inputs."
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
        ? "SportAPI.ai supplied sufficient current-season player match data for both squads. Pitchline's player-derived indices are incorporated into the Pro simulation."
        : "SportAPI.ai returned current squads, but dated player match statistics do not cover enough of both squads. Player multipliers remain neutral for both teams. Coverage: " + coverageNote + ".",
      home,
      away,
    )
  } catch {
    return resultData(
      "provider_error",
      "SportAPI.ai could not provide current squad and player-match data for this matchup. The Pro simulation will continue with team-level inputs.",
    )
  }
}
