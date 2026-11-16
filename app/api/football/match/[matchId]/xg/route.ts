import { NextResponse, type NextRequest } from "next/server"
import { getMatchXg, SportsApiProError } from "@/lib/providers/sportsapipro.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params
  try {
    return NextResponse.json(await getMatchXg(matchId), {
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" },
    })
  } catch (error) {
    if (error instanceof SportsApiProError) {
      const status = error.code === "not_configured" ? 503
        : error.code === "invalid_response" ? 400
          : error.code === "rate_limited" ? 429
            : error.code === "feature_disabled" ? 403 : 502
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }
    return NextResponse.json({ error: "match_xg_unavailable" }, { status: 502 })
  }
}
