import assert from "node:assert/strict"
import test from "node:test"
import { simulatePro, type ProTeam } from "./pro-sim.ts"
import { runProEngine } from "./pro-engine.ts"
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
  const shar¶»§q«^