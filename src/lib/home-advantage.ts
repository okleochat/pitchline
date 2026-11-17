import type { LeagueId } from "@/data/football"

export type CompletedScore = {
  homeGoals: number
  awayGoals: number
}

/**
 * Converts the observed league home/away goal ratio into the simulator's
 * home-edge multiplier. Small samples are pulled toward a conservative prior.
 */
export function estimateHomeAdvantage(
  scores: CompletedScore[],
  prior = 1.1,
  priorMatches = 12,
): number {
  const valid = scores.filter(
    (score) =>
      Number.isFinite(score.homeGoals) &&
      Number.isFinite(score.awayGoals) &&
      score.homeGoals >= 0 &&
      score.awayGoals >= 0,
  )
  if (!valid.length) return prior

  const homeGoals = valid.reduce((sum, score) => sum + score.homeGoals, 0)
  const awayGoals = valid.reduce((sum, score) => sum + score.awayGoals, 0)
  if (homeGoals <= 0 || awayGoals <= 0) return prior

  // expectedGoals() moves the home/away goal ratio by edge^1.5.
  const observedEdge = Math.pow(homeGoals / awayGoals, 2 / 3)
  const weight = valid.length / (valid.length + Math.max(0, priorMatches))
  const estimate = prior + (observedEdge - prior) * weight
  return Math.round(Math.min(1.3, Math.max(0.9, estimate)) * 1000) / 1000
}

export function homeAdvantageForLeague(
  league: LeagueId,
  homeAdvantagePct?: number,
): number {
  if (league === "int") return 1
  if (typeof homeAdvantagePct === "number" && Number.isFinite(homeAdvantagePct)) {
    return Math.min(1.3, Math.max(0.9, homeAdvantagePct / 100))
  }
  return 1.1
}
