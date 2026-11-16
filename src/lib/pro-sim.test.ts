import assert from "node:assert/strict"
import test from "node:test"
import { PRO_SIM_RUNS } from "./pro-sim-config.ts"
import { simulatePro } from "./pro-sim.ts"

const home = { id: "home", name: "Home FC", league: "eng" as const, attack: 1.8, defense: 1.1 }
const away = { id: "away", name: "Away FC", league: "eng" as const, attack: 1.2, defense: 1.6 }

test("Pro engine is deterministic for the same fixture and run seed", () => {
  const first = simulatePro(home, away, 1.1, 4)
  const second = simulatePro(home, away, 1.1, 4)
  assert.deepEqual(first.scores, second.scores)
  assert.deepEqual(first.probabilities, second.probabilities)
  assert.equal(first.engine, "phase-of-play-v1")
})

test("Pro engine returns a complete probability distribution and score sample", () => {
  const report = simulatePro(home, away, 1.1, 2)
  assert.equal(report.n, PRO_SIM_RUNS)
  assert.equal(report.scores.length, PRO_SIM_RUNS)
  assert.equal(report.matrix.length, 6)
  assert.equal(report.margins.reduce((sum, value) => sum + value, 0), PRO_SIM_RUNS)
  assert.equal(report.totals.reduce((sum, value) => sum + value, 0), PRO_SIM_RUNS)

  const resultTotal = report.probabilities.home + report.probabilities.draw + report.probabilities.away
  assert.ok(Math.abs(resultTotal - 1) < 1e-12)
  assert.ok(report.probabilities.btts >= 0 && report.probabilities.btts <= 1)
  assert.ok(report.probabilities.over25 >= 0 && report.probabilities.over25 <= 1)
})

test("phase metrics and expected goals remain finite and bounded", () => {
  const report = simulatePro(home, away, 1, 0)
  assert.ok(Number.isFinite(report.homeXg) && report.homeXg > 0)
  assert.ok(Number.isFinite(report.awayXg) && report.awayXg > 0)
  assert.ok(report.details.possessionHomePct > 0 && report.details.possessionHomePct < 100)
  assert.ok(report.details.shotsHome > 0 && report.details.shotsAway > 0)
  assert.ok(report.details.buildUpSuccessHomePct > 0 && report.details.buildUpSuccessHomePct < 100)
  assert.ok(report.details.progressionSuccessAwayPct > 0 && report.details.progressionSuccessAwayPct < 100)
})

test("increasing attack creates a higher Pro expected-goal estimate in a controlled matchup", () => {
  const strongerHome = { ...home, attack: 2.8 }
  const weakerHome = { ...home, attack: 0.8 }
  const stronger = simulatePro(strongerHome, away, 1, 11)
  const weaker = simulatePro(weakerHome, away, 1, 11)
  assert.ok(stronger.homeXg > weaker.homeXg)
})


test("player-derived starting XI factors change the Pro match inputs", () => {
  const neutral = simulatePro(home, away, 1, 12)
  const strongHome = simulatePro(home, away, 1, 12, {
    attackMultiplier: 1.06,
    creativityMultiplier: 1.05,
    defenceMultiplier: 0.95,
    benchStrength: 62,
    ratedStarters: 10,
    starterCount: 11,
    coverage: 10 / 11,
    applied: true,
  }, {
    attackMultiplier: 0.96,
    creativityMultiplier: 0.98,
    defenceMultiplier: 1.04,
    benchStrength: 45,
    ratedStarters: 9,
    starterCount: 11,
    coverage: 9 / 11,
    applied: true,
  })
  assert.ok(strongHome.homeXg > neutral.homeXg)
  assert.ok(strongHome.awayXg < neutral.awayXg)
  assert.equal(strongHome.details.playerAdjustmentsApplied, true)
})

test("partial player coverage does not apply one-sided lineup adjustments", () => {
  const report = simulatePro(home, away, 1, 9, {
    attackMultiplier: 1.06,
    creativityMultiplier: 1.05,
    defenceMultiplier: 0.95,
    benchStrength: 62,
    ratedStarters: 10,
    starterCount: 11,
    coverage: 10 / 11,
    applied: true,
  }, {
    attackMultiplier: 1,
    creativityMultiplier: 1,
    defenceMultiplier: 1,
    benchStrength: 50,
    ratedStarters: 4,
    starterCount: 11,
    coverage: 4 / 11,
    applied: false,
  })
  const neutral = simulatePro(home, away, 1, 9)
  assert.equal(report.details.playerAdjustmentsApplied, false)
  assert.equal(report.homeXg, neutral.homeXg)
  assert.equal(report.awayXg, neutral.awayXg)
})
