import { NextResponse } from "next/server"
import { getLiveBoard } from "@/lib/live-board.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const board = await getLiveBoard()
  const statuses = Object.values(board.leagueStatus)
  const liveStandings = statuses.filter((item) => item.standings === "live").length
  const liveFixtures = statuses.filter((item) => item.fixtures === "live").length
  const snapshotFallbacks = statuses.filter(
    (item) => item.standings === "snapshot" || item.fixtures === "snapshot",
  ).length
  const oldestFeedTimestamp = statuses
    .flatMap((item) => [item.updatedAt, item.fixturesUpdatedAt])
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .reduce((oldest, value) => Math.min(oldest, value), Date.now())
  const webFirebaseConfigured = [
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ].every((value) => typeof value === "string" && value.length > 0)

  const health = board.source === "snapshot"
    ? "degraded"
    : snapshotFallbacks > 0
      ? "partial"
      : "ok"

  return NextResponse.json({
    status: health,
    checkedAt: new Date().toISOString(),
    board: {
      source: board.source,
      updatedAt: board.updatedAt,
      competitions: statuses.length,
      liveStandings,
      liveFixtures,
      competitionsWithSnapshotFallbacks: snapshotFallbacks,
      oldestFeedAgeMs: Math.max(0, Date.now() - oldestFeedTimestamp),
    },
    firebase: {
      webConfigured: webFirebaseConfigured,
      adminConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    },
  }, {
    status: health === "degraded" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
