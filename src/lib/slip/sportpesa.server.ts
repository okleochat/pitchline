import "server-only"

import type { SlipLeg } from "./types"
import { parseEventTimestamp, teamNameMatchScore } from "./sportybet-matching"

const API_BASE = "https://www.sportpesa.com/api"
const PAGE_SIZE = 100
const PAGE_COUNT = 5
const FIXTURE_CACHE_MS = 60_000

type Dict = Record<string, unknown>
type SportPesaSelection = {
  id?: string | number
  name?: string
  odds?: string | number
  shortName?: string
}
type SportPesaMarket = {
  id?: string | number
  name?: string
  specValue?: string | number
  sequence?: string | number
  selections?: SportPesaSelection[]
}
type SportPesaEvent = {
  id?: string | number
  date?: string
  dateTimestamp?: number
  isLive?: boolean
  started?: boolean
  competition?: { name?: string }
  sport?: { id?: number }
  competitors?: Array<{ name?: string }>
  markets?: SportPesaMarket[]
}

export class SportPesaBookingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly details: string[] = [],
  ) {
    super(message)
    this.name = "SportPesaBookingError"
  }
}

type FeedSnapshot = { savedAt: number; events: SportPesaEvent[]; cookie: string }
let feedCache: FeedSnapshot | null = null

function cookiesFrom(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? ""
  return raw
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ")
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Dict
    : null
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const date = new Date(timestamp)
  const pad = (part: number) => String(part).padStart(2, "0")
  return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" +
    pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" +
    pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds())
}

async function fetchPage(page: number): Promise<{ events: SportPesaEvent[]; cookie: string }> {
  const params = new URLSearchParams({
    sportId: "1",
    pag_count: String(PAGE_SIZE),
    pag: String(page),
  })
  let response: Response
  try {
    response = await fetch(API_BASE + "/upcoming/games?" + params.toString(), {
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://www.sportpesa.com/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new SportPesaBookingError(
      "SPORTPESA_UNAVAILABLE",
      "SportPesa's fixture service could not be reached. Your Pitchline slip is still saved.",
      502,
    )
  }
  if (!response.ok) {
    throw new SportPesaBookingError(
      "SPORTPESA_UNAVAILABLE",
      "SportPesa's fixture service is temporarily unavailable.",
      502,
    )
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new SportPesaBookingError("SPORTPESA_BAD_FEED", "SportPesa returned an unreadable fixture feed.", 502)
  }
  if (!Array.isArray(data)) {
    throw new SportPesaBookingError("SPORTPESA_BAD_FEED", "SportPesa returned an unexpected fixture feed.", 502)
  }
  return { events: data as SportPesaEvent[], cookie: cookiesFrom(response) }
}

async function upcomingEvents(): Promise<FeedSnapshot> {
  if (feedCache && Date.now() - feedCache.savedAt < FIXTURE_CACHE_MS) return feedCache
  const pages = await Promise.all(
    Array.from({ length: PAGE_COUNT }, (_, index) => fetchPage(index + 1)),
  )
  const byId = new Map<string, SportPesaEvent>()
  for (const page of pages) {
    for (const event of page.events) {
      const id = String(event.id ?? "")
      if (id) byId.set(id, event)
    }
  }
  const snapshot = {
    savedAt: Date.now(),
    events: [...byId.values()],
    cookie: pages.map((page) => page.cookie).find(Boolean) ?? "",
  }
  if (!snapshot.events.length || !snapshot.cookie) {
    throw new SportPesaBookingError(
      "SPORTPESA_EMPTY_FEED",
      "SportPesa did not provide enough fixture data to validate this slip.",
      502,
    )
  }
  feedCache = snapshot
  return snapshot
}

function matchingEvent(leg: SlipLeg, events: SportPesaEvent[], now: number): SportPesaEvent | null {
  const expectedTime = Date.parse(leg.kickoffAt)
  if (!Number.isFinite(expectedTime) || expectedTime <= now) return null

  const maxKickoffDifference = 90 * 60 * 1000
  const candidates: Array<{ event: SportPesaEvent; score: number }> = []
  for (const event of events) {
    const start = parseEventTimestamp(event.dateTimestamp ?? event.date)
    if (!String(event.id ?? "") || !Number.isFinite(start) || start <= now) continue
    if (event.isLive === true || event.started === true) continue

    const names = event.competitors ?? []
    if (names.length < 2) continue
    const homeScore = teamNameMatchScore(leg.homeTeam, names[0]?.name ?? "")
    const awayScore = teamNameMatchScore(leg.awayTeam, names[1]?.name ?? "")
    if (homeScore < 0.88 || awayScore < 0.88) continue

    const timeDifference = Math.abs(start - expectedTime)
    if (timeDifference > maxKickoffDifference) continue
    const score = homeScore + awayScore - timeDifference / (maxKickoffDifference * 2)
    candidates.push({ event, score })
  }

  candidates.sort((left, right) => right.score - left.score)
  if (!candidates.length) return null
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.025) return null
  return candidates[0].event
}

