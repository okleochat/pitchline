import { NextResponse } from "next/server"
import { refreshLiveBoard } from "@/lib/live-board.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const board = await refreshLiveBoard()
    const liveLeagueCount = Object.values(board.leagueStatus)
      .filter((status) => status.standings === "live").length
    return NextResponse.json({
      ok: true,
      updatedAt: board.updatedAt,
      teamCount: board.teams.length,
      fixtureCount: board.fixtures.length,
      liveLeagueCount,
    })
  } catch (error) {
    console.error("[pitchline/cron] Daily ESPN board refresh failed", error)
    return NextResponse.json({ error: "board_refresh_failed" }, { status: 503 })
  }
}
