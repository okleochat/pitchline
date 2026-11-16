import "server-only"

import type {
  SportmonksFixture,
  SportmonksFixtureResult,
  SportmonksXgMetric,
  TeamXgForm,
} from "./sportmonks-types"

export type { SportmonksFixture, SportmonksFixtureResult, SportmonksOdd, SportmonksParticipant, SportmonksXgMetric, TeamXgForm } from "./sportmonks-types"

const API_ROOT = "https://api.sportmonks.com/v3/football"
const REQUEST_TIMEOUT_MS = 12_000
const TEAM_FORM_DAYS = 100
const FIXTURE_PAGE_LIMIT = 4
const TEAM_FIXTURE_PAGE_LIMIT = 2
const fixtureCache = new Map<string, { at: number; value: SportmonksFixtureResult }>()
const teamIdCache = new Map<string, { at: number; id: number | null }>()
const teamXgCache = new Map<string, { at: number; games: TeamXgForm[] }>()

export class SportmonksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "SportmonksError"
  }
}

export function sportmonksConfig() {
  const configured = Boolean(process.env.SPORTMONKS_API_TOKEN)
  return {
    configured,
    xgEnabled: configured && process.env.SPORTMONKS_XG_ENABLED === "true",
    oddsEnabled: configured && process.env.SPORTMONKS_ODDS_ENABLED === "true",
  }
}

function datePart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function normaliseTeamName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/\b(the|fc|afc|cf|sc|sv|ac|as|rc|club|football)\b/g, " ")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function metricValue(metric: SportmonksXgMetric): number | null {
  const typeId = Number(metric.type_id ?? metric.type?.id)
  const code = String(metric.type?.code ?? "").toLowerCase()
  if (typeId !== 5304 && code !== "expected-goals") return null
  const value = Number(metric.data?.value)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function completedFixture(fixture: SportmonksFixture): boolean {
  const state = `${fixture.state?.short_name ?? ""} ${fixture.state?.name ?? ""} ${fixture.state?.state ?? ""}`.toLowerCase()
  return /\b(ft|aet|pen|finished|full time|after penalties)\b/.test(state)
}

function xgByLocation(fixture: SportmonksFixture): { home: number; away: number } | null {
  const participants = fixture.participants ?? []
  const homeId = participants.find((participant) => participant.meta?.location === "home")?.id
  const awayId = participants.find((participant) => participant.meta?.location === "away")?.id
  let home: number | null = null
  let away: number | null = null
  for (const metric of fixture.expected ?? fixture.xGFixture ?? fixture.xgfixture ?? []) {
    const value = metricValue(metric)
    if (value === null) continue
    if (homeId !== undefined && metric.participant_id === homeId) home = value
    else if (awayId !== undefined && metric.participant_id === awayId) away = value
    else if (metric.location === "home") home = value
    else if (metric.location === "away") away = value
  }
  return home === null || away === null ? null : { home, away }
}

function authHeaders(): HeadersInit {
  const token = process.env.SPORTMONKS_API_TOKEN
  if (!token) throw new SportmonksError("Sportmonks is not configured. Add SPORTMONKS_API_TOKEN as a Vercel secret.")
  return { accept: "application/json", authorization: token }
}

async function requestJson<T>(url: URL): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: authHeaders(),
      cache: "no-store",
    })
  } catch {
    throw new SportmonksError("Sportmonks could not be reached. Check provider availability and try again.")
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SportmonksError("Sportmonks rejected the configured token or the account does not include a requested add-on.", response.status)
    }
    if (response.status === 429) {
      throw new SportmonksError("Sportmonks request limit reached. Retry after the provider rate-limit window.", response.status)
    }
    throw new SportmonksError(`Sportmonks returned HTTP ${response.status}.`, response.status)
  }
  return await response.json() as T
}

function addDateRange(url: URL, include: string, page = 1) {
  url.searchParams.set("include", include)
  url.searchParams.set("per_page", "50")
  url.searchParams.set("page", String(page))
}

