import type { SlipLeg } from "./types.ts"

export type SportyBetOutcome = {
  id?: string | number
  desc?: string
  odds?: string | number
  isActive?: number | boolean
}

export type SportyBetMarket = {
  id?: string | number
  desc?: string
  specifier?: string | null
  outcomes?: SportyBetOutcome[]
}

export type SportyBetEvent = {
  eventId?: string
  homeTeamName?: string
  awayTeamName?: string
  estimateStartTime?: number | string
  matchStatus?: string
  markets?: SportyBetMarket[]
}

export type SportyBetSelection = {
  eventId: string
  marketId: string
  specifier: string | null
  outcomeId: string
  odds: number
  marketName: string
  outcomeName: string
}

const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "manchester city": "manchester city",
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester united": "manchester united",
  "tottenham": "tottenham hotspur",
  "spurs": "tottenham hotspur",
  "tottenham hotspur": "tottenham hotspur",
  "nottm forest": "nottingham forest",
  "nottingham forest": "nottingham forest",
  "brighton": "brighton and hove albion",
  "brighton and hove albion": "brighton and hove albion",
  "psg": "paris saint germain",
  "paris saint germain": "paris saint germain",
  "atletico": "atletico madrid",
  "atletico madrid": "atletico madrid",
  "inter": "inter milan",
  "internazionale": "inter milan",
  "inter milan": "inter milan",
  "bayern": "bayern munich",
  "bayern munich": "bayern munich",
  "newcastle": "newcastle united",
  "newcastle united": "newcastle united",
  "leeds": "leeds united",
  "leeds united": "leeds united",
}

export function normalizeTeamName(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(fc|afc|cf|sc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return TEAM_ALIASES[base] ?? base
}

function startTime(event: SportyBetEvent): number {
  const value = Number(event.estimateStartTime)
  return Number.isFinite(value) ? value : Number.NaN
}

export function matchSportyBetFixture(
  leg: SlipLeg,
  events: SportyBetEvent[],
  now = Date.now(),
): SportyBetEvent | null {
  const targetKickoff = Date.parse(leg.kickoffAt)
  if (!Number.isFinite(targetKickoff) || targetKickoff <= now) return null

  const home = normalizeTeamName(leg.homeTeam)
  const away = normalizeTeamName(leg.awayTeam)
  const matches = new Map<string, SportyBetEvent>()

  for (const event of events) {
    const eventId = typeof event.eventId === "string" ? event.eventId : ""
    const eventStart = startTime(event)
    const status = (event.matchStatus ?? "").trim().toLowerCase()
    if (!eventId || !Number.isFinite(eventStart) || eventStart <= now) continue
    if (status !== "not start" && status !== "not started") continue
    if (normalizeTeamName(event.homeTeamName ?? "") !== home ||
        normalizeTeamName(event.awayTeamName ?? "") !== away) continue
    if (Math.abs(eventStart - targetKickoff) > 45 * 60 * 1000) continue
    matches.set(eventId, event)
  }

  return matches.size === 1 ? [...matches.values()][0] : null
}

function activeOutcome(market: SportyBetMarket, name: string): SportyBetOutcome | null {
  const match = (market.outcomes ?? []).find((outcome) =>
    (outcome.desc ?? "").trim().toLowerCase() === name.toLowerCase(),
  )
  if (!match || (match.isActive !== 1 && match.isActive !== true)) return null
  const odds = Number(match.odds)
  if (!Number.isFinite(odds) || odds <= 1) return null
  return match
}

function marketId(market: SportyBetMarket): string {
  return String(market.id ?? "")
}

/** Resolve a Pitchline pick only when the live SportyBet feed offers the exact market and outcome. */
export function resolveSportyBetSelection(
  leg: SlipLeg,
  event: SportyBetEvent,
): SportyBetSelection | null {
  const eventId = typeof event.eventId === "string" ? event.eventId : ""
  if (!eventId) return null

  const markets = event.markets ?? []
  let market: SportyBetMarket | undefined
  let outcome: SportyBetOutcome | null = null
  let outcomeName = ""

  if (leg.kind === "result") {
    const label = leg.label
    const outcomeLabel = label === "Draw"
      ? "Draw"
      : label === leg.homeTeam + " to win"
        ? "Home"
        : label === leg.awayTeam + " to win"
          ? "Away"
          : ""
    if (!outcomeLabel) return null
    market = markets.find((item) => marketId(item) === "1" && (item.desc ?? "").trim().toLowerCase() === "1x2")
    if (!market) return null
    outcome = activeOutcome(market, outcomeLabel)
    outcomeName = outcomeLabel
  } else if (leg.kind === "goals") {
    const match = /^(Over|Under) (1\.5|2\.5|3\.5) goals$/.exec(leg.label)
    if (!match) return null
    const direction = match[1]
    const line = match[2]
    market = markets.find((item) =>
      marketId(item) === "18" &&
      (item.desc ?? "").trim().toLowerCase() === "over/under" &&
      (item.specifier ?? "") === "total=" + line,
    )
    if (!market) return null
    outcomeName = direction + " " + line
    outcome = activeOutcome(market, outcomeName)
  } else {
    if (leg.label !== "Both teams to score" && leg.label !== "Not both to score") return null
    market = markets.find((item) => marketId(item) === "29" && (item.desc ?? "").trim().toLowerCase() === "gg/ng")
    if (!market) return null
    outcomeName = leg.label === "Both teams to score" ? "Yes" : "No"
    outcome = activeOutcome(market, outcomeName)
  }

  if (!market || !outcome) return null
  const odds = Number(outcome.odds)
  return {
    eventId,
    marketId: marketId(market),
    specifier: market.specifier ?? null,
    outcomeId: String(outcome.id ?? ""),
    odds,
    marketName: market.desc ?? marketId(market),
    outcomeName: outcome.desc ?? outcomeName,
  }
}
