import type { ProPlayerData, ProTeamSquad } from "./pro-player-data.ts"
import {
  MIN_SQUAD_RATED_PLAYERS,
  MIN_SQUAD_RATING_COVERAGE,
} from "./pro-player-model.ts"

/**
 * Pro Best Picks require the same two-sided squad threshold used by the
 * player-adjustment model. A Pro simulation with neutral squad inputs is not
 * eligible to be presented as a Pro Best Pick.
 */
export function hasEligibleProPickSquadData(data: ProPlayerData): boolean {
  if (data.status !== "available" || !data.adjustmentsApplied) return false

  const squads: Array<ProTeamSquad | null> = [data.home, data.away]
  return squads.every((squad) => {
    if (!squad || !squad.factors.applied) return false
    if (
      squad.squadCount < MIN_SQUAD_RATED_PLAYERS ||
      squad.ratedPlayerCount < MIN_SQUAD_RATED_PLAYERS ||
      squad.factors.ratedPlayers < MIN_SQUAD_RATED_PLAYERS ||
      squad.factors.squadCount < MIN_SQUAD_RATED_PLAYERS
    ) return false
    return Number.isFinite(squad.factors.coverage) &&
      squad.factors.coverage >= MIN_SQUAD_RATING_COVERAGE
  })
}
