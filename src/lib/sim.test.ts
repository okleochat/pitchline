import assert from "node:assert/strict"
import test from "node:test"
import { analyticalMarkets, analyticalSplit, simulate } from "./sim.ts"

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
