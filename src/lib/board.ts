import type { Board } from "@/data/football"
import type { ProReport, ProTeam } from "@/lib/pro-sim"
import type { MarketProbabilities } from "@/lib/sim"

export type FormGame = { gf: number; ga: number }
export type FormResult = {
  home: { games: FormGame[] } | null
  away: { games: FormGame[] } | null
}

export async function loadBoard(): Promise<Board> {
  const response = await fetch("/api/board", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not refresh the Pitchline board.")
  return (await response.json()) as Board
}

export async function loadForm(input: {
  data: { homeSlug: string; homeEspn: string; awaySlug: string; awayEspn: string }
}): Promise<FormResult> {
  const query = new URLSearchParams(input.data)
  const response = await fetch("/api/form?" + query.toString(), { cache: "no-store" })
  if (!response.ok) throw new Error("Could not refresh recent form.")
  return (await response.json()) as FormResult
}


export async function loadProSimulation(input: {
  data: { home: ProTeam; away: ProTeam; edge: number; roll: number }
  signal?: AbortSignal
}): Promise<ProReport> {
  const response = await fetch("/api/pro/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (response.status === 401 || result.error === "authentication_required") {
      throw new Error("Sign in to use the Pro simulation engine.")
    }
    if (response.status === 403 || result.error === "pro_required") {
      throw new Error("An active Pro subscription is required for this engine.")
    }
    if (response.status === 503) {
      throw new Error("Pitchline could not verify your Pro subscription. Try again shortly.")
    }
    throw new Error("The Pro simulation could not be completed.")
  }
  return (await response.json()) as ProReport
}

export type ProPickFixtureInput = {
  fixtureId: string
  home: ProTeam
  away: ProTeam
  edge: number
}

export async function loadProPickMarkets(input: {
  data: { fixtures: ProPickFixtureInput[] }
  signal?: AbortSignal
}): Promise<{
  results: { fixtureId: string; probabilities: MarketProbabilities }[]
  excludedCount: number
}> {
  const response = await fetch("/api/pro/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (response.status === 401 || result.error === "authentication_required") {
      throw new Error("Sign in to use Pro Best Picks.")
    }
    if (response.status === 403 || result.error === "pro_required") {
      throw new Error("An active Pro subscription is required.")
    }
    if (response.status === 503) {
      throw new Error("Pitchline could not verify your Pro subscription. Try again shortly.")
    }
    throw new Error("Pro Best Picks could not be calculated.")
  }
  const result = (await response.json()) as {
    results?: { fixtureId: string; probabilities: MarketProbabilities }[]
    excludedCount?: number
  }
  return {
    results: Array.isArray(result.results) ? result.results : [],
    excludedCount: Number.isSafeInteger(result.excludedCount) && (result.excludedCount ?? 0) > 0
      ? result.excludedCount as number
      : 0,
  }
}


export type StoredProPickCache = {
  results: Record<string, MarketProbabilities>
  excludedCount: number
}

async function requestStoredProPickCache(
  data: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("/api/pro/picks/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  })
}

export async function readStoredProPickCache(input: {
  cacheKey: string
  fixtureCount: number
  signal?: AbortSignal
}): Promise<StoredProPickCache | null> {
  const response = await requestStoredProPickCache({
    action: "read",
    cacheKey: input.cacheKey,
    fixtureCount: input.fixtureCount,
  }, input.signal)
  if (!response.ok) throw new Error("Could not read saved Pro picks.")
  const payload = (await response.json()) as { cache?: StoredProPickCache | null }
  const cache = payload.cache
  if (!cache || !cache.results || typeof cache.results !== "object" || Array.isArray(cache.results)) return null
  if (!Number.isSafeInteger(cache.excludedCount) || cache.excludedCount < 0) return null
  if (Object.keys(cache.results).length + cache.excludedCount !== input.fixtureCount) return null
  return cache
}

export async function writeStoredProPickCache(input: {
  cacheKey: string
  fixtureCount: number
  results: Record<string, MarketProbabilities>
  excludedCount: number
}): Promise<void> {
  const response = await requestStoredProPickCache({
    action: "write",
    cacheKey: input.cacheKey,
    fixtureCount: input.fixtureCount,
    results: input.results,
    excludedCount: input.excludedCount,
  })
  if (!response.ok) throw new Error("Could not save Pro picks.")
}
