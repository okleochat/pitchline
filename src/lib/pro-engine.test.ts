import assert from "node:assert/strict"
import test from "node:test"
import { simulatePro, type ProTeam } from "./pro-sim.ts"
import { hasEligibleProPickSquadData, runProEngine } from "./pro-engine.ts"
import type { ProPlayerData, ProTeamSquad } from "./pro-player-data.ts"

const home: ProTeam = {
  id: "barcelona", name: "Barcelona", attack: 2.1, defense: 0.85, league: "esp",
}
const away: ProTeam = {
  id: "villarreal", name: "Villarreal", attack: 1.55, defense: 1.25, league: "esp",
}

function squad(teamName: string): ProTeamSquad {
  return {
    teamName,
    squadCount: 24,
    ratedPlayerCount: 16,
    attackIndex: 78,
    creativityIndex: 76,
    defenceIndex: 74,
    factors: {
      attackMultiplier: 1.08,
      creativityMultiplier: 1.04,
      defenceMultiplier: 0.97,
      squadDepth: 72,
      ratedPlayers: 16,
      squadCount: 24,
      coverage: 16 / 24,
      applied: true,
    },
    topPlayers: [],
    dataUpdatedAt: "2026-11-18T05:00:00Z",
  }
}

function playerData(homeSquad: ProTeamSquad | null, awaySquad: ProTeamSquad | null): ProPlayerData {
  const applied = Boolean(homeSquad?.factors.applied && awaySquad?.factors.applied)
  return {
    provider: "EA SPORTS FC 27",
    status: applied ? "available" : "partial",
    note: "",
    home: homeSquad,
    away: awaySquad,
    adjustmentsApplied: applied,
  }
}

test("Best Picks Pro execution matches the Match Desk when player ratings are applied", () => {
  const data = playerData(squad("Barcelona"), squad("Villarreal"))
  const shared = runProEngine({ home, away, edge: 1.1, roll: 0, playerData: data })
  const direct = simulatePro(home, away, 1.1, 0, data.home?.factors, data.away?.factors)
  assert.deepEqual(shared.probabilities, direct.probabilities)
  assert.equal(shared.details.playerAdjustmentsApplied, true)
})

test("Best Picks still returns a Pro result when squad ratings are unavailable, matching Match Desk fallback", () => {
  const data = playerData(null, null)
  const shared = runProEngine({ home, away, edge: 1.1, roll: 0, playerData: data })
  const direct = simulatePro(home, away, 1.1, 0)
  assert.deepEqual(shared.probabilities, direct.probabilities)
  assert.equal(shared.details.playerAdjustmentsApplied, false)
})


function squadAtCoverage(teamName: string, squadCount: number, ratedPlayerCount: number): ProTeamSquad {
  const base = squad(teamName)
  const coverage = squadCount > 0 ? ratedPlayerCount / squadCount : 0
  const applied = squadCount >= 12 && ratedPlayerCount >= 12 && coverage >= 0.6
  return {
    ...base,
    squadCount,
    ratedPlayerCount,
    factors: {
      ...base.factors,
      squadCount,
      ratedPlayers: ratedPlayerCount,
      coverage,
      applied,
    },
  }
}

test("Pro Best Picks accepts a fixture when both squads meet the 60% and 12-player thresholds", () => {
  const data = playerData(squadAtCoverage("Barcelona", 24, 16), squadAtCoverage("Villarreal", 25, 15))
  assert.equal(hasEligibleProPickSquadData(data), true)
})

test("Pro Best Picks rejects a fixture when either team is below 60% coverage", () => {
  const homePasses = squadAtCoverage("Barcelona", 24, 16)
  const awayFails = squadAtCoverage("Villarreal", 24, 14)
  assert.equal(hasEligibleProPickSquadData(playerData(homePasses, awayFails)), false)
  assert.equal(hasEligibleProPickSquadData(playerData(awayFails, homePasses)), false)
})

test("Pro Best Picks rejects a squad with fewer than 12 rated players even when its ratio is above 60%", () => {
  const homePasses = squadAtCoverage("Barcelona", 24, 16)
  const awayHasTooFewPlayers = squadAtCoverage("Villarreal", 11, 10)
  assert.equal(hasEligibleProPickSquadData(playerData(homePasses, awayHasTooFewPlayers)), false)
})

test("Pro Best Picks rejects missing squad profiles", () => {
  assert.equal(hasEligibleProPickSquadData(playerData(squad("Barcelona"), null)), false)
  assert.equal(hasEligibleProPickSquadData(playerData(null, squad("Villarreal"))), false)
})
