import "server-only"

type Dict = Record<string, unknown>

export class SportsApiProError extends Error {
  constructor(
    public readonly code: "not_configured" | "feature_disabled" | "rate_limited" | "upstream_error" | "invalid_response",
    message: string,
  ) {
    super(message)
    this.name = "SportsApiProError"
  }
}

const BASE_URL = "https://api.sportsapipro.com/v2/football"
const cache = new Map<string, { expiresAt: number; value: unknown }>()

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function enabled(name: string): boolean {
  return process.env[name]?.toLowerCase() === "true"
}

export function sportsApiProCapabilities() {
  const configured = Boolean(process.env.SPORTS_APIPRO_API_KEY?.trim())
  return {
    configured,
    xgEnabled: configured && enabled("SPORTS_APIPRO_XG_ENABLED"),
    oddsEnabled: configured && enabled("SPORTS_APIPRO_ODDS_ENABLED"),
  }
}

async function getJson(path: string, ttlMs: number): Promise<Dict> {
  const apiKey = process.env.SPORTS_APIPRO_API_KEY?.trim()
  if (!apiKey) throw new SportsApiProError("not_configured", "SportsAPI Pro is not configured.")

  const cacheKey = path
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value as Dict

  let response: Response
  try {
    response = await fetch(BASE_URL + path, {
      headers: { accept: "application/json", "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new SportsApiProError("upstream_error", "SportsAPI Pro could not be reached.")
  }

  if (response.status === 429) {
    throw new SportsApiProError("rate_limited", "SportsAPI Pro request quota or rate limit was reached.")
  }
  if (!response.ok) {
    throw new SportsApiProError("upstream_error", "SportsAPI Pro returned an unsuccessful response.")
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SportsApiProError("invalid_response", "SportsAPI Pro returned invalid JSON.")
  }
  const body = record(payload)
  if (!body || body.success === false) {
    throw new SportsApiProError("invalid_response", "SportsAPI Pro returned an unexpected response.")
  }

  cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value: body })
  if (cache.size > 150) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  return body
}

export async function getMatchXg(matchId: string) {
  if (!/^\d{1,14}$/.test(matchId)) throw new SportsApiProError("invalid_response", "Invalid match ID.")
  if (!enabled("SPORTS_APIPRO_XG_ENABLED")) {
    throw new SportsApiProError("feature_disabled", "The xG integration is disabled until provider coverage is verified.")
  }

  const payload = await getJson("/match/" + matchId + "/shotmap", 60 * 1000)
  const data = record(payload.data)
  const shots = Array.isArray(data?.shotmap) ? data.shotmap.map(record).filter((shot): shot is Dict => Boolean(shot)) : []
  if (!shots.length || shots.some((shot) => number(shot.xg) === null || typeof shot.isHome !== "boolean")) {
    return {
      available: false as const,
      source: "SportsAPI Pro",
      reason: "This competition does not return a complete shot-level xG feed for the match.",
    }
  }

  const homeShots = shots.filter((shot) => shot.isHome === true)
  const awayShots = shots.filter((shot) => shot.isHome === false)
  return {
    available: true as const,
    source: "SportsAPI Pro",
    matchId,
    home: {
      xg: homeShots.reduce((sum, shot) => sum + (number(shot.xg) ?? 0), 0),
      xgot: homeShots.reduce((sum, shot) => sum + (number(shot.xgot) ?? 0), 0),
      shots: homeShots.length,
    },
    away: {
      xg: awayShots.reduce((sum, shot) => sum + (number(shot.xg) ?? 0), 0),
      xgot: awayShots.reduce((sum, shot) => sum + (number(shot.xgot) ?? 0), 0),
      shots: awayShots.length,
    },
    note: "Match-level xG is summed from the provider's shot-level values. This is post-kickoff data and must not be used as a pre-match feature for this same fixture.",
  }
}

export async function getMatchOdds(matchId: string) {
  if (!/^\d{1,14}$/.test(matchId)) throw new SportsApiProError("invalid_response", "Invalid match ID.")
  if (!enabled("SPORTS_APIPRO_ODDS_ENABLED")) {
    throw new SportsApiProError("feature_disabled", "The bookmaker odds integration is disabled.")
  }

  const payload = await getJson("/match/" + matchId + "/odds/pre-match", 30 * 1000)
  const data = record(payload.data)
  return {
    source: "SportsAPI Pro",
    matchId,
    markets: Array.isArray(data?.markets) ? data.markets : [],
    retrievedAt: new Date().toISOString(),
  }
}
