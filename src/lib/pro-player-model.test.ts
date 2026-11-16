import assert from "node:assert/strict"
import test from "node:test"
import {
  buildPlayerSeasonStats,
  derivePlayerScores,
  deriveSquadFactors,
  normaliseSquadPlayer,
} from "./pro-player-model.ts"

const attackerStats = {
  games: { appearences: 24, minutes: 1850, rating: "7.42" },
  goals: { total: 14, assists: 5 },
  shots: { total: 58, on: 31 },
  passes: { total: 410, key: 32, accuracy: "82" },
  tackles: { total: 12, interceptions: 4 },
  duels: { total: 90, won: 47 },
  dribbles: { attempts: 35, success: 19 },
}

const strongScores = {
  attack: 85,
  creativity: 82,
  defence: 80,
  goalkeeper: 80,
  seasonRating: 82,
  appearances: 25,
  minutes: 2000,
}

test("player scores are derived from provider performance statistics", () => {
  const score = derivePlayerScores(attackerStats)
  assert.ok(score)
  assert.ok(score.attack !== null)
  assert.ok(score.creativity !== null)
  assert.ok(score.attack > 50)
  assert.ok(score.creativity > 50)
  assert.equal(score.appearances, 24)
  assert.equal(score.seasonRating, 74.2)
})

test("registered squad players join season statistics by provider player ID", () => {
  const stats = buildPlayerSeasonStats([{
    player: { id: 9, name: "Example Striker" },
    statistics: [attackerStats],
  }])
  const player = normaliseSquadPlayer({
    id: 9,
    name: "Example Striker",
    number: 9,
    position: "Attacker",
  }, stats)
  assert.equal(player?.position, "FW")
  assert.equal(player?.scores?.appearances, 24)
})

test("the whole registered squad remains neutral when performance coverage is too low", () => {
  const players = Array.from({ length: 24 }, (_, index) => ({
    id: String(index + 1),
    name: "Squad player " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : index < 9 ? "DF" as const : index < 17 ? "MF" as const : "FW" as const,
    scores: index < 6 ? strongScores : null,
  }))
  const result = deriveSquadFactors(players)
  assert.equal(result.factors.applied, false)
  assert.equal(result.factors.squadCount, 24)
  assert.equal(result.factors.ratedPlayers, 6)
  assert.equal(result.factors.attackMultiplier, 1)
  assert.equal(result.factors.creativityMultiplier, 1)
  assert.equal(result.factors.defenceMultiplier, 1)
})

test("well-covered squad statistics produce bounded non-neutral team factors", () => {
  const players = Array.from({ length: 24 }, (_, index) => ({
    id: String(index + 1),
    name: "Squad player " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : index < 8 ? "DF" as const : index < 17 ? "MF" as const : "FW" as const,
    scores: index < 18 ? {
      ...strongScores,
      minutes: 2200 - index * 65,
      seasonRating: 82 - index * 0.2,
    } : null,
  }))
  const result = deriveSquadFactors(players)
  assert.equal(result.factors.applied, true)
  assert.equal(result.factors.ratedPlayers, 18)
  assert.equal(result.factors.squadCount, 24)
  assert.ok(result.attackIndex > 50)
  assert.ok(result.creativityIndex > 50)
  assert.ok(result.defenceIndex > 50)
  assert.ok(result.factors.attackMultiplier > 1 && result.factors.attackMultiplier <= 1.07)
  assert.ok(result.factors.creativityMultiplier > 1 && result.factors.creativityMultiplier <= 1.08)
  assert.ok(result.factors.defenceMultiplier < 1 && result.factors.defenceMultiplier >= 0.93)
  assert.ok(result.factors.squadDepth > 0 && result.factors.squadDepth <= 100)
})

test("missing or invalid squad player records are ignored safely", () => {
  assert.equal(normaliseSquadPlayer(null, new Map()), null)
  assert.equal(normaliseSquadPlayer({ name: "No ID" }, new Map()), null)
  assert.equal(normaliseSquadPlayer({ id: 1, name: "  " }, new Map()), null)
})
