import { simulatePro, type ProTeam, type ProReport } from "./pro-sim.ts"
import type { ProPlayerData, ProTeamSquad } from "./pro-player-data.ts"
import { MIN_SQUAD_RATED_PLAYERS, MIN_SQUAD_RATING_COVERAGE } from "./pro-player-model.ts"

/**
 * Shared Pro execution path for the Match Desk and Best Picks.
 * If both rated squads are available, simulatePro applies their multipliers.
 * Otherwise it uses its neutral squad factors while keeping the Pro engine on.
 */
export function runProEngine(input: {
  home: ProTeam
  away: ProTeam
  edge: number
  roll: number
  playerData: ProPlayerData
}): ProReport {
  const { home, away, edge, roll, playerData } = input
  const homeFactors = playerData.adjustmentsApplied ? playerData.home?.factors : undefined
  const awayFactors = playerData.adjustmentsApplied ? playerData.away?.factors : undefined
  return simulatePro(home, away, edge, roll, homeFactors, awayFactors)
}


/**
 * Best Picks has a stricter evidence rule than the interactive Match Desk:
 * both teams must have at least 12 EA-rated roster players and >=60% roster
 * coverage. The Match Desk may still use neutral factors when this is false.
 */
function squadMeetsProPickThreshold(squad: ProTeamSquad | null): boolean {
  if (!squad) return false
  const { ratedPlayerCount, squadCount, factors } = squad
  const coverage = squadCount > 0 ? ratedPlayerCount / squadCount : 0
  return (
    squadCount >= MIN_SQUAD_RATED_PLAYERS &&
    ratedPlayerCount >= MIN_SQUAD_RATED_PLAYERS &&
    coverage >= MIN_SQUAD_RATING_COVERAGE &&
    factors.applied &&
    factors.ratedPlayers >= MIN_SQUAD_RATED_PLAYERS &&
    factors.squadCount >= MIN_SQUAD_RATED_PLAYERS &&
    factors.coverage >= MIN_SQUAD_RATING_COVERAGE
  )
}

/** A fixture is eligible only when each side independently clears the gate. */
export function hasEligibleProPickSquadData(playerData: ProPlayerData): boolean {
  return playerData.adjustmentsApplied &&
    squadMeetsProPickThreshold(playerData.home) &&
    squadMeetsProPickThreshold(playerData.away)
}
