import "server-only"

import { getEspnJson } from "@/lib/espn/transport.server"

type Dict = Record<string, unknown>

type CompetitionSource = {
  slug: string
  name: string
  confederation: string
}

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

/**
 * These are national-team competitions, not club tournaments. The same ESPN
 * soccer scoreboard endpoint used by live-board.server.ts serves each slug.
 * Root World Cup qualifying is included last as a catch-all; duplicate event
 * IDs are collapsed in favour of the more specific confederation competition.
 */
export const INTERNATIONAL_COMPETITIONS: readonly CompetitionSource[] = [
  { slug: "caf.nations", name: "Africa Cup of Nations", confederation: "CAF" },
  { slug: "caf.nations_qual", name: "Africa Cup of Nations Qualifiers", confederation: "CAF" },
  { slug: "uefa.nations", name: "UEFA Nations League", confederation: "UEFA" },
  { slug: "fifa.world", name: "FIFA World Cup", confederation: "FIFA" },
  { slug: "fifa.worldq.uefa", name: "World Cup Qualifiers — UEFA", confederation: "UEFA" },
  { slug: "fifa.worldq.caf", name: "World Cup Qualifiers — CAF", confederation: "CAF" },
  { slug: "fifa.worldq.afc", name: "World Cup Qualifiers — AFC", confederation: "AFC" },
  { slug: "fifa.worldq.concacaf", name: "World Cup Qualifiers — CONCACAF", confederation: "CONCACAF" },
  { slug: "fifa.worldq.conmebol", name: "World Cup Qualifiers — CONMEBOL", confederation: "CONMEBOL" },
  { slug: "fifa.worldq.ofc", name: "World Cup Qualifiers — OFC", confederation: "OFC" },
  { slug: "fifa.worldq", name: "World Cup Qualifiers", confederation: "FIFA" },
  { slug: "uefa.euro", name: "UEFA European Championship", confederation: "UEFA" },
  { slug: "uefa.euroq", name: "UEFA European Championship Qualifiers", confederation: "UEFA" },
  { slug: "conmebol.america", name: "Copa América", confederation: "CONMEBOL" },
  { slug: "concacaf.gold", name: "CONCACAF Gold Cup", confederation: "CONCACAF" },
  { slug: "concacaf.nations.league", name: "CONCACAF Nations League", confederation: "CONCACAF" },
  { slug: "afc.asian.cup", name: "AFC Asian Cup", confederation: "AFC" },
  { slug: "fifa.wwc", name: "FIFA Women's World Cup", confederation: "FIFA · Women" },
  { slug: "uefa.weuro", name: "UEFA Women's European Championship", confederation: "UEFA · Women" },
  { slug: "uefa.w.nations", name: "UEFA Women's Nations League", confederation: "UEFA · Women" },
]

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const CACHE_TTL_MS = 45_000
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

  responseCache.set(date, { expiresAt: Date.now() + CACHE_TTL_MS, value: result })
  if (responseCache.size > 90) {
    const firstKey = responseCache.keys().next().value
    if (firstKey) responseCache.delete(firstKey)
  }
  return result
}
