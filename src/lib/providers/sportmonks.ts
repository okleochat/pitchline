import "server-only"

export type SportmonksParticipant = {
  id?: number
  name?: string
  short_code?: string | null
  meta?: { location?: "home" | "away" | string }
}

export type SportmonksXgMetric = {
  location?: "home" | "away" | string
  type?: { name?: string; code?: string }
  data?: { value?: number | string }
}

export type SportmonksOdd = {
  id?: number
  fixture_id?: number
  market_id?: number
  bookmaker_id?: number
  label?: string
  value?: string
  name?: string
  market_description?: string
  latest_bookmaker_update?: string
  bookmaker?: { name?: string }
  market?: { name?: string; description?: string }
}

export type SportmonksFixture = {
  id: number
  name?: string
  starting_at?: string
  participants?: SportmonksParticipant[]
  league?: { name?: string }
  state?: { name?: string; short_name?: string; state?: string }
  xgfixture?: SportmonksXgMetric[]
  odds?: SportmonksOdd[]
  scores?: unknown[]
}

export type SportmonksFixtureResult = {
  configured: boolean
  xgEnabled: boolean
  oddsEnabled: boolean
  fixtures: SportmonksFixture[]
  fetchedAt: string
}

export type TeamXgForm = { xgf: number; xga: number; date: string }

const API_ROOT = "https://api.sportmonks.com/v3/football"
const REQUEST_TIMEOUT_MS = 12_000
const TEAM_FORM_DAYS = 100
const PAGE_LIMIT = 4
const cache = new Map<string, { at: number; value: SportmonksFixtureResult }>()

export class SportmonksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "SportmonksError"
  }
}

