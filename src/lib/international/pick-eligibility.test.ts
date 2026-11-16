import assert from "node:assert/strict"
import test from "node:test"
import { hasInternationalPickHistory, MIN_INTL_HISTORY_FOR_PICKS } from "./pick-eligibility.ts"

test("international Best Picks require at least three previous matches per team", () => {
  assert.equal(MIN_INTL_HISTORY_FOR_PICKS, 3)
  assert.equal(hasInternationalPickHistory(5, 5), true)
  assert.equal(hasInternationalPickHistory(3, 4), true)
  assert.equal(hasInternationalPickHistory(2, 5), false)
  assert.equal(hasInternationalPickHistory(undefined, 5), false)
  assert.equal(hasInternationalPickHistory(5, undefined), false)
})
