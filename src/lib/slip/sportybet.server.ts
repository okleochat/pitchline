import "server-only"

import type { SlipLeg } from "./types"
import {
  matchSportyBetFixture,
  resolveSportyBetSelection,
  type SportyBetEvent,
  type SportyBetSelection,
} from "./sportybet-matching"

const API_BASE = "https://www.sportybet.com/api/ng"
const MARKET_IDS = "1,18,29"
const PAGE_SIZE = 100
const MAX_PAGES = 30
const FIXTURE_CACHE_MS = 90_000

type SportyBetEnvelope<T> = {
  bizCode?: number
  message?: string
  data?: T
}

type UpcomingData = {
  totalNum?: number
  tournaments?: Array<{ events?: SportyBetEvent[] }>
}

type BookingData = {
  shareCode?: string
  shareURL?: string
  deadline?: number | string
  outcomes?: unknown[]
  unavailableOutcomes?: unknown[]
}

export class SportyBetBookingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly details?: string[],
  ) {
    super(message)
    this.name = "SportyBetBookingError"
  }
}

let fixtureCache: { savedAt: number; events: SportyBetEvent[] } | null = null

function headers(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Current-Country": "NG",
  }
}

async function fetchFixturePage(pageNum: number): Promise<SportyBetEnvelope<UpcomingData>> {
  const params = new URLSearchParams({
    sportId: "sr:sport:1",
    marketId: MARKET_IDS,
    pageSize: String(PAGE_SIZE),
    pageNum: String(pageNum),
    todayGames: "false",
    timeline: "720",
    _t: String(Date.now()),
  })
  let response: Response
  try {
    response = await fetch(API_BASE + "/factsCenter/pcUpcomingEvents?" + params.toString(), {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new SportyBetBookingError(
      "SPORTYBET_UNAVAILABLE",
      "SportyBet's live fixture feed could not be reached. Try again shortly.",
      502,
    )
  }
  if (!response.ok) {
    throw new SportyBetBookingError(
      "SPORTYBET_UNAVAILABLE",
      "SportyBet's live fixture feed is temporarily unavailable.",
      502,
    )
  }
  try {
    return await response.json() as SportyBetEnvelope<UpcomingData>
  } catch {
    throw new SportyBetBookingError(
      "SPORTYBET_BAD_RESPONSE",
      "SportyBet returned an unreadable fixture response.",
      502,
    )
  }
}

async function upcomingEvents(): Promise<SportyBetEvent[]> {
  if (fixtureCache && Date.now() - fixtureCache.savedAt < FIXTURE_CACHE_MS) {
    return fixtureCache.events
  }

  const first = await fetchFixturePage(1)
  if (Number(first.bizCode) !== 10000 || !first.data) {
    throw new SportyBetBookingError(
      "SPORTYBET_UNAVAILABLE",
      "SportyBet did not return a valid upcoming fixture list.",
      502,
    )
  }

  const total = Math.max(0, Number(first.data.totalNum) || 0)
  const requestedPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (requestedPages > MAX_PAGES) {
    throw new SportyBetBookingError(
      "SPORTYBET_PARTIAL_FEED",
      "SportyBet listed more fixtures than Pitchline can safely validate in one request. Please try again later.",
      502,
    )
  }
  const pageCount = Math.min(MAX_PAGES, requestedPages)
  const pages: SportyBetEnvelope<UpcomingData>[] = [first]

  // Fetch independent pages in small batches to avoid sending a burst of requests.
  for (let page = 2; page <= pageCount; page += 4) {
    const batch = Array.from(
      { length: Math.min(4, pageCount - page + 1) },
      (_, index) => fetchFixturePage(page + index),
    )
    pages.push(...await Promise.all(batch))
  }

  const byId = new Map<string, SportyBetEvent>()
  for (const page of pages) {
    if (Number(page.bizCode) !== 10000 || !page.data) {
      throw new SportyBetBookingError(
        "SPORTYBET_PARTIAL_FEED",
        "SportyBet returned an incomplete fixture list. No booking code was requested.",
        502,
      )
    }
    for (const tournament of page.data.tournaments ?? []) {
      for (const event of tournament.events ?? []) {
        if (typeof event.eventId === "string" && event.eventId) byId.set(event.eventId, event)
      }
    }
  }

  const events = [...byId.values()]
  fixtureCache = { savedAt: Date.now(), events }
  return events
}

export type SportyBetBookingResult = {
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

/** Creates a shareable slip reservation only. The endpoint never places or stakes a wager. */
export async function createSportyBetBooking(legs: SlipLeg[]): Promise<SportyBetBookingResult> {
  if (!legs.length || legs.length > 50) {
    throw new SportyBetBookingError("INVALID_SLIP", "Add between one and fifty selections first.", 400)
  }

  const events = await upcomingEvents()
  const selections: SportyBetSelection[] = []
  const rows: SportyBetBookingResult["legs"] = []
  const failures: string[] = []
  const usedEvents = new Set<string>()

  for (const leg of legs) {
    const event = matchSportyBetFixture(leg, events)
    if (!event) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": fixture not found, already started, or kickoff could not be matched safely.")
      continue
    }

    const selection = resolveSportyBetSelection(leg, event)
    if (!selection) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": this exact market or outcome is not currently available.")
      continue
    }
    if (usedEvents.has(selection.eventId)) {
      failures.push(leg.homeTeam + " vs " + leg.awayTeam + ": only one selection per match is supported in this slip.")
      continue
    }
    usedEvents.add(selection.eventId)
    selections.push(selection)
    rows.push({
      key: leg.key,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      selection: selection.outcomeName,
      market: selection.marketName,
      odds: selection.odds,
    })
  }

  if (failures.length || selections.length !== legs.length) {
    throw new SportyBetBookingError(
      "SELECTIONS_UNAVAILABLE",
      "Some selections could not be matched to live SportyBet markets. Your slip has not been submitted.",
      409,
      failures,
    )
  }

  let response: Response
  try {
    // Do not retry this POST: it creates a share-code reservation.
    response = await fetch(API_BASE + "/orders/share", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        selections: selections.map((selection) => ({
          eventId: selection.eventId,
          marketId: selection.marketId,
          specifier: selection.specifier,
          outcomeId: selection.outcomeId,
        })),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new SportyBetBookingError(
      "SPORTYBET_BOOKING_FAILED",
      "SportyBet could not create the booking code. Check the slip before trying again.",
      502,
    )
  }

  if (!response.ok) {
    throw new SportyBetBookingError(
      "SPORTYBET_BOOKING_FAILED",
      "SportyBet rejected the booking-code request. Refresh the slip and try again.",
      502,
    )
  }

  let result: SportyBetEnvelope<BookingData>
  try {
    result = await response.json() as SportyBetEnvelope<BookingData>
  } catch {
    throw new SportyBetBookingError(
      "SPORTYBET_BOOKING_FAILED",
      "SportyBet returned an unreadable booking response.",
      502,
    )
  }

  const booking = result.data
  const shareCode = typeof booking?.shareCode === "string" ? booking.shareCode.trim().toUpperCase() : ""
  if (Number(result.bizCode) !== 10000 || !/^[A-Z0-9]{4,12}$/.test(shareCode)) {
    throw new SportyBetBookingError(
      "SPORTYBET_BOOKING_FAILED",
      "SportyBet did not return a valid booking code. No code has been shown as successful.",
      502,
    )
  }

  if ((booking?.unavailableOutcomes?.length ?? 0) > 0 ||
      (Array.isArray(booking?.outcomes) && booking.outcomes.length > 0 && booking.outcomes.length !== selections.length)) {
    throw new SportyBetBookingError(
      "SPORTYBET_PARTIAL_BOOKING",
      "SportyBet could not preserve every selection. Please rebuild the slip using current markets.",
      409,
    )
  }

  const rawUrl = typeof booking?.shareURL === "string" ? booking.shareURL : ""
  let shareURL = "https://www.sportybet.com/ng/?c=ng&shareCode=" + encodeURIComponent(shareCode)
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === "https:" && /(^|\.)sportybet\.com$/i.test(parsed.hostname)) {
      shareURL = parsed.toString()
    }
  } catch {
    // Use the official load-code URL when the upstream response omits a safe URL.
  }

  const deadline = Number(booking?.deadline)
  const expiresAt = Number.isFinite(deadline) && deadline > 0
    ? new Date(deadline).toISOString()
    : null
  const combinedOdds = rows.reduce((total, row) => total * row.odds, 1)

  return { shareCode, shareURL, expiresAt, combinedOdds, legs: rows }
}
