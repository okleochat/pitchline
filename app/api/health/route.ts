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
    playerCoun¶»§q«^