import type { ProPickFixtureInput } from "./board.ts"
import type { MarketProbabilities } from "./sim.ts"

export const PRO_PICK_CACHE_TTL_MS = 15 * 60 * 1000

export type ProPickCacheEntry = {
  savedAt: number
  results: Record<string, MarketProbabilities>
  excludedCount: number
}

export type ProPickCacheStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const CACHE_PREFIX = "pitchline:pro-picks:v1:"
const memoryCache = new Map<string, ProPickCacheEntry>()

function browserStorage(): ProPickCacheStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Stable, user-scoped fingerprint of every input that can change Pro picks. */
export function createProPickCacheKey(userId: string, inputs: ProPickFixtureInput[]): string {
  const serialized = JSON.stringify(inputs)
  let first = 2166136261
  let second = 0x9e3779b9

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ (code + index), 2246822519)
  }

  return CACHE_PREFIX + encodeURIComponent(userId) + ":" +
    (first >>> 0).toString(36) + (second >>> 0).toString(36)
}

function validEntry(
  value: unknown,
  expectedFixtureCount: number,
  now: number,
): value is ProPickCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const entry = value as Partial<ProPickCacheEntry>
  if (!Number.isFinite(entry.savedAt) || typeof entry.savedAt !== "number") return false
  if (now - entry.savedAt < 0 || now - entry.savedAt > PRO_PICK_CACHE_TTL_MS) return false
  if (!Number.isSafeInteger(entry.excludedCount) || (entry.excludedCount ?? -1) < 0) return false
  if (!entry.results || typeof entry.results !== "object" || Array.isArray(entry.results)) return false

  const resultEntries = Object.entries(entry.results)
  if (resultEntries.length === 0) return false
  if (resultEntries.length + (entry.excludedCount ?? 0) !== expectedFixtureCount) return false

  return resultEntries.every(([fixtureId, probabilities]) => {
    if (!fixtureId || !probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) return false
    const values = Object.values(probabilities)
    return values.length > 0 && values.every((value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
    )
  })
}

export function clearProPickCache(
  key: string,
  storage: ProPickCacheStorage | null = browserStorage(),
): void {
  memoryCache.delete(key)
  try {
    storage?.removeItem(key)
  } catch {
    // Browser storage can be disabled or unavailable.
  }
}

export function readProPickCache(
  key: string,
  expectedFixtureCount: number,
  now = Date.now(),
  storage: ProPickCacheStorage | null = browserStorage(),
): ProPickCacheEntry | null {
  const inMemory = memoryCache.get(key)
  if (inMemory) {
    if (validEntry(inMemory, expectedFixtureCount, now)) return inMemory
    memoryCache.delete(key)
  }

  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!validEntry(parsed, expectedFixtureCount, now)) {
      storage.removeItem(key)
      return null
    }
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    try { storage.removeItem(key) } catch {}
    return null
  }
}

/** Persist only complete batches, so an interrupted run is never mistaken for a complete board. */
export function writeProPickCache(
  key: string,
  entry: ProPickCacheEntry,
  expectedFixtureCount: number,
  storage: ProPickCacheStorage | null = browserStorage(),
): void {
  if (!validEntry(entry, expectedFixtureCount, entry.savedAt)) return
  memoryCache.set(key, entry)

  // Keep this tab's in-memory cache bounded if several different boards are opened.
  if (memoryCache.size > 8) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey) memoryCache.delete(oldestKey)
  }

  try {
    storage?.setItem(key, JSON.stringify(entry))
  } catch {
    // Storage can be disabled or full; the in-memory cache still works.
  }
}