function exactSelection(leg: SlipLeg, event: SportPesaEvent): {
  market: SportPesaMarket
  selection: SportPesaSelection
  marketName: string
} | null {
  const markets = event.markets ?? []
  let market: SportPesaMarket | undefined
  let outcome = ""
  let short = ""

  if (leg.kind === "result") {
    market = markets.find((item) => String(item.id) === "10" && (item.name ?? "").toLowerCase() === "1x2")
    if (leg.label === "Draw") {
      outcome = "Draw"
      short = "X"
    } else if (leg.label === leg.homeTeam + " to win") {
      outcome = "Home"
      short = "1"
    } else if (leg.label === leg.awayTeam + " to win") {
      outcome = "Away"
      short = "2"
    }
  } else if (leg.kind === "goals") {
    const match = /^(Over|Under) (1\.5|2\.5|3\.5) goals$/.exec(leg.label)
    if (!match) return null
    const direction = match[1]
    const line = Number(match[2])
    market = markets.find((item) => {
      const name = (item.name ?? "").toLowerCase()
      return name.startsWith("over/under") && number(item.specValue) === line
    })
    outcome = direction
    short = direction === "Over" ? "OV" : "UN"
  } else if (leg.kind === "btts") {
    market = markets.find((item) => String(item.id) === "43" && (item.name ?? "").toLowerCase() === "both teams to score")
    outcome = leg.label === "Both teams to score" ? "Yes" : leg.label === "Not both to score" ? "No" : ""
    short = outcome
  }

  if (!market || !outcome) return null
  const wanted = outcome.toLowerCase()
  const selection = (market.selections ?? []).find((item) => {
    const name = (item.name ?? "").trim().toLowerCase()
    const key = (item.shortName ?? "").trim().toLowerCase()
    if (leg.kind === "result") {
      if (short === "1") return key === "1" || name === (event.competitors?.[0]?.name ?? "").trim().toLowerCase() || name === "home"
      if (short === "2") return key === "2" || name === (event.competitors?.[1]?.name ?? "").trim().toLowerCase() || name === "away"
      return key === "x" || name === "draw"
    }
    return name === wanted || key === short.toLowerCase()
  })
  const odds = number(selection?.odds)
  if (!selection || !String(selection.id ?? "") || !Number.isFinite(odds) || odds <= 1) return null
  return { market, selection, marketName: market.name ?? String(market.id) }
}

export type SportPesaBookingResult = {
  shareCode: string
  shareURL: string
  expiresAt: string | null
  combinedOdds: number
  legs: Array<{
    key: string
    homeTeam: string
    awayTeam: string
    selection: string
    market: string
    odds: number
  }>
}

