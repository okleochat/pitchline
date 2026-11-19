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
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester utd": "manchester united",
  "west ham utd": "west ham united",
  "tottenham": "tottenham hotspur",
  "spurs": "tottenham hotspur",
  "nottm forest": "nottingham forest",
  "nottingham": "nottingham forest",
  "brighton": "brighton and hove albion",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "atletico": "atletico madrid",
  "atleti": "atletico madrid",
  "inter": "inter milan",
  "internazionale": "inter milan",
  "bayern": "bayern munich",
  "bayern munchen": "bayern munich",
  "koln": "cologne",
  "cologne": "cologne",
  "newcastle": "newcastle united",
  "leeds": "leeds united",
  "feyenoord": "feyenoord rotterdam",
  "ajax": "ajax amsterdam",
  "west ham": "west ham united",
  "preston": "preston north end",
  "norwich": "norwich city",
  "qpr": "queens park rangers",
  "cardiff": "cardiff city",
  "willem 2": "willem ii",
  "sparta praha": "sparta prague",
  "az": "az alkmaar",
  "ado": "ado den haag",
  "estoril": "estoril praia",
  "excelsior": "excelsior rotterdam",
  "frankfurt": "eintracht frankfurt",
  "stade rennais": "rennes",
  "betis": "real betis",
  "sociedad": "real sociedad",
  "marseille": "olympique marseille",
  "olympique marseille": "olympique marseille",
  "lyon": "olympique lyonnais",
  "olympique lyonnais": "olympique lyonnais",
  "basaksehir": "istanbul basaksehir",
  "nijmegen": "nec nijmegen",
}

const PREFIX_TOKENS = new Set([
  "1", "fc", "afc", "cf", "sc", "ac", "as", "sv", "vfb", "vfl", "tsg",
  "bsc", "fk", "cd", "ud", "ssc", "rc", "ks",
])
const SUFFIX_TOKENS = new Set([
  "fc", "afc", "cf", "sc", "fk", "club", "calcio",
])
/**
 * Convert provider-specific club labels into a stable comparison name.
 * This is deliberately conservative: known aliases are explicit, while
 * uncertain fuzzy comparisons are handled separately with a confidence score.
 */
export function normalizeTeamName(value: string): string {
  const prepared = value
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const tokens = prepared.split(" ").filter(Boolean).map((token) => token === "ii" ? "2" : token)
  while (tokens.length > 1 && PREFIX_TOKENS.has(tokens[0])) tokens.shift()
  while (tokens.length > 1 && SUFFIX_TOKENS.has(tokens[tokens.length - 1])) tokens.pop()

  const base = tokens.join(" ")
  return TEAM_ALIASES[base] ?? base
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      const substitution = diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, substitution)
      diagonal = above
    }
  }
  return previous[right.length]
}

/** Confidence score for two club labels; 0 means they should not be treated as the same team. */
export function teamNameMatchScore(left: string, right: string): number {
  const a = normalizeTeamName(left)
  const b = normalizeTeamName(right)
  if (!a || !b) return 0
  if (a === b) return 1

  const aTokens = a.split(" ")
  const bTokens = b.split(" ")
  const aSet = new Set(aTokens)
  const bSet = new Set(bTokens)
  const overlap = [...aSet].filter((token) => bSet.has(token)).length

  // A high token overlap can resolve punctuation and word-order differences,
  // but extra tokens are not ignored: they may distinguish reserve or youth teams.
  if (aTokens.length > 1 && bTokens.length > 1) {
    const union = new Set([...aSet, ...bSet]).size
    if (overlap >= 2 && overlap / union >= 0.8) return 0.9
  }

  const longest = Math.max(a.length, b.length)
  if (longest < 6) return 0
  const distance = editDistance(a, b)
  if (distance === 1) return 0.9
  const similarity = 1 - distance / longest
  return similarity >= 0.88 ? similarity : 0
}

/** Accept both provider Unix seconds and milliseconds, plus ISO-like date strings. */
export function parseEventTimestamp(value: unknown): number {
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,16}$/.test(value.trim()))) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) return Number.NaN
    return numeric < 100_000_000_000 ? numeric * 1000 : numeric
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

const MAX_KICKOFF_DIFFERENCE_MS = 90 * 60 * 1000

function isPreMatchStatus(value: string | undefined): boolean {
  const status = (value ?? "").toLowerCase().replace(/[^a-z]/g, "")
  return ["notstart", "notstarted", "scheduled", "prematch", "pending"].includes(status)
}

export function matchSportyBetFixture(
  leg: SlipLeg,
  events: SportyBetEvent[],
  now = Date.now(),
): SportyBetEvent | null {
  const targetKickoff = Date.parse(leg.kickoffAt)
  if (!Number.isFinite(targetKickoff) || targetKickoff <= now) return null

  const candidates: Array<{ event: SportyBetEvent; score: number }> = []
  for (const event of events) {
    const eventId = typeof event.eventId === "string" ? event.eventId : ""
    const eventStart = parseEventTimestamp(event.estimateStartTime)
    if (!eventId || !Number.isFinite(eventStart) || eventStart <= now) continue
    if (!isPreMatchStatus(event.matchStatus)) continue

    const homeScore = teamNameMatchScore(leg.homeTeam, event.homeTeamName ?? "")
    const awayScore = teamNameMatchScore(leg.awayTeam, event.awayTeamName ?? "")
    if (homeScore < 0.88 || awayScore < 0.88) continue

    const timeDifference = Math.abs(eventStart - targetKickoff)
    if (timeDifference > MAX_KICKOFF_DIFFERENCE_MS) continue

    // Prefer the closest kickoff when names are equally strong. The small
    // confidence gap check below still rejects genuinely ambiguous duplicates.
    const score = (homeScore + awayScore) - timeDifference / (MAX_KICKOFF_DIFFERENCE_MS * 2)
    candidates.push({ event, score })
  }

  candidates.sort((left, right) => right.score - left.score)
  if (!candidates.length) return null
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.025) return null
  return candidates[0].event
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
