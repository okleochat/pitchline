import type { LeagueId } from "@/data/football"

export const MAX_SLIP_LEGS = 50

export type SlipKind = "result" | "goals" | "btts"

export type SlipLeg = {
  key: string
  fixtureId: string
  league: LeagueId
  competitionName: string
  kickoffAt: string
  when: string
  homeTeam: string
  awayTeam: string
  label: string
  kind: SlipKind
  probability: number
}

const LEAGUE_IDS = new Set<LeagueId>([
  "eng", "esp", "ita", "ger", "fra", "ch", "ned", "por", "tur",
  "ksa", "mls", "bra", "mx", "ucl", "uel", "uecl", "int",
])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const result = value.trim()
  return result.length > 0 && result.length <= max ? result : null
}

function validLabel(kind: SlipKind, label: string, home: string, away: string): boolean {
  if (kind === "result") {
    return label === "Draw" || label === home + " to win" || label === away + " to win"
  }
  if (kind === "goals") return /^(Over|Under) (1\.5|2\.5|3\.5) goals$/.test(label)
  return label === "Both teams to score" || label === "Not both to score"
}

/** Validate and normalize a persisted bet slip. Only one selection per match is allowed. */
export function normalizeSlipLegs(value: unknown): SlipLeg[] | null {
  if (!Array.isArray(value) || value.length > MAX_SLIP_LEGS) return null
  const legs: SlipLeg[] = []
  const fixtureIds = new Set<string>()
  const keys = new Set<string>()

  for (const raw of value) {
    const item = record(raw)
    if (!item) return null

    const fixtureId = cleanString(item.fixtureId, 160)
    const league = typeof item.league === "string" && LEAGUE_IDS.has(item.league as LeagueId)
      ? item.league as LeagueId
      : null
    const competitionName = cleanString(item.competitionName, 100)
    const kickoffAt = cleanString(item.kickoffAt, 50)
    const when = cleanString(item.when, 80)
    const homeTeam = cleanString(item.homeTeam, 100)
    const awayTeam = cleanString(item.awayTeam, 100)
    const label = cleanString(item.label, 120)
    const kind = item.kind === "result" || item.kind === "goals" || item.kind === "btts"
      ? item.kind
      : null
    const probability = typeof item.probability === "number" ? item.probability : Number.NaN

    if (!fixtureId || !league || !competitionName || !kickoffAt || !Number.isFinite(Date.parse(kickoffAt)) ||
        !when || !homeTeam || !awayTeam || homeTeam === awayTeam || !label || !kind ||
        !Number.isFinite(probability) || probability <= 0 || probability >= 1 ||
        !validLabel(kind, label, homeTeam, awayTeam)) return null

    const key = fixtureId + ":" + label
    if (fixtureIds.has(fixtureId) || keys.has(key)) return null
    fixtureIds.add(fixtureId)
    keys.add(key)
    legs.push({
      key, fixtureId, league, competitionName, kickoffAt, when,
      homeTeam, awayTeam, label, kind, probability,
    })
  }

  return legs
}
