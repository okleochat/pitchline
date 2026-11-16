import "server-only"

import type { Team } from "@/data/football"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import {
  buildPlayerSeasonStats,
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
type ApiCacheValue = { expiresAt: number; value: unknown }

const API_BASE = "https://v3.football.api-sports.io"
const TEAM_CACHE_MS = 7 * 24 * 60 * 60 * 1000
const SQUAD_CACHE_MS = 24 * 60 * 60 * 1000
const PLAYER_CACHE_MS = 18 * 60 * 60 * 1000
const API_WINDOW_MS = 60 * 1000
const API_MAX_REQUESTS_PER_WINDOW = 8
let apiWindowStartedAt = 0
let apiWindowRequestCount = 0
const apiCache = new Map<string, ApiCacheValue>()
const inFlight = new Map<string, Promise<unknown>>()

const COUNTRY_BY_LEAGUE: Partial<Record<Team["league"], string>> = {
  eng: "England",
  ch: "England",
  esp: "Spain",
  ita: "Italy",
  ger: "Germany",
  fra: "France",
  ned: "Netherlands",
  por: "Portugal",
  tur: "Turkey",
  ksa: "Saudi Arabia",
  mls: "USA",
  bra: "Brazil",
  mx: "Mexico",
}

const SEARCH_ALIASES: Record<string, string[]> = {
  Tottenham: ["Tottenham Hotspur"],
  "Inter Milan": ["Inter"],
  "Atletico Madrid": ["Atlético Madrid"],
  "Athletic Club": ["Athletic Bilbao"],
  "Nottingham Forest": ["Nott'm Forest", "Nottingham Forest"],
  "Paris Saint-Germain": ["Paris Saint Germain", "PSG"],
  "Bayern Munich": ["Bayern München"],
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cacheGet<T>(key: string): { hit: boolean; value?: T } {
  const entry = apiCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    apiCache.delete(key)
    return { hit: false }
  }
  return { hit: true, value: entry.value as T }
}

function cacheSet(key: string, value: unknown, ttl: number): void {
  apiCache.set(key, { value, expiresAt: Date.now() + ttl })
  if (apiCache.size > 1600) {
    const first = apiCache.keys().next().value
    if (first) apiCache.delete(first)
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
      // The local cache remains available if Firestore is temporarily unavailable.
    }

    const value = await load()
    cacheSet(key, value, ttl)
    try {
      await getFirebaseAdminFirestore()
        .collection("provider_api_cache")
        .doc(documentId)
        .set({
          cacheKey: key,
          value,
          expiresAt: Date.now() + ttl,
          cachedAt: Date.now(),
        })
    } catch {
      // Cache persistence must not fail an otherwise valid provider lookup.
    }
    return value
  })().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, task)
  return task
}

