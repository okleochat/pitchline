import "server-only"

import { getEspnJson } from "@/lib/espn/transport.server"
import { INTERNATIONAL_COMPETITIONS, type CompetitionSource } from "./competitions"

type Dict = Record<string, unknown>

export type InternationalFixture = {
  id: string
  kickoff: string
  competition: string
  region: string
  home: { name: string; abbreviation: string | null; logo: string | null }
  away: { name: string; abbreviation: string | null; logo: string | null }
  status: string
  statusState: string
  completed: boolean
  score: { home: number | null; away: number | null }
}

export type InternationalFixtureResponse = {
  date: string
  source: "ESPN"
  fixtures: InternationalFixture[]
  competitionsChecked: number
  competitionsUnavailable: string[]
  partial: boolean
}



const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const LIVE_CACHE_TTL_MS = 2 * 60 * 1000
const OTHER_DATE_CACHE_TTL_MS = 10 * 60 * 1000
const responseCache = new Map<string, { expiresAt: number; value: InternationalFixtureResponse }>()

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

function eventStatus(event: Dict, competition: Dict): { label: string; state: string; completed: boolean } {
  const status = record(competition.status) ?? record(event.status)
  const type = record(status?.type)
  const label =
    stringValue(type?.detail) ??
    stringValue(type?.shortDetail) ??
    stringValue(type?.description) ??
    stringValue(status?.description) ??
    "Scheduled"
  return {
    label,
    state: stringValue(type?.state) ?? "pre",
    completed: type?.completed === true || type?.state === "post",
  }
}

function teamSide(value: unknown): InternationalFixture["home"] | null {
  const competitor = record(value)
  const team = record(competitor?.team)
  if (!team) return null

  const logos = Array.isArray(team.logos) ? team.logos : []
  const firstLogo = record(logos[0])
  const logo = stringValue(firstLogo?.href) ?? stringValue(team.logo)

  return {
    name: stringValue(team.displayName) ?? stringValue(team.name) ?? "Unknown team",
    abbreviation: stringValue(team.abbreviation),
    logo,
  }
}

function mapEvent(value: unknown, source: CompetitionSource): InternationalFixture | null {
  const event = record(value)
  if (!event) return null

  const kickoffValue = stringValue(event.date)
  const kickoffDate = kickoffValue ? new Date(kickoffValue) : null
  if (!kickoffDate || !Number.isFinite(kickoffDate.getTime())) return null

  const competition = record((event.competitions as unknown[] | undefined)?.[0])
  const competitors = (competition?.competitors as unknown[] | undefined) ?? []
  const homeCompetitor = competitors.map(record).find((side) => side?.homeAway === "home")
  const awayCompetitor = competitors.map(record).find((side) => side?.homeAway === "away")
  const home = teamSide(homeCompetitor)
  const away = teamSide(awayCompetitor)
  if (!home || !away) return null

  const eventId = stringValue(event.id)
  if (!eventId) return null

  const status = eventStatus(event, competition ?? {})
  return {
    id: eventId,
    kickoff: kickoffDate.toISOString(),
    competition: source.name,
    region: source.confederation,
    home,
    away,
    status: status.label,
    statusState: status.state,
    completed: status.completed,
    score: {
      home: numberValue(homeCompetitor?.score),
      away: numberValue(awayCompetitor?.score),
    },
  }
}

async function fetchCompetition(date: string, source: CompetitionSource) {
  const compactDate = date.replaceAll("-", "")
  const url = ESPN_SCOREBOARD + "/" + source.slug + "/scoreboard?dates=" + compactDate
  return getEspnJson(url)
}

/** Load senior international tournament and qualifier fixtures from ESPN. */
export async function getInternationalFixtures(date: string): Promise<InternationalFixtureResponse> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) {
    throw new Error("A valid YYYY-MM-DD date is required.")
  }

  const cached = responseCache.get(date)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const boards = await Promise.all(
    INTERNATIONAL_COMPETITIONS.map(async (source) => ({
      source,
      board: await fetchCompetition(date, source),
    })),
  )

  const successful = boards.filter((item) => item.board !== null)
  if (successful.length === 0) {
    throw new Error("ESPN's international competition feed is temporarily unavailable.")
  }

  const unavailable = boards
    .filter((item) => item.board === null)
    .map((item) => item.source.name)

  const byId = new Map<string, InternationalFixture>()
  for (const { source, board } of boards) {
    const events = (board?.events as unknown[] | undefined) ?? []
    for (const event of events) {
      const fixture = mapEvent(event, source)
      if (fixture && !byId.has(fixture.id)) byId.set(fixture.id, fixture)
    }
  }

  const fixtures = [...byId.values()].sort((left, right) => left.kickoff.localeCompare(right.kickoff))
  const result: InternationalFixtureResponse = {
    date,
    source: "ESPN",
    fixtures,
    competitionsChecked: successful.length,
    competitionsUnavailable: unavailable,
    partial: unavailable.length > 0,
  }

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]))
  const today = todayValues.year + "-" + todayValues.month + "-" + todayValues.day
  const ttl = date === today ? LIVE_CACHE_TTL_MS : OTHER_DATE_CACHE_TTL_MS
  responseCache.set(date, { expiresAt: Date.now() + ttl, value: result })
  if (responseCache.size > 90) {
    const firstKey = responseCache.keys().next().value
    if (firstKey) responseCache.delete(firstKey)
  }
  return result
}
