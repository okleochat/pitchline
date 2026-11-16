import assert from "node:assert/strict"
import test from "node:test"
import { analyticalMarkets, analyticalSplit, expectedGoals, playOne, simulate } from "./sim.ts"

const home = { id: "home", attack: 1.65, defense: 0.9, scorers: ["One", "Two", "Three"] }
const away = { id: "away", attack: 1.2, defense: 1.4, scorers: ["Four", "Five", "Six"] }

test("analytical probabilities are bounded and normalized", () => {
  for (const model of ["plain", "dixon"] as const) {
    const p = analyticalMarkets(home as never, away as never, 1.08, model)
    for (const value of Object.values(p)) assert.ok(value >= 0 && value <= 1)
    assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-10)
    assert.ok(Math.abs(p.over25 + p.under25 - 1) < 1e-10)
    assert.ok(Math.abs(p.over15 + p.under15 - 1) < 1e-10)
  }
})

test("analytical split and market probabilities use the same grid", () => {
  const split = analyticalSplit(home as never, away as never, 1, "dixon")
  const markets = analyticalMarkets(home as never, away as never, 1, "dixon")
  assert.equal(split.home, markets.home)
  assert.equal(split.draw, markets.draw)
  assert.equal(split.away, markets.away)
})

test("Monte Carlo score sample is deterministic and does not control headline probabilities", () => {
  const first = simulate(home as never, away as never, 1, 0, "plain")
  const second = simulate(home as never, away as never, 1, 0, "plain")
  const otherRoll = simulate(home as never, away as never, 1, 1, "plain")
  assert.deepEqual(first.scores, second.scores)
  assert.equal(first.n, 1000)
  assert.deepEqual(first.probabilities, otherRoll.probabilities)
})

test("match tape never presents generic placeholder labels as real player names", () => {
  const generic = { id: "generic", attack: 3.2, defense: 0.8, scorers: ["Attacker", "Attacker", "Attacker"] }
  const opponent = { id: "opponent", attack: 3.2, defense: 0.8, scorers: ["Attacker", "Attacker", "Attacker"] }
  const tape = playOne(generic as never, opponent as never, 1, 99, "plain")
  assert.ok(tape.length > 0)
  assert.ok(tape.every((event) => !event.text.includes("Attacker")))
})

test("source-attributed xG is used only when both teams have complete xG rates", () => {
  const homeXg = { ...home, xgFor: 2.1, xgAgainst: 0.7, xgSource: "provider · last 5" }
  const awayXg = { ...away, xgFor: 0.8, xgAgainst: 1.9, xgSource: "provider · last 5" }
  const source = expectedGoals(homeXg as never, awayXg as never, 1)
  const goalsOnly = expectedGoals(home as never, away as never, 1)
  assert.notDeepEqual(source, goalsOnly)
  const incomplete = expectedGoals(homeXg as never, away as never, 1)
  assert.deepEqual(incomplete, goalsOnly)
})