export async function getSportmonksFixtures(start: string, end: string): Promise<SportmonksFixtureResult> {
  const config = sportmonksConfig()
  if (!config.configured) throw new SportmonksError("Sportmonks is not configured. Add SPORTMONKS_API_TOKEN to Vercel.")
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const endTime = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    throw new SportmonksError("Invalid fixture date range.")
  }
  if ((endTime - startTime) / 86_400_000 > 99) {
    throw new SportmonksError("Sportmonks date ranges cannot exceed 100 days.")
  }

  const cacheKey = [start, end, config.xgEnabled, config.oddsEnabled].join(":")
  const hit = fixtureCache.get(cacheKey)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value

  const includes = ["participants", "league", "state"]
  if (config.xgEnabled) includes.push("xGFixture")
  if (config.oddsEnabled) includes.push("odds.bookmaker", "odds.market")

  const fixtures: SportmonksFixture[] = []
  let hasMore = true
  for (let page = 1; page <= FIXTURE_PAGE_LIMIT && hasMore; page += 1) {
    const url = new URL(`${API_ROOT}/fixtures/between/${start}/${end}`)
    addDateRange(url, includes.join(";"), page)
    const body = await requestJson<{
      data?: SportmonksFixture[]
      pagination?: { has_more?: boolean }
      meta?: { pagination?: { has_more?: boolean } }
    }>(url)
    fixtures.push(...(body.data ?? []))
    hasMore = Boolean(body.pagination?.has_more ?? body.meta?.pagination?.has_more)
  }

  const value: SportmonksFixtureResult = {
    ...config,
    fixtures: fixtures.sort((a, b) => Date.parse(a.starting_at ?? "") - Date.parse(b.starting_at ?? "")),
    fetchedAt: new Date().toISOString(),
  }
  fixtureCache.set(cacheKey, { at: Date.now(), value })
  return value
}

async function findTeamId(name: string): Promise<number | null> {
  const key = normaliseTeamName(name)
  const hit = teamIdCache.get(key)
  if (hit && Date.now() - hit.at < 24 * 60 * 60_000) return hit.id

  const url = new URL(`${API_ROOT}/teams/search/${encodeURIComponent(name)}`)
  url.searchParams.set("per_page", "50")
  const body = await requestJson<{ data?: { id?: number; name?: string }[] }>(url)
  const exact = (body.data ?? []).find((team) => team.id && normaliseTeamName(team.name ?? "") === key)
  const id = exact?.id ?? null
  teamIdCache.set(key, { at: Date.now(), id })
  return id
}

async function recentXgForTeam(name: string, start: string, end: string): Promise<TeamXgForm[]> {
  const cacheKey = `${normaliseTeamName(name)}:${start}:${end}`
  const hit = teamXgCache.get(cacheKey)
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.games

  const teamId = await findTeamId(name)
  if (!teamId) return []
  const include = "participants;state;xGFixture"
  const games: TeamXgForm[] = []
  let hasMore = true
  for (let page = 1; page <= TEAM_FIXTURE_PAGE_LIMIT && hasMore; page += 1) {
    const url = new URL(`${API_ROOT}/fixtures/between/${start}/${end}/${teamId}`)
    addDateRange(url, include, page)
    const body = await requestJson<{
      data?: SportmonksFixture[]
      pagination?: { has_more?: boolean }
      meta?: { pagination?: { has_more?: boolean } }
    }>(url)
    for (const fixture of body.data ?? []) {
      if (!completedFixture(fixture)) continue
      const xg = xgByLocation(fixture)
      const participant = fixture.participants?.find((item) => item.id === teamId)
      if (!xg || !participant?.meta?.location) continue
      const values = participant.meta.location === "home"
        ? { xgf: xg.home, xga: xg.away }
        : { xgf: xg.away, xga: xg.home }
      if (fixture.starting_at) games.push({ ...values, date: fixture.starting_at, source: "Sportmonks xG" })
    }
    hasMore = Boolean(body.pagination?.has_more ?? body.meta?.pagination?.has_more)
  }
  games.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const limited = games.slice(0, 10)
  teamXgCache.set(cacheKey, { at: Date.now(), games: limited })
  return limited
}

export async function getRecentTeamXgForm(teamNames: string[]): Promise<Map<string, TeamXgForm[]>> {
  const config = sportmonksConfig()
  const result = new Map<string, TeamXgForm[]>()
  if (!config.xgEnabled || teamNames.length === 0) return result
  const now = new Date()
  const start = datePart(new Date(now.getTime() - TEAM_FORM_DAYS * 86_400_000))
  const end = datePart(now)

  await Promise.all([...new Set(teamNames.filter(Boolean))].map(async (name) => {
    try {
      const games = await recentXgForTeam(name, start, end)
      if (games.length) result.set(name, games)
    } catch {
      // A provider plan or team-coverage gap is a missing value, not zero xG.
    }
  }))
  return result
}
