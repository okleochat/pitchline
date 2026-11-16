import assert from "node:assert/strict"
import test from "node:test"
import {
  buildLineupPlayerStats,
  deriveLineupFactors,
  derivePlayerScores,
  normaliseLineupPlayer,
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

test("player scores are derived from provider performance statistics", () => {
  const score = derivePlayerScores(attackerStats)
  assert.ok(score)
  assert.ok(score.attack > 50)
  assert.ok(score.creativity > 50)
  assert.equal(score.appearances, 24)
  assert.equal(score.seasonRating, 74.2)
})

test("lineup player preserves position and joins to season statistics by provider id", () => {
  const stats = buildLineupPlayerStats([{
    player: { id: 9, name: "Example Striker" },
    statistics: [attackerStats],
  }])
  const player = normaliseLineupPlayer({
    player: { id: 9, name: "Example Striker", number: 9, pos: "F", grid: "1:1" },
  }, stats)
  assert.equal(player?.position, "FW")
  assert.equal(player?.scores?.appearances, 24)
})

test("lineup strength stays neutral when too few starters have player data", () => {
  const starters = Array.from({ length: 11 }, (_, index) => ({
    id: String(index + 1),
    name: "Starter " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : "DF" as const,
    grid: null,
    scores: index < 4 ? {
      attack: 95, creativity: 90, defence: 95, goalkeeper: 90,
      seasonRating: 95, appearances: 25, minutes: 2000,
    } : null,
  }))
  const factors = deriveLineupFactors(starters, [])
  assert.equal(factors.applied, false)
  assert.equal(factors.attackMultiplier, 1)
  assert.equal(factors.defenceMultiplier, 1)
})

test("a well-covered strong starting XI produces bounded non-neutral factors", () => {
  const stats = {
    attack: 85, creativity: 82, defence: 80, goalkeeper: 80,
    seasonRating: 82, appearances: 25, minutes: 2000,
  }
  const starters = Array.from({ length: 11 }, (_, index) => ({
    id: String(index + 1),
    name: "Starter " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : index < 5 ? "DF" as const : index < 9 ? "MF" as const : "FW" as const,
    grid: null,
    scores: stats,
  }))
  const factors = deriveLineupFactors(starters, [])
  assert.equal(factors.applied, true)
  assert.ok(factors.attackMultiplier > 1 && factors.attackMultiplier <= 1.07)
  assert.ok(factors.defenceMultiplier < 1 && factors.defenceMultiplier >= 0.93)
})
