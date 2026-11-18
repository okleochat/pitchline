import { simulatePro, type ProTeam, type ProReport } from "./pro-sim.ts"
import type { ProPlayerData } from "./pro-player-data.ts"

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
