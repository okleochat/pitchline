import "server-only"

import { getEspnJson } from "@/lib/espn/transport.server"
import { INTERNATIONAL_COMPETITIONS, type CompetitionSource } from "./competitions"
import { canReuseUpcomingCache, monthKeysInRange } from "./date-windows"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"

type Dict = Record<string, unknown>

export type InternationalFixture = {
  id: string
  kickoff: string
  competition: string
  region: string
  home: { espnId: string; name: string; abbreviation: string | null; logo: string | null; color: string | null }
  away: { espnId: string; name: string; abbreviation: string | null; logo: string | null; color: string | null }
  competitionSlug: string
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
const upcomingCache = new Map<string, { expiresAt: number; value: InternationalFixtureResponse }>()
const PERSISTED_UPCOMING_TTL_MS = 36 * 60 * 60 * 1000
const PERSISTED_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000
const COMPETITION_MONTH_CACHE_TTL_MS = 5 * 60 * 1000
const competitionMonthCache = new Map<string, { expiresAt: number; events: unknown[] }>()
let persistedUpcomingMemory: { checkedAt: number; savedAt: number; value: InternationalFixtureResponse } | null = null

function isInternationalResponse(value: unknown): value is InternationalFixtureResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Partial<InternationalFixtureResponse>
  return typeof item.date === "string" && Array.isArray(item.fixtures) &&
    typeof item.competitionsChecked === "number" && Array.isArray(item.competitionsUnavailable)
}

function fixtureDateInLagos(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + "-" + values.month + "-" + values.day
}

function persistedDateTtl(date: string, today: string): number {
  if (date === today) return LIVE_CACHE_TTL_MS
  if (date < today) return PERSISTED_HISTORY_TTL_MS
  return OTHER_DATE_CACHE_TTL_MS
}

async function readPersistedDate(date: string, today: string): Promise<InternationalFixtureResponse | null> {
  try {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("pitchlineInternationalDates")
      .doc(date)
      .get()
    const data = snapshot.data()
    const savedAt = typeof data?.savedAt === "number" ? data.savedAt : 0
    if (!data || !savedAt || Date.now() - savedAt > persistedDateTtl(date, today)) return null
    return isInternationalResponse(data.response) ? data.response : null
  } catch {
    return null
  }
}

async function writePersistedDate(
  date: string,
  today: string,
  response: InternationalFixtureResponse,
): Promise<void> {
  try {
    await getFirebaseAdminFirestore()
      .collection("pitchlineInternationalDates")
      .doc(date)
      .set({ savedAt: Date.now(), response })
  } catch {
    // The in-process cache and live ESPN fallback remain available without Firestore.
  }
}

async function readPersistedUpcoming(): Promise<InternationalFixtureResponse | null> {
  if (persistedUpcomingMemory &&
      Date.now() - persistedUpcomingMemory.checkedAt < 60_000 &&
      Date.now() - persistedUpcomingMemory.savedAt <= PERSISTED_UPCOMING_TTL_MS) {
    return persistedUpcomingMemory.value
  }

  try {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("pitchlineData")
      .doc("internationalUpcoming")
      .get()
    const data = snapshot.data()
    const savedAt = typeof data?.savedAt === "number" ? data.savedAt : 0
    if (!data || !savedAt || Date.now() - savedAt > PERSISTED_UPCOMING_TTL_MS ||
        !isInternationalResponse(data.response)) {
      persistedUpcomingMemory = null
      return null
    }
    persistedUpcomingMemory = { checkedAt: Date.now(), savedAt, value: data.response }
    return data.response
  } catch {
    return null
  }
}

