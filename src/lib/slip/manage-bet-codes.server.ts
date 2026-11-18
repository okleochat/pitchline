import "server-only"

import type { SlipLeg } from "./types"
import { managedBookmaker } from "./bookmakers"

const API_BASE = "https://api.managebetcodes.app/v1"
const REQUEST_TIMEOUT_MS = 20_000

type Dict = Record<string, unknown>

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export class ManagedBookmakerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly details: string[] = [],
  ) {
    super(message)
    this.name = "ManagedBookmakerError"
  }
}

async function postJson(path: string, payload: Dict, apiKey: string): Promise<Dict> {
  let response: Response
  try {
    response = await fetch(API_BASE + path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new ManagedBookmakerError(
      "MANAGED_BOOKMAKER_UNAVAILABLE",
      "The external booking-code service could not be reached. Your Pitchline slip is still saved.",
      502,
    )
  }

  const body = record(await response.json().catch(() => null))
  if (!body) {
    throw new ManagedBookmakerError(
      "MANAGED_BOOKMAKER_BAD_RESPONSE",
      "The external booking-code service returned an unreadable response.",
      502,
    )
  }
  if (!response.ok) {
    const code = stringValue(body.code, stringValue(body.error, "MANAGED_BOOKMAKER_FAILED"))
    const message = stringValue(body.message, "The external booking-code service rejected the request.")
    const status = response.status === 401 || response.status === 403 ? 503 : response.status === 422 ? 409 : 502
    throw new ManagedBookmakerError(code, message, status)
  }
  return body
}

function toProviderPick(leg: SlipLeg): Dict {
  let market = ""
  let outcome = ""
  let line: string | undefined

  if (leg.kind === "result") {
    market = "1X2"
    outcome = leg.label === "Draw"
      ? "draw"
      : leg.label === leg.homeTeam + " to win"
        ? "home"
        : leg.label === leg.awayTeam + " to win"
          ? "away"
          : ""
  } else if (leg.kind === "goals") {
    const match = /^(Over|Under) (1\.5|2\.5|3\.5) goals$/.exec(leg.label)
    if (!match) {
      throw new ManagedBookmakerError("UNSUPPORTED_PICK", "One of the selected goals markets is not supported.", 400)
    }
    market = "Over/Under"
    outcome = match[1].toLowerCase()
    line = match[2]
  } else {
    market = "Both Teams To Score"
    outcome = leg.label === "Both teams to score"
      ? "yes"
      : leg.label === "Not both to score"
        ? "no"
        : ""
  }

  if (!outcome) {
    throw new ManagedBookmakerError("UNSUPPORTED_PICK", "One of the selected outcomes could not be mapped safely.", 400)
  }

  return {
    home_team: leg.homeTeam,
    away_team: leg.awayTeam,
    league: leg.competitionName,
    kickoff: leg.kickoffAt,
    sport: "football",
    market,
    outcome,
    ...(line ? { line } : {}),
  }
}

export type ManagedBookingResult = {
  shareCode: string
  shareURL: string
  expiresAt: string | null
  combinedOdds: number
  bookmakerName: string
  creditsCharged: number
  legs: Array<{
    key: string
    homeTeam: string
    awayTeam: string
    selection: string
    market: string
    odds: number
  }>
}

/**
 * Resolve every selection first (free), then request one code (2 provider
 * credits). Never book a partial/ambiguous slip or silently accept moved odds.
 */
export async function createManagedBookmakerBooking(
  legs: SlipLeg[],
  bookmakerKey: string,
): Promise<ManagedBookingResult> {
  if (!legs.length || legs.length > 50) {
    throw new ManagedBookmakerError("INVALID_SLIP", "Add between one and fifty selections first.", 400)
  }

  const provider = managedBookmaker(bookmakerKey)
  if (!provider) {
    throw new ManagedBookmakerError("BOOKMAKER_UNSUPPORTED", "This bookmaker is not enabled for automatic booking codes.", 400)
  }

  const apiKey = process.env.MANAGE_BET_CODES_API_KEY?.trim()
  if (!apiKey) {
    throw new ManagedBookmakerError(
      "MANAGED_API_KEY_REQUIRED",
      "Connect a Manage Bet Codes API key in Vercel to enable this bookmaker. The provider charges two API credits for each successfully generated code.",
      503,
    )
  }

  const picks = legs.map(toProviderPick)
  const resolved = await postJson("/resolve", {
    bookmaker: bookmakerKey,
    picks,
    strict: true,
    accept_odds_change: false,
    detail: "agent",
  }, apiKey)

  const planId = stringValue(resolved.plan_id)
  const resolvedPicks = Array.isArray(resolved.picks) ? resolved.picks.map(record) : []
  const failures = resolvedPicks.flatMap((item, index) => {
    if (!item) return ["Selection " + (index + 1) + ": the resolver returned an invalid row."]
    if (item.status === "resolved" && item.bookable === true) return []
    const leg = legs[index]
    const label = leg
      ? leg.homeTeam + " vs " + leg.awayTeam + " — " + leg.label
      : "Selection " + (index + 1)
    const reason = stringValue(item.reason, stringValue(item.status, "not bookable"))
    return [label + ": " + reason]
  })

  if (!planId || resolvedPicks.length !== legs.length || failures.length) {
    throw new ManagedBookmakerError(
      "MANAGED_SELECTIONS_UNAVAILABLE",
      "Not every selection could be matched to a live " + provider.name + " market. No code was generated.",
      409,
      failures.length ? failures : ["The bookmaker did not resolve the complete slip."],
    )
  }

  // This POST consumes credits on success. Never retry it automatically.
  const booked = await postJson("/book", {
    bookmaker: bookmakerKey,
    plan_id: planId,
    strict: true,
    accept_odds_change: false,
  }, apiKey)

  const target = record(booked.target)
  const code = stringValue(target?.code, stringValue(booked.code))
  if (booked.success !== true || booked.verified !== true || booked.partial === true || !code) {
    const failures = Array.isArray(booked.failures)
      ? booked.failures.map((item) => stringValue(record(item)?.reason, "A selection did not load back correctly."))
      : []
    throw new ManagedBookmakerError(
      "MANAGED_BOOK_NOT_VERIFIED",
      "The bookmaker did not verify every selection in the new slip. No booking code has been presented as successful.",
      502,
      failures.length ? failures : [stringValue(booked.warning, "Load-back verification did not confirm the full slip.")],
    )
  }

  const rows = legs.map((leg, index) => {
    const pick = resolvedPicks[index]
    const market = record(pick?.market)
    const outcome = record(pick?.outcome)
    return {
      key: leg.key,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      selection: stringValue(outcome?.canonical, leg.label),
      market: stringValue(market?.canonical, leg.kind === "goals" ? "Over/Under" : leg.kind === "btts" ? "Both Teams To Score" : "1X2"),
      odds: numberValue(outcome?.odds) ?? 0,
    }
  })

  const computedOdds = rows.every((row) => row.odds > 1)
    ? rows.reduce((total, row) => total * row.odds, 1)
    : 0
  const combinedOdds = numberValue(booked.total_odds) ?? numberValue(record(booked.odds)?.total) ?? computedOdds
  const billing = record(booked.billing)

  return {
    shareCode: code,
    shareURL: provider.siteUrl,
    expiresAt: stringValue(booked.expires_at) || null,
    combinedOdds,
    bookmakerName: provider.name,
    creditsCharged: numberValue(billing?.price) ?? 2,
    legs: rows,
  }
}
