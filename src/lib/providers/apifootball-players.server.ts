import "server-only"

import type { Team } from "@/data/football"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import {
  buildLineupPlayerStats,
  deriveLineupFactors,
  normaliseLineupPlayer,
} from "@/lib/pro-player-model"
import type {
  LineupPlayer,
  PlayerDataStatus,
  PlayerScores,
  PlayerTeamContext,
  ProPlayerData,
  ProTeamLineup,
  TeamLineupFactors,
} from "@/lib/pro-player-data"

type Dict = Record<string, unknown>
type ApiCacheValue = { expiresAt: number; value: unknown }

const API_BASE = "https://v3.football.api-sports.io"
const TEAM_CACHE_MS = 7 * 24 * 60 * 60 * 1000
const PLAYER_CACHE_MS = 18 * 60 * 60 * 1000
const TEAM_FIXTURE_CACHE_MS = 20 * 60 * 1000
const LINEUP_CACHE_MS = 10 * 60 * 1000
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
  if (apiCache.size > 1200) {
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
    // Firestore keeps the provider cache shared across App Hosting instances.
    // The collection is covered by the default-deny client rules; this runs
    // through Firebase Admin only.
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
      // Local cache remains available if Firestore is temporarily unavailable.
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
      // Do not fail an otherwise valid player lookup because cache persistence failed.
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
  if (response.status === 429) throw new Error("rate_limited")
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
  if (league === "mls" || league === "bra" || league === "ksa") return year
  return date.getUTCMonth() + 1 >= 7 ? year : year - 1
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

type ProviderFixture = {
  id: string
  timestamp: number
  homeId: string
  awayId: string
}

async function findProviderFixture(
  homeTeamId: string,
  awayTeamId: string,
  kickoffAt: string,
): Promise<ProviderFixture | null> {
  const kickoff = new Date(kickoffAt).getTime()
  if (!Number.isFinite(kickoff)) return null
  return cached("team-fixtures:" + homeTeamId, TEAM_FIXTURE_CACHE_MS, async () => {
    const response = await apiRequest("fixtures", { team: homeTeamId, next: "20", timezone: "UTC" })
    return response.flatMap((entry) => {
      const fixture = record(entry)
      const fixtureData = record(fixture?.fixture)
      const sides = record(fixture?.teams)
      const home = record(sides?.home)
      const away = record(sides?.away)
      const id = numberValue(fixtureData?.id)
      const timestamp = numberValue(fixtureData?.timestamp)
      const homeId = numberValue(home?.id)
      const awayId = numberValue(away?.id)
      if (id === null || timestamp === null || homeId === null || awayId === null) return []
      return [{
        id: String(id),
        timestamp,
        homeId: String(homeId),
        awayId: String(awayId),
      }]
    })
  }).then((fixtures) => {
    const matches = fixtures.filter((fixture) =>
      fixture.homeId === homeTeamId && fixture.awayId === awayTeamId
    )
    const near = matches
      .map((fixture) => ({ fixture, distance: Math.abs(fixture.timestamp * 1000 - kickoff) }))
      .filter((entry) => entry.distance <= 36 * 60 * 60 * 1000)
      .sort((left, right) => left.distance - right.distance)
    return near[0]?.fixture ?? null
  })
}

function seasonPlayerResponse(payload: unknown[]): unknown[] {
  return payload
}

type ParsedLineup = {
  teamId: string
  starters: LineupPlayer[]
  substitutes: LineupPlayer[]
  factors: TeamLineupFactors
}

function parseLineupSide(
  value: unknown,
  stats: Map<string, PlayerScores>,
): ParsedLineup | null {
  const row = record(value)
  const team = record(row?.team)
  const teamId = numberValue(team?.id)
  if (teamId === null) return null
  const starts = Array.isArray(row?.startXI) ? row.startXI : []
  const substitutes = Array.isArray(row?.substitutes) ? row.substitutes : []
  const starterPlayers = starts
    .map((player) => normaliseLineupPlayer(player, stats))
    .filter((player): player is LineupPlayer => player !== null)
  const benchPlayers = substitutes
    .map((player) => normaliseLineupPlayer(player, stats))
    .filter((player): player is LineupPlayer => player !== null)
  return {
    teamId: String(teamId),
    starters: starterPlayers,
    substitutes: benchPlayers,
    factors: deriveLineupFactors(starterPlayers, benchPlayers),
  }
}

function averageScore(players: LineupPlayer[], key: "attack" | "creativity" | "defence"): number {
  const values = players
    .map((player) => player.scores?.[key] ?? null)
    .filter((value): value is number => value !== null)
  if (!values.length) return 50
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function publicLineup(teamName: string, lineup: ParsedLineup, applyFactors: boolean): ProTeamLineup {
  const ratedSubs = lineup.substitutes.filter((player) => player.scores !== null).length
  const factors: TeamLineupFactors = applyFactors
    ? lineup.factors
    : {
        ...lineup.factors,
        attackMultiplier: 1,
        creativityMultiplier: 1,
        defenceMultiplier: 1,
        benchStrength: 50,
        applied: false,
      }
  return {
    teamName,
    startingCount: lineup.starters.length,
    ratedStartingCount: lineup.factors.ratedStarters,
    substituteCount: lineup.substitutes.length,
    ratedSubstituteCount: ratedSubs,
    attackIndex: averageScore(lineup.starters, "attack"),
    creativityIndex: averageScore(lineup.starters, "creativity"),
    defenceIndex: averageScore(lineup.starters, "defence"),
    factors,
  }
}

function ratedStarterCount(lineup: ParsedLineup | null): number {
  return lineup?.factors.ratedStarters ?? 0
}

async function playerStatsForTeam(teamId: string, season: number, page: number): Promise<unknown[]> {
  const key = "players:" + teamId + ":" + season + ":" + page
  return cached(key, PLAYER_CACHE_MS, async () => {
    const response = await apiRequest("players", {
      team: teamId,
      season: String(season),
      page: String(page),
    })
    return seasonPlayerResponse(response)
  })
}

function resultData(
  status: PlayerDataStatus,
  note: string,
  home: ProTeamLineup | null = null,
  away: ProTeamLineup | null = null,
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
 * Fetch a specific fixture's lineups and player season metrics. All external
 * requests stay server-side. Provider data is converted to compact derived
 * player scores; raw API payloads and the API key are never returned to clients.
 */
export async function getProPlayerData(input: {
  kickoffAt?: string
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  if (!process.env.API_FOOTBALL_KEY?.trim()) {
    return resultData("not_configured", "Add API_FOOTBALL_KEY as a Firebase App Hosting secret to enable player and lineup intelligence.")
  }
  if (process.env.API_FOOTBALL_DATA_USE_ALLOWED?.toLowerCase() !== "true") {
    return resultData("not_licensed", "The API connection is disabled until permission to use this data in Pitchline Pro and any necessary competition rights have been confirmed.")
  }
  if (!input.kickoffAt || !Number.isFinite(new Date(input.kickoffAt).getTime())) {
    return resultData("fixture_not_selected", "Choose an upcoming Pitchline fixture with a live kick-off timestamp to look up the official team lineups.")
  }

  try {
    const [homeProviderId, awayProviderId] = await Promise.all([
      findProviderTeam(input.home),
      findProviderTeam(input.away),
    ])
    if (!homeProviderId || !awayProviderId) {
      return resultData("team_not_found", "API-Football could not uniquely match one or both teams. The Pro simulation will use team-level inputs for this match.")
    }

    const match = await findProviderFixture(homeProviderId, awayProviderId, input.kickoffAt)
    if (!match) {
      return resultData("match_not_found", "The selected fixture was not found in API-Football's upcoming schedule. The Pro simulation will use team-level inputs.")
    }

    const lineupKey = "lineups:" + match.id
    const rawLineups = await cached<unknown[]>(lineupKey, LINEUP_CACHE_MS, () =>
      apiRequest("fixtures/lineups", { fixture: match.id })
    )
    const lineups = rawLineups
      .map((lineup) => record(lineup))
      .filter((lineup): lineup is Dict => lineup !== null)
    if (!lineups.length) {
      return resultData("lineups_not_available", "The provider has not published lineups for this competition yet. Lineups commonly appear around 20–40 minutes before kick-off when supported.")
    }

    const date = new Date(input.kickoffAt)
    const homeSeason = seasonFor(date, input.home.rateLeague ?? input.home.league)
    const awaySeason = seasonFor(date, input.away.rateLeague ?? input.away.league)
    const [homePageOne, awayPageOne] = await Promise.all([
      playerStatsForTeam(homeProviderId, homeSeason, 1),
      playerStatsForTeam(awayProviderId, awaySeason, 1),
    ])

    let homeStats = buildLineupPlayerStats(homePageOne)
    let awayStats = buildLineupPlayerStats(awayPageOne)
    let homeLineup = parseLineupSide(lineups.find((item) => numberValue(record(record(item)?.team)?.id) === Number(homeProviderId)), homeStats)
    let awayLineup = parseLineupSide(lineups.find((item) => numberValue(record(record(item)?.team)?.id) === Number(awayProviderId)), awayStats)

    if (ratedStarterCount(homeLineup) < 7) {
      const nextPage = await playerStatsForTeam(homeProviderId, homeSeason, 2)
      homeStats = buildLineupPlayerStats([...homePageOne, ...nextPage])
      homeLineup = parseLineupSide(lineups.find((item) => numberValue(record(record(item)?.team)?.id) === Number(homeProviderId)), homeStats)
    }
    if (ratedStarterCount(awayLineup) < 7) {
      const nextPage = await playerStatsForTeam(awayProviderId, awaySeason, 2)
      awayStats = buildLineupPlayerStats([...awayPageOne, ...nextPage])
      awayLineup = parseLineupSide(lineups.find((item) => numberValue(record(record(item)?.team)?.id) === Number(awayProviderId)), awayStats)
    }

    if (!homeLineup || !awayLineup) {
      return resultData("partial", "The fixture was found, but the provider did not return a lineup for both teams.", homeLineup ? publicLineup(input.home.name, homeLineup, false) : null, awayLineup ? publicLineup(input.away.name, awayLineup, false) : null)
    }
    const bothApplied = homeLineup.factors.applied && awayLineup.factors.applied
    return resultData(
      bothApplied ? "available" : "partial",
      bothApplied
        ? "Both starting XIs have enough player-season coverage. Player-derived adjustments are applied to the Pro simulation."
        : "Lineups were found, but there is not enough player-stat coverage across both starting XIs to adjust team strength. The match stays on team-level Pro inputs.",
      publicLineup(input.home.name, homeLineup, bothApplied),
      publicLineup(input.away.name, awayLineup, bothApplied),
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : ""
    const note = reason === "rate_limited"
      ? "API-Football's daily or per-minute request limit was reached. Cached data will be reused when available."
      : "API-Football could not provide player data for this match. The Pro simulation will use team-level inputs."
    return resultData("provider_error", note)
  }
}