async function writePersistedUpcoming(response: InternationalFixtureResponse): Promise<void> {
  const savedAt = Date.now()
  try {
    await getFirebaseAdminFirestore()
      .collection("pitchlineData")
      .doc("internationalUpcoming")
      .set({ savedAt, response })
    persistedUpcomingMemory = { checkedAt: savedAt, savedAt, value: response }
  } catch {
    // The shared board refresh must still complete if this optional cache write fails.
  }
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function idValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value)
  return null
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

  const espnId = idValue(team.id)
  if (!espnId) return null

  return {
    espnId,
    name: stringValue(team.displayName) ?? stringValue(team.name) ?? "Unknown team",
    abbreviation: stringValue(team.abbreviation),
    logo,
    color: stringValue(team.color),
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

  const eventId = idValue(event.id)
  if (!eventId) return null

  const status = eventStatus(event, competition ?? {})
  return {
    id: eventId,
    kickoff: kickoffDate.toISOString(),
    competition: source.name,
    region: source.confederation,
    home,
    away,
    competitionSlug: source.slug,
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

  const today = dateInLagos()
  const persistedDate = await readPersistedDate(date, today)
  if (persistedDate) {
    responseCache.set(date, {
      expiresAt: Date.now() + persistedDateTtl(date, today),
      value: persistedDate,
    })
    return persistedDate
  }

  // Serve future dates from the snapshot populated by the scheduled shared-board refresh.
  const durableUpcoming = await readPersistedUpcoming()
  if (durableUpcoming &&
      canReuseUpcomingCache(date, durableUpcoming.date, addDays(durableUpcoming.date, 30))) {
    const result: InternationalFixtureResponse = {
      ...durableUpcoming,
      date,
      fixtures: durableUpcoming.fixtures.filter((fixture) => fixtureDateInLagos(fixture.kickoff) === date),
    }
    responseCache.set(date, {
      expiresAt: Date.now() + OTHER_DATE_CACHE_TTL_MS,
      value: result,
    })
    return result
  }

  // Reuse the 30-day batch already fetched by the shared match board whenever
  // the requested day falls inside that window; this avoids a second set of
  // scoreboard calls on the International page and Best Picks.
  const upcoming = upcomingCache.get(today + ":30")
  const upcomingEnd = addDays(today, 30)
  // The shared month-batched window includes all matches for today (including
  // completed/in-progress events) plus all events in the future 30-day range.
  if (upcoming && upcoming.expiresAt > Date.now() && canReuseUpcomingCache(date, today, upcomingEnd)) {
    const fixtures = upcoming.value.fixtures.filter((fixture) => {
      const kickoffParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(fixture.kickoff))
      const values = Object.fromEntries(kickoffParts.map((part) => [part.type, part.value]))
      return values.year + "-" + values.month + "-" + values.day === date
    })
    const result: InternationalFixtureResponse = {
      ...upcoming.value,
      date,
      fixtures,
    }
    responseCache.set(date, {
      expiresAt: Date.now() + (date === today ? LIVE_CACHE_TTL_MS : OTHER_DATE_CACHE_TTL_MS),
      value: result,
    })
    return result
  }

  // Use the same month-bucketed ESPN scoreboards as the shared board.
  // This captures the full competition schedule and avoids a separate daily
  // request shape that can omit friendlies and other date-scoped events.
  const months = monthKeysInRange(date, date)
  const boards = await Promise.all(
    INTERNATIONAL_COMPETITIONS.map(async (source) => ({
      source,
      ...(await fetchCompetitionMonths(months, source)),
    })),
  )

  const successful = boards.filter((item) => item.board !== null)
  if (successful.length === 0) {
    throw new Error("ESPN's international competition feed is temporarily unavailable.")
  }

  const unavailable = boards
    .filter((item) => item.partial)
    .map((item) => item.source.name)

  const byId = new Map<string, InternationalFixture>()
  for (const { source, board } of boards) {
    const events = (board?.events as unknown[] | undefined) ?? []
    for (const event of events) {
      const fixture = mapEvent(event, source)
      if (fixture && fixtureDateInLagos(fixture.kickoff) === date && !byId.has(fixture.id)) {
        byId.set(fixture.id, fixture)
      }
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

  const ttl = date === today ? LIVE_CACHE_TTL_MS : OTHER_DATE_CACHE_TTL_MS
  responseCache.set(date, { expiresAt: Date.now() + ttl, value: result })
  await writePersistedDate(date, today, result)
  if (responseCache.size > 90) {
    const firstKey = responseCache.keys().next().value
    if (firstKey) responseCache.delete(firstKey)
  }
  return result
}

function dateInLagos(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + "-" + values.month + "-" + values.day
}

function addDays(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function fetchCompetitionMonth(month: string, source: CompetitionSource): Promise<unknown[] | null> {
  const key = source.slug + ":" + month
  const cached = competitionMonthCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.events
  if (cached) competitionMonthCache.delete(key)

  const payload = await getEspnJson(
    ESPN_SCOREBOARD + "/" + source.slug + "/scoreboard?dates=" + month + "&limit=500",
  )
  if (!payload) return null
  const events = Array.isArray(payload.events) ? payload.events : []
  competitionMonthCache.set(key, {
    expiresAt: Date.now() + COMPETITION_MONTH_CACHE_TTL_MS,
    events,
  })
  if (competitionMonthCache.size > 120) {
    const firstKey = competitionMonthCache.keys().next().value
    if (firstKey) competitionMonthCache.delete(firstKey)
  }
  return events
}

async function fetchCompetitionMonths(months: string[], source: CompetitionSource): Promise<{
  board: Record<string, unknown> | null
  partial: boolean
}> {
  const monthBoards = await Promise.all(months.map((month) => fetchCompetitionMonth(month, source)))
  const available = monthBoards.filter((events): events is unknown[] => events !== null)
  if (!available.length) return { board: null, partial: true }

  return {
    board: { events: available.flat() },
    partial: available.length !== monthBoards.length,
  }
}

/**
 * Fetch a bounded upcoming window with month-bucketed scoreboard requests.
 * ESPN's site API no longer accepts the older hyphenated day-range form.
 * Month queries plus local filtering feed both Best Picks and the match desk.
 */
export async function getUpcomingInternationalFixtures(days = 30): Promise<InternationalFixtureResponse> {
  const safeDays = Math.max(1, Math.min(45, Math.floor(days)))
  const startDate = dateInLagos()
  const endDate = addDays(startDate, safeDays)
  const cacheKey = startDate + ":" + safeDays
  const cached = upcomingCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const months = monthKeysInRange(startDate, endDate)
  const boards = await Promise.all(
    INTERNATIONAL_COMPETITIONS.map(async (source) => ({
      source,
      ...(await fetchCompetitionMonths(months, source)),
    })),
  )
  const successful = boards.filter((item) => item.board !== null)
  if (successful.length === 0) {
    throw new Error("ESPN's international competition feed is temporarily unavailable.")
  }

  const unavailable = boards
    .filter((item) => item.partial)
    .map((item) => item.source.name)
  // Keep every event on the current Lagos calendar day, including matches
  // already played or in progress, so the date page can show results. The
  // shared simulator board separately filters to future pre-kickoff fixtures.
  const start = new Date(startDate + "T00:00:00+01:00").getTime()
  const end = new Date(endDate + "T23:59:59.999+01:00").getTime()
  const byId = new Map<string, InternationalFixture>()

  for (const { source, board } of boards) {
    const events = (board?.events as unknown[] | undefined) ?? []
    for (const event of events) {
      const fixture = mapEvent(event, source)
      if (!fixture) continue
      const kickoff = new Date(fixture.kickoff).getTime()
      if (kickoff < start || kickoff > end) continue
      if (!byId.has(fixture.id)) byId.set(fixture.id, fixture)
    }
  }

  const result: InternationalFixtureResponse = {
    date: startDate,
    source: "ESPN",
    fixtures: [...byId.values()].sort((left, right) => left.kickoff.localeCompare(right.kickoff)),
    competitionsChecked: successful.length,
    competitionsUnavailable: unavailable,
    partial: unavailable.length > 0,
  }
  upcomingCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, value: result })
  await writePersistedUpcoming(result)
  if (upcomingCache.size > 20) {
    const firstKey = upcomingCache.keys().next().value
    if (firstKey) upcomingCache.delete(firstKey)
  }
  return result
}
