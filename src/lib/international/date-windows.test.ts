import assert from "node:assert/strict"
import test from "node:test"
import { canReuseUpcomingCache, monthKeysInRange } from "./date-windows.ts"

test("one-month upcoming window uses one calendar bucket", () => {
  assert.deepEqual(monthKeysInRange("2026-11-16", "2026-11-30"), ["202611"])
})

test("window crossing a month boundary uses both calendar buckets", () => {
  assert.deepEqual(monthKeysInRange("2026-11-29", "2026-12-13"), ["202611", "202612"])
})

test("window crossing a year boundary uses both years", () => {
  assert.deepEqual(monthKeysInRange("2026-12-29", "2027-01-04"), ["202612", "202701"])
})

test("invalid ranges are rejected", () => {
  assert.throws(() => monthKeysInRange("2026-02-31", "2026-03-02"))
  assert.throws(() => monthKeysInRange("2026-11-30", "2026-11-01"))
  assert.throws(() => monthKeysInRange("yesterday", "2026-11-01"))
})

test("upcoming-only cache is not used for today's results", () => {
  assert.equal(canReuseUpcomingCache("2026-11-16", "2026-11-16", "2026-11-30"), false)
  assert.equal(canReuseUpcomingCache("2026-11-17", "2026-11-16", "2026-11-30"), true)
  assert.equal(canReuseUpcomingCache("2026-12-01", "2026-11-16", "2026-11-30"), false)
})
