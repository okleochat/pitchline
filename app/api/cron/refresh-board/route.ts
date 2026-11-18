import { NextResponse } from "next/server"
import { refreshLiveBoard } from "@/lib/live-board.server"
import { precomputeProTeamSquadProfiles } from "@/lib/providers/ea-fc-ratings.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const board = await refreshLiveBoard()
    const liveLeagueCount = Object.values(board.leagueStatus)
      .filter((status) => status.standings === "live").length
    const squadProfiles = await precomputeProTeamSquadProfiles(board.teams.map((team) => ({
      id: team.id,
      name: team.name,
      league: team.league,
      rateLeague: team.rateLeague,
      espnId: team.espnId,
      feedSlug: team.feedSlug,
    })))
    return NextResponse.json({
      ok: true,
      updatedAt: board.updatedAt,
      teamCount: board.teams.length,
      fixtureCount: board.fixtures.length,
      liveLeagueCount,
      squadProfiles,
    })
  } catch (error) {
    console.error("[pitchline/cron] Daily ESPN board refresh failed", error)
    return NextResponse.json({ error: "board_refresh_failed" }, { status: 503 })
  }
}
