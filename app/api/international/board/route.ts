import { NextRequest, NextResponse } from "next/server"
import { mergeInternationalFixtures } from "@/lib/live-board.server"
import { snapshotBoard } from "@/data/football"
import { getInternationalFixtures } from "@/lib/international/fixtures.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function lagosDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + "-" + values.month + "-" + values.day
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + "T00:00:00Z")
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("date")
  const date = requested || lagosDate()
  if (!validDate(date)) {
    return NextResponse.json({ error: "A valid YYYY-MM-DD date is required." }, { status: 400 })
  }

  try {
    // Keep the same ordering as the former server page so getLiveBoard's
    // upcoming international batch can be reused by the date-scoped lookup.
    const baseBoard = snapshotBoard()
    const fixtureResult = await getInternationalFixtures(date)
    const now = Date.now()
    const upcomingFixtures = fixtureResult.fixtures.filter((fixture) => {
      const kickoff = new Date(fixture.kickoff).getTime()
      return !fixture.completed && fixture.statusState === "pre" && kickoff > now
    })
    const nonUpcomingFixtures = fixtureResult.fixtures.filter((fixture) => {
      const kickoff = new Date(fixture.kickoff).getTime()
      return fixture.completed || fixture.statusState === "in" || kickoff <= now
    })

    // All date-scoped sides enter the simulator's team registry, but the board
    // merger itself adds only future fixtures. Results and live matches remain
    // separately rendered and cannot leak into Best Picks or upcoming fixtures.
    const board = await mergeInternationalFixtures(baseBoard, fixtureResult.fixtures)

    return NextResponse.json({
      board,
      fixtureResult,
      upcomingFixtures,
      nonUpcomingFixtures,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    console.error("[pitchline/international] Could not build date board", {
      message: error instanceof Error ? error.message : "unknown error",
    })
    return NextResponse.json(
      { error: "International fixtures are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
