import assert from "node:assert/strict"
import test from "node:test"
import {
  PRO_PICK_CACHE_TTL_MS,
  createProPickCacheKey,
  readProPickCache,
  writeProPickCache,
  type ProPickCacheStorage,
} from "./pro-pick-cache.ts"
import type { ProPickFixtureInput } from "./board.ts"
import type { MarketProbabilities } from "./sim.ts"

class TestStorage implements ProPickCacheStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const probabilities: MarketProbabilities = {
  home: 0.52, draw: 0.25, away: 0.23, btts: 0.55,
  homeClean: 0.3, awayClean: 0.2, over15: 0.74, under15: 0.26,
  over25: 0.48, under25: 0.52, over35: 0.25,
}

const fixtures: ProPickFixtureInput[] = [{
  fixtureId: "fixture-1",
  home: { id: "home", name: "Home FC", attack: 1.6, defense: 1.1, league: "eng" },
  away: { id: "away", name: "Away FC", attack: 1.2, defense: 1.4, league: "eng" },
  edge: 1.12,
}]

test("Pro picks cache key is stable and scoped to user and complete inputs", () => {
  assert.equal(createProPickCacheKey("user-a", fixtures), createProPickCacheKey("user-a", fixtures))
  assert.notEqual(createProPickCacheKey("user-a", fixtures), createProPickCacheKey("user-b", fixtures))
  assert.notEqual(
    createProPickCacheKey("user-a", fixtures),
    createProPickCacheKey("user-a", [{ ...fixtures[0], edge: 1.13 }]),
  )
})

test("complete Pro pick results round-trip through session storage", () => {
  const storage = new TestStorage()
  const key = createProPickCacheKey("user-round-trip", fixtures)
  const entry = {
    savedAt: 1_000_000,
    results: { "fixture-1": probabilities },
    excludedCount: 0,
  }

  writeProPickCache(key, entry, fixtures.length, storage)
  assert.deepEqual(readProPickCache(key, fixtures.length, 1_000_001, storage), entry)
})

test("incomplete Pro pick batches are not cached", () => {
  const storage = new TestStorage()
  const key = createProPickCacheKey("user-incomplete", fixtures)
  writeProPickCache(key, {
    savedAt: 1_000_000,
    results: {},
    excludedCount: 0,
  }, fixtures.length, storage)

  assert.equal(storage.getItem(key), null)
  assert.equal(readProPickCache(key, fixtures.length, 1_000_001, storage), null)
})

test("expired Pro pick results are discarded", () => {
  const storage = new TestStorage()
  const key = createProPickCacheKey("user-expired", fixtures)
  const entry = {
    savedAt: 1_000_000,
    results: { "fixture-1": probabilities },
    excludedCount: 0,
  }
  writeProPickCache(key, entry, fixtures.length, storage)

  assert.equal(
    readProPickCache(key, fixtures.length, entry.savedAt + PRO_PICK_CACHE_TTL_MS + 1, storage),
    null,
  )
  assert.equal(storage.getItem(key), null)
})