export function sportmonksConfig() {
  return {
    configured: Boolean(process.env.SPORTMONKS_API_TOKEN),
    xgEnabled: Boolean(process.env.SPORTMONKS_API_TOKEN) && process.env.SPORTMONKS_XG_ENABLED === "true",
    oddsEnabled: Boolean(process.env.SPORTMONKS_API_TOKEN) && process.env.SPORTMONKS_ODDS_ENABLED === "true",
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
  const code = String(metric.type?.code ?? "").toLowerCase()
  if (code !== "expected-goals") return null
  const value = Number(metric.data?.value)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function completedFixture(fixture: SportmonksFixture): boolean {
  const state = `${fixture.state?.short_name ?? ""} ${fixture.state?.name ?? ""} ${fixture.state?.state ?? ""}`.toLowerCase()
  return /\b(ft|aet|pen|finished|full time|after penalties)\b/.test(state)
}

function xgByLocation(fixture: SportmonksFixture): { home: number; away: number } | null {
  let home: number | null = null
  let away: number | null = null
  for (const metric of fixture.xgfixture ?? []) {
    const value = metricValue(metric)
    if (value === null) continue
    if (metric.location === "home") home = value
    if (metric.location === "away") away = value
  }
  return home === null || away === null ? null : { home, away }
}

export async function getSportmonksFixtures(start: string, end: string): Promise<SportmonksFixtureResult> {
  const config = sportmonksConfig()
  if (!config.configured) {
    throw new SportmonksError("Sportmonks is not configured. Add SPORTMONKS_API_TOKEN to Vercel.")
  }
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const endTime = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    throw new SportmonksError("Invalid fixture date range.")
  }
  if ((endTime - startTime) / 86_400_000 > 99) {
    throw new SportmonksError("Sportmonks date ranges cannot exceed 100 days.")
  }

  const cacheKey = [start, end, config.xgEnabled, config.oddsEnabled].join(":")
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value

  const token = process.env.SPORTMONKS_API_TOKEN!
  const includes = ["participants", "league", "state"]
  if (config.xgEnabled) includes.push("xGFixture")
  if (config.oddsEnabled) includes.push("odds.bookmaker", "odds.market")

  const fixtures: SportmonksFixture[] = []
  let hasMore = true
  for (let page = 1; page <= PAGE_LIMIT && hasMore; page += 1) {
    const url = new URL(`${API_ROOT}/fixtures/between/${start}/${end}`)
    url.searchParams.set("api_token", token)
    url.searchParams.set("include", includes.join(";"))
    url.searchParams.set("per_page", "50")
    url.searchParams.set("page", String(page))

    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" })
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

    const body = await response.json() as {
      data?: SportmonksFixture[]
      pagination?: { has_more?: boolean }
      meta?: { pagination?: { has_more?: boolean } }
    }
    fixtures.push(...(body.data ?? []))
    hasMore = Boolean(body.pagination?.has_more ?? body.meta?.pagination?.has_more)
  }

  const result: SportmonksFixtureResult = {
    ...config,
    fixtures: fixtures.sort((a, b) => Date.parse(a.starting_at ?? "") - Date.parse(b.starting_at ?? "")),
    fetchedAt: new Date().toISOString(),
  }
  cache.set(cacheKey, { at: Date.now(), value: result })
  return result
}

export async function getRecentTeamXgForm(teamNames: string[]): Promise<Map<string, TeamXgForm[]>> {
  const config = sportmonksConfig()
  const result = new Map<string, TeamXgForm[]>()
  if (!config.xgEnabled || teamNames.length === 0) return result

  const now = new Date()
  const start = datePart(new Date(now.getTime() - TEAM_FORM_DAYS * 86_400_000))
  const end = datePart(now)
  const response = await getSportmonksFixtures(start, end)
  const requested = new Map(teamNames.map((name) => [normaliseTeamName(name), name]))
  const byTeam = new Map<string, TeamXgForm[]>()

  for (const fixture of response.fixtures) {
    if (!completedFixture(fixture)) continue
    const xg = xgByLocation(fixture)
    if (!xg) continue
    const participants = fixture.participants ?? []
    const home = participants.find((participant) => participant.meta?.location === "home")
    const away = participants.find((participant) => participant.meta?.location === "away")
    if (!home?.name || !away?.name) continue
    const kickoff = fixture.starting_at ?? ""
    const rows = [
      { name: home.name, xgf: xg.home, xga: xg.away },
      { name: away.name, xgf: xg.away, xga: xg.home },
    ]
    for (const row of rows) {
      const key = normaliseTeamName(row.name)
      const canonical = requested.get(key)
      if (!canonical) continue
      const entries = byTeam.get(canonical) ?? []
      entries.push({ xgf: row.xgf, xga: row.xga, date: kickoff })
      byTeam.set(canonical, entries)
    }
  }

  for (const [name, rows] of byTeam) {
    rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    result.set(name, rows.slice(0, 10))
  }
  return result
}

function weightedAverage(values: number[]): number {
  if (!values.length) return 0
  let weightTotal = 0
  let valueTotal = 0
  values.forEach((value, index) => {
    const weight = Math.exp((-Math.LN2 * index) / 2.5)
    weightTotal += weight
    valueTotal += value * weight
  })
  return Math.round((valueTotal / (weightTotal || 1)) * 100) / 100
}

export async function attachTeamXgMetrics<T extends {
  name: string
  xgFor?: number
  xgAgainst?: number
  xgSource?: string
}>(teams: T[]): Promise<T[]> {
  const config = sportmonksConfig()
  if (!config.xgEnabled || teams.length === 0) return teams
  try {
    const form = await getRecentTeamXgForm(teams.map((team) => team.name))
    return teams.map((team) => {
      const games = form.get(team.name) ?? []
      if (games.length < 5) return team
      return {
        ...team,
        xgFor: weightedAverage(games.map((game) => game.xgf)),
        xgAgainst: weightedAverage(games.map((game) => game.xga)),
        xgSource: `Sportmonks xG · last ${games.length} completed matches`,
      }
    })
  } catch {
    // Provider outages must never take the board offline or cause fabricated xG values.
    return teams
  }
}
