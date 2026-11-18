import { NextResponse } from "next/server"
import { getLiveBoard } from "@/lib/live-board.server"
import { sportsApiProCapabilities } from "@/lib/providers/sportsapipro.server"
import { firebaseAdminCredentialMode, getFirebaseAdminFirestore } from "@/lib/firebase/admin"

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

  const adminCredentialMode = firebaseAdminCredentialMode()
  const providers = sportsApiProCapabilities()
  let eaFc27Snapshot: {
    available: boolean
    syncedAt: string | null
    playerCount: number | null
    shardCount: number | null
    ageMs: number | null
  } = {
    available: false,
    syncedAt: null,
    playerCount: null,
    shardCount: null,
    ageMs: null,
  }

  try {
    const metadataSnapshot = await getFirebaseAdminFirestore()
      .collection("ea_fc27_meta")
      .doc("current")
      .get()
    const metadata = metadataSnapshot.data()
    const activeCollection = typeof metadata?.activeCollection === "string"
      ? metadata.activeCollection
      : ""
    if (metadataSnapshot.exists && /^ea_fc27_players_[a-zA-Z0-9_]+$/.test(activeCollection)) {
      const sample = await getFirebaseAdminFirestore()
        .collection(activeCollection)
        .limit(1)
        .get()
      const syncedAt = typeof metadata?.syncedAt === "string" ? metadata.syncedAt : null
      eaFc27Snapshot = {
        available: !sample.empty,
        syncedAt,
        playerCount: typeof metadata?.playerCount === "number" ? metadata.playerCount : null,
        shardCount: typeof metadata?.shardCount === "number" ? metadata.shardCount : null,
        ageMs: syncedAt && Number.isFinite(Date.parse(syncedAt))
          ? Math.max(0, Date.now() - Date.parse(syncedAt))
          : null,
      }
    }
  } catch {
    // Health output reports the EA snapshot as unavailable without exposing credentials.
  }

  const health = board.source === "snapshot"
    ? "degraded"
    : snapshotFallbacks > 0 || !eaFc27Snapshot.available
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
      adminCredentialMode,
      eaFc27Snapshot,
      adminPermissionCheck: "not_performed",
      subscriptionRecords: "server-managed",
    },
    footballProviders: {
      sportsApiPro: providers,
    },
  }, {
    status: health === "degraded" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
