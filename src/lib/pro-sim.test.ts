import assert from "node:assert/strict"
import test from "node:test"
import { PRO_SIM_RUNS, simulatePro } from "./pro-sim.ts"

const home = { id: "home", name: "Home FC", attack: 1.8, defense: 1.1 }
const away = { id: "away", name: "Away FC", attack: 1.2, defense: 1.6 }

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