/** Uses SportPesa's own public football feed and its native share-betslip endpoint. */
export async function createSportPesaBooking(legs: SlipLeg[]): Promise<SportPesaBookingResult> {
  if (!legs.length || legs.length > 50) {
    throw new SportPesaBookingError("INVALID_SLIP", "Add between one and fifty selections first.", 400)
  }

  const feed = await upcomingEvents()
  const bets: Dict[] = []
  const rows: SportPesaBookingResult["legs"] = []
  const usedEvents = new Set<string>()
  const failures: string[] = []

  for (const leg of legs) {
    const event = matchingEvent(leg, feed.events, Date.now())
    if (!event) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": fixture not found or kickoff could not be matched safely.")
      continue
    }
    const resolved = exactSelection(leg, event)
    if (!resolved) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": the exact market/outcome is not currently available.")
      continue
    }
    const eventId = number(event.id)
    const marketId = String(resolved.market.id ?? "")
    const selectionId = resolved.selection.id
    if (usedEvents.has(String(eventId))) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": only one selection per match is supported.")
      continue
    }
    usedEvents.add(String(eventId))

    const competitionName = event.competition?.name ?? leg.competitionName
    const competitors = event.competitors ?? []
    const kickOff = dateTime(event.date ?? leg.kickoffAt)
    const selectionName = resolved.selection.name ?? leg.label
    const shortName = resolved.selection.shortName ?? ""
    const odds = number(resolved.selection.odds)

    bets.push({
      eventId,
      event: {
        id: eventId,
        date: kickOff,
        competition: { name: competitionName },
        sport: { id: number(event.sport?.id) || 1 },
        competitors: competitors.slice(0, 2).map((item) => ({ name: item.name ?? "" })),
      },
      market: { id: marketId, name: resolved.marketName },
      selection: {
        id: typeof selectionId === "string" ? Number(selectionId) : selectionId,
        name: selectionName,
        odds: String(resolved.selection.odds),
        shortName,
      },
      status: "selected",
      type: "prematch",
      uuid: [eventId, marketId, 0, selectionId].join(","),
    })
    rows.push({
      key: leg.key,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      selection: selectionName,
      market: resolved.marketName,
      odds,
    })
  }

  if (failures.length || bets.length !== legs.length) {
    throw new SportPesaBookingError(
      "SELECTIONS_UNAVAILABLE",
      "SportPesa could not match every selection to a current market. Your slip was not submitted.",
      409,
      failures,
    )
  }

  let response: Response
  try {
    // This is the bookmaker's native share operation, not a bet placement.
    // Never retry it automatically because each call creates a share code.
    response = await fetch(API_BASE + "/betslips/share/save", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://www.sportpesa.com",
        Referer: "https://www.sportpesa.com/",
        Cookie: feed.cookie,
      },
      body: JSON.stringify({ bets, type: "prematch" }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new SportPesaBookingError(
      "SPORTPESA_BOOKING_FAILED",
      "SportPesa could not create the booking code. Your Pitchline slip remains saved.",
      502,
    )
  }
  if (!response.ok) {
    throw new SportPesaBookingError(
      "SPORTPESA_BOOKING_FAILED",
      "SportPesa rejected the share-slip request. Refresh the markets and try again.",
      502,
    )
  }

  const payload = record(await response.json().catch(() => null))
  const shareCode = typeof payload?.ShareableID === "string" ? payload.ShareableID.trim().toUpperCase() : ""
  if (!shareCode || !/^[A-Z0-9]{4,12}$/.test(shareCode)) {
    throw new SportPesaBookingError(
      "SPORTPESA_BOOKING_FAILED",
      "SportPesa did not return a valid booking code.",
      502,
    )
  }

  // Load the generated code back through SportPesa's own endpoint. The UI
  // must not show a code unless every submitted selection survived.
  let loadedResponse: Response
  try {
    loadedResponse = await fetch(
      API_BASE + "/betslips/share/" + encodeURIComponent(shareCode) + "/load",
      {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Referer: "https://www.sportpesa.com/",
          Cookie: feed.cookie,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    throw new SportPesaBookingError(
      "SPORTPESA_LOADBACK_FAILED",
      "SportPesa created a code but Pitchline could not verify the saved selections. The code was not shown as ready.",
      502,
    )
  }
  if (!loadedResponse.ok) {
    throw new SportPesaBookingError(
      "SPORTPESA_LOADBACK_FAILED",
      "SportPesa created a code but did not confirm that the saved slip can be reloaded.",
      502,
    )
  }
  const loadedPayload = record(await loadedResponse.json().catch(() => null))
  let shareableData: Dict | null = null
  if (typeof loadedPayload?.ShareableData === "string") {
    try { shareableData = record(JSON.parse(loadedPayload.ShareableData)) }
    catch { shareableData = null }
  }
  const loadedBets = Array.isArray(shareableData?.bets) ? shareableData.bets.map(record) : []
  const matchesSubmittedBets = loadedBets.length === bets.length && bets.every((submitted, index) => {
    const loaded = loadedBets[index]
    if (!loaded) return false
    const submittedEvent = record(submitted.event)
    const loadedEvent = record(loaded.event)
    const submittedMarket = record(submitted.market)
    const loadedMarket = record(loaded.market)
    const submittedSelection = record(submitted.selection)
    const loadedSelection = record(loaded.selection)
    return String(submitted.eventId) === String(loaded.eventId) &&
      String(submittedMarket?.id) === String(loadedMarket?.id) &&
      String(submittedSelection?.id) === String(loadedSelection?.id) &&
      String(submittedEvent?.competitors && record((submittedEvent.competitors as unknown[])[0])?.name) ===
        String(loadedEvent?.competitors && record((loadedEvent.competitors as unknown[])[0])?.name)
  })
  if (!matchesSubmittedBets) {
    throw new SportPesaBookingError(
      "SPORTPESA_LOADBACK_PARTIAL",
      "SportPesa did not reload every submitted selection. No completed booking code has been shown.",
      409,
    )
  }

  const rawExpiry = typeof payload?.Expiration === "string" ? payload.Expiration : ""
  const expiry = rawExpiry ? Date.parse(rawExpiry.replace(" ", "T") + "Z") : Number.NaN
  const expiresAt = Number.isFinite(expiry) ? new Date(expiry).toISOString() : null
  const combinedOdds = rows.reduce((total, item) => total * item.odds, 1)
  return {
    shareCode,
    shareURL: "https://www.sportpesa.com/",
    expiresAt,
    combinedOdds,
    legs: rows,
  }
}