async function apiRequest(endpoint: string, params: Record<string, string>): Promise<unknown[]> {
  const apiKey = process.env.API_FOOTBALL_KEY?.trim()
  if (!apiKey) throw new Error("not_configured")

  // API-Football's Free plan allows 10 requests/minute. Keep a small safety
  // margin per App Hosting instance; deferred lookups are resumed from cache
  // on the next client refresh rather than bursting and risking a 429.
  const now = Date.now()
  if (now - apiWindowStartedAt >= API_WINDOW_MS) {
    apiWindowStartedAt = now
    apiWindowRequestCount = 0
  }
  if (apiWindowRequestCount >= API_MAX_REQUESTS_PER_WINDOW) {
    throw new Error("request_deferred")
  }
  apiWindowRequestCount += 1

  const url = new URL(API_BASE + "/" + endpoint.replace(/^\//, ""))
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { "x-apisports-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
  } catch {
    throw new Error("provider_unavailable")
  }
  if (response.status === 429) throw new Error("request_deferred")
  if (!response.ok) throw new Error("provider_unavailable")

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("invalid_provider_response")
  }
  const root = record(payload)
  if (!root || !Array.isArray(root.response)) throw new Error("invalid_provider_response")
  const errors = record(root.errors)
  if (errors && Object.values(errors).some((value) => Boolean(value))) {
    const values = Object.values(errors).map(String).join(" ")
    if (/rate limit|requests limit/i.test(values)) throw new Error("rate_limited")
    throw new Error("provider_unavailable")
  }
  return root.response
}

function seasonFor(date: Date, league: Team["league"]): number {
  const year = date.getUTCFullYear()
  if (league === "mls" || league === "bra" || league === "ksa" || league === "mx") return year
  return date.getUTCMonth() + 1 >= 8 ? year : year - 1
}

function playerPerformanceSeason(date: Date, team: PlayerTeamContext): number {
  // National-team squad members need their club-season records, not just their
  // comparatively sparse appearances for the national side.
  if (team.league === "int") return seasonFor(date, "eng")
  return seasonFor(date, team.rateLeague ?? team.league)
}

async function findProviderTeam(team: PlayerTeamContext): Promise<string | null> {
  const rateLeague = team.rateLeague ?? team.league
  const country = COUNTRY_BY_LEAGUE[rateLeague]
  const names = [team.name, ...(SEARCH_ALIASES[team.name] ?? [])]
  for (const search of names) {
    const key = "team:" + normaliseName(search) + ":" + (country ?? "")
    const id = await cached<string | null>(key, TEAM_CACHE_MS, async () => {
      const response = await apiRequest("teams", {
        search,
        ...(country ? { country } : {}),
      })
      const candidates = response.flatMap((entry) => {
        const teamRecord = record(record(entry)?.team)
        const candidateName = stringValue(teamRecord?.name)
        const candidateId = numberValue(teamRecord?.id)
        const candidateCountry = stringValue(teamRecord?.country)
        if (!candidateName || candidateId === null) return []
        return [{ id: String(candidateId), name: candidateName, country: candidateCountry }]
      })
      const normalised = normaliseName(search)
      const exact = candidates.filter((candidate) => normaliseName(candidate.name) === normalised)
      const countryMatch = country
        ? exact.filter((candidate) => normaliseName(candidate.country ?? "") === normaliseName(country))
        : exact
      const chosen = countryMatch.length === 1 ? countryMatch[0]
        : exact.length === 1 ? exact[0]
          : candidates.length === 1 ? candidates[0] : null
      return chosen?.id ?? null
    })
    if (id) return id
  }
  return null
}

async function squadResponse(teamId: string): Promise<unknown[]> {
  return cached("squad:" + teamId, SQUAD_CACHE_MS, () =>
    apiRequest("players/squads", { team: teamId })
  )
}

async function playerStatsForTeam(teamId: string, season: number, page: number): Promise<unknown[]> {
  const key = "players-team:" + teamId + ":" + season + ":" + page
  return cached(key, PLAYER_CACHE_MS, () => apiRequest("players", {
    team: teamId,
    season: String(season),
    page: String(page),
  }))
}

async function playerStatsForPlayer(playerId: string, season: number): Promise<unknown[]> {
  const key = "player-profile:" + playerId + ":" + season
  return cached(key, PLAYER_CACHE_MS, () => apiRequest("players", {
    id: playerId,
    season: String(season),
  }))
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

function squadEntries(response: unknown[], teamId: string): unknown[] {
  const matchingTeam = response
    .map((entry) => record(entry))
    .find((entry) => numberValue(record(entry?.team)?.id) === Number(teamId))
  if (Array.isArray(matchingTeam?.players)) return matchingTeam.players
  if (response.length === 1) {
    const only = record(response[0])
    if (Array.isArray(only?.players)) return only.players
  }
  return []
}

async function statsForSquad(
  team: PlayerTeamContext,
  teamId: string,
  players: SquadPlayer[],
  season: number,
): Promise<Map<string, PlayerScores>> {
  if (team.league === "int") {
    // A national team's own match sample is too small for many players. Pull
    // each announced squad member's club-season statistics by player ID.
    const profiles = await mapWithConcurrency(players, 4, (player) =>
      playerStatsForPlayer(player.id, season)
    )
    return buildPlayerSeasonStats(profiles.flat())
  }

  const firstPage = await playerStatsForTeam(teamId, season, 1)
  const rows = [...firstPage]
  // API-Football returns 20 player records per page. Only fetch a second page
  // when the first page is full, which keeps quota use lower for small teams.
  if (firstPage.length >= 20) {
    const secondPage = await playerStatsForTeam(teamId, season, 2)
    rows.push(...secondPage)
  }

  // If a club is still early in its season, use the previous season only for
  // squad members missing from current-season records. Current-season records
  // always take priority when both are available.
  const stats = buildPlayerSeasonStats(rows)
  const ratedCount = players.filter((player) => stats.has(player.id)).length
  if (ratedCount < 8 && season > 2000) {
    const previousFirstPage = await playerStatsForTeam(teamId, season - 1, 1)
    const previousRows = [...previousFirstPage]
    if (previousFirstPage.length >= 20) {
      previousRows.push(...await playerStatsForTeam(teamId, season - 1, 2))
    }
    const previousStats = buildPlayerSeasonStats(previousRows)
    for (const [playerId, score] of previousStats) {
      if (!stats.has(playerId)) stats.set(playerId, score)
    }
  }
  return stats
}

async function loadTeamSquad(
  team: PlayerTeamContext,
  teamId: string,
  date: Date,
): Promise<ProTeamSquad | null> {
  const rawResponse = await squadResponse(teamId)
  const rawPlayers = squadEntries(rawResponse, teamId)
  const emptyStats = new Map<string, PlayerScores>()
  const basePlayers = rawPlayers
    .map((entry) => normaliseSquadPlayer(entry, emptyStats))
    .filter((player): player is SquadPlayer => player !== null)
  if (!basePlayers.length) return null

  const season = playerPerformanceSeason(date, team)
  const playerStats = await statsForSquad(team, teamId, basePlayers, season)
  const players = rawPlayers
    .map((entry) => normaliseSquadPlayer(entry, playerStats))
    .filter((player): player is SquadPlayer => player !== null)
  if (!players.length) return null

  const derived = deriveSquadFactors(players)
  return {
    teamName: team.name,
    squadCount: players.length,
    ratedPlayerCount: derived.factors.ratedPlayers,
    attackIndex: derived.attackIndex,
    creativityIndex: derived.creativityIndex,
    defenceIndex: derived.defenceIndex,
    factors: derived.factors,
  }
}

function resultData(
  status: PlayerDataStatus,
  note: string,
  home: ProTeamSquad | null = null,
  away: ProTeamSquad | null = null,
): ProPlayerData {
  return {
    provider: "API-Football",
    status,
    note,
    home,
    away,
    adjustmentsApplied: Boolean(home?.factors.applied && away?.factors.applied),
  }
}

/**
 * Fetch each team's current registered squad and join it to player-season
 * performance data. This does not look up a fixture or require matchday
 * lineups. All raw provider responses and credentials remain server-side.
 */
export async function getProPlayerData(input: {
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  if (!process.env.API_FOOTBALL_KEY?.trim()) {
    return resultData("not_configured", "Add API_FOOTBALL_KEY as a Firebase App Hosting secret to enable player and squad intelligence.")
  }
  if (process.env.API_FOOTBALL_DATA_USE_ALLOWED?.toLowerCase() !== "true") {
    return resultData("not_licensed", "The API connection is disabled until permission to use this data in Pitchline Pro and any necessary competition rights have been confirmed.")
  }

  try {
    const [homeProviderId, awayProviderId] = await Promise.all([
      findProviderTeam(input.home),
      findProviderTeam(input.away),
    ])
    if (!homeProviderId || !awayProviderId) {
      return resultData("team_not_found", "API-Football could not uniquely match one or both teams. The Pro simulation will use team-level inputs.")
    }

    const now = new Date()
    const [home, away] = await Promise.all([
      loadTeamSquad(input.home, homeProviderId, now),
      loadTeamSquad(input.away, awayProviderId, now),
    ])
    if (!home || !away) {
      return resultData(
        "squad_not_available",
        "The provider could not return a registered squad for both teams. The Pro simulation will use team-level inputs.",
        home,
        away,
      )
    }

    const bothApplied = home.factors.applied && away.factors.applied
    const coverageNote = [
      input.home.name + " " + home.ratedPlayerCount + "/" + home.squadCount,
      input.away.name + " " + away.ratedPlayerCount + "/" + away.squadCount,
    ].join("; ")
    return resultData(
      bothApplied ? "available" : "partial",
      bothApplied
        ? "Player-season data from both registered squads is incorporated into the Pro simulation. No matchday starting XI or formation is required."
        : "The registered squads were found, but player-season statistics do not cover enough of both squads to adjust team strength. The model keeps player multipliers neutral. Coverage: " + coverageNote + ".",
      home,
      away,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : ""
    const note = reason === "rate_limited"
      ? "API-Football's daily or per-minute request limit was reached. Cached squad and player records will be reused when available."
      : "API-Football could not provide registered squad and player-season data. The Pro simulation will use team-level inputs."
    return resultData("provider_error", note)
  }
}
