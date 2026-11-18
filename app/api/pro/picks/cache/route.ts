import { NextResponse, type NextRequest } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import type { MarketProbabilities } from "@/lib/sim"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PROBABILITY_FIELDS: (keyof MarketProbabilities)[] = [
  "home", "draw", "away", "btts", "homeClean", "awayClean",
  "over15", "under15", "over25", "under25", "over35",
]

type Dict = Record<string, unknown>

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function validCacheKey(value: unknown, uid: string): value is string {
  if (typeof value !== "string") return false
  const prefix = `pitchline:pro-picks:v1:${encodeURIComponent(uid)}:`
  return value.startsWith(prefix) && /^[a-z0-9]{2,32}$/.test(value.slice(prefix.length))
}

function validProbabilities(value: unknown): value is MarketProbabilities {
  const item = record(value)
  if (!item) return false
  return PROBABILITY_FIELDS.every((field) =>
    typeof item[field] === "number" && Number.isFinite(item[field]) &&
    (item[field] as number) >= 0 && (item[field] as number) <= 1,
  ) && Object.keys(item).every((field) => PROBABILITY_FIELDS.includes(field as keyof MarketProbabilities))
}

function validResults(value: unknown): value is Record<string, MarketProbabilities> {
  const item = record(value)
  if (!item) return false
  return Object.entries(item).every(([fixtureId, probabilities]) =>
    fixtureId.length > 0 && fixtureId.length <= 160 && validProbabilities(probabilities),
  )
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") return response({ error: "authentication_required" }, 401)
    if (code === "PRO_REQUIRED") return response({ error: "pro_required" }, 403)
    return response({ error: "subscription_verification_unavailable" }, 503)
  }

  let body: Dict | null = null
  try {
    body = record(await request.json())
  } catch {
    return response({ error: "invalid_json" }, 400)
  }
  if (!body) return response({ error: "invalid_json" }, 400)

  const action = body.action
  const cacheKey = body?.cacheKey
  const fixtureCount = body?.fixtureCount
  if (!validCacheKey(cacheKey, user.uid)) return response({ error: "invalid_cache_key" }, 400)
  if (!Number.isSafeInteger(fixtureCount) || (fixtureCount as number) < 1 || (fixtureCount as number) > 500) {
    return response({ error: "invalid_fixture_count" }, 400)
  }

  try {
    const ref = getFirebaseAdminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("pitchlineCache")
      .doc("proBestPicks")

    if (action === "read") {
      const snapshot = await ref.get()
      const saved = record(snapshot.data())
      if (!saved || saved.cacheKey !== cacheKey || saved.fixtureCount !== fixtureCount) {
        return response({ cache: null })
      }

      const savedAt = typeof saved.savedAt === "number" ? saved.savedAt : 0
      const excludedCount = saved.excludedCount
      if (!savedAt || Date.now() - savedAt > CACHE_TTL_MS || !Number.isSafeInteger(excludedCount) ||
          (excludedCount as number) < 0 || !validResults(saved.results)) {
        return response({ cache: null })
      }
      const results = saved.results as Record<string, MarketProbabilities>
      if (Object.keys(results).length + (excludedCount as number) !== fixtureCount) {
        return response({ cache: null })
      }
      return response({ cache: { results, excludedCount } })
    }

    if (action === "write") {
      const results = body.results
      const excludedCount = body.excludedCount
      if (!Number.isSafeInteger(excludedCount) || (excludedCount as number) < 0 ||
          !validResults(results)) {
        return response({ error: "invalid_cache_payload" }, 400)
      }
      const resultCount = Object.keys(results).length
      if (resultCount + (excludedCount as number) !== fixtureCount) {
        return response({ error: "incomplete_cache_payload" }, 400)
      }
      if (JSON.stringify(results).length > 700_000) {
        return response({ error: "cache_payload_too_large" }, 413)
      }

      const savedAt = Date.now()
      await ref.set({
        schemaVersion: 1,
        cacheKey,
        fixtureCount,
        results,
        excludedCount,
        savedAt,
        expiresAt: savedAt + CACHE_TTL_MS,
      })
      return response({ ok: true })
    }

    return response({ error: "invalid_action" }, 400)
  } catch {
    return response({ error: "cache_unavailable" }, 503)
  }
}
