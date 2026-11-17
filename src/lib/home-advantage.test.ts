import assert from "node:assert/strict"
import test from "node:test"
import { estimateHomeAdvantage, homeAdvantageForLeague } from "./home-advantage.ts"

test("home advantage uses recent completed home and away scoring", () => {
  const scores = Array.from({ length: 40 }, () => ({ homeGoals: 2, awayGoals: 1 }))
  const edge = estimateHomeAdvantage(scores)
  assert.ok(edge > 1.1 && edge < 1.3)
})

test("home advantage shrinks a small sample toward its prior", () => {
  const small = estimateHomeAdvantage([{ homeGoals: 3, awayGoals: 0 }])
  assert.equal(small, 1.1)
})

test("home advantage returns a conservative prior when no usable data exists", () => {
  assert.equal(estimateHomeAdvantage([]), 1.1)
  assert.equal(estimateHomeAdvantage([{ homeGoals: 2, awayGoals: 0 }]), 1.1)
})

test("international fixtures always use a neutral venue default", () => {
  assert.equal(homeAdvantageForLeague("int", 118), 1)
  assert.equal(homeAdvantageForLeague("eng", 116), 1.16)
  assert.equal(homeAdvantageForLeague("eng", undefined), 1.1)
})
