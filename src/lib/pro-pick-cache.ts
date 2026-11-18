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
  if (!value || typeof value !== "object" || Array.i¶»§q«^