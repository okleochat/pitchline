import { NextRequest, NextResponse } from "next/server"
import { getInternationalFixtures, SportsApiProError } from "@/lib/providers/sportsapipro.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("date")
  const date = requested || new Date().toISOString().slice(0, 10)

  try {
    const result = await getInternationalFixtures(date)
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    })
  } catch (error) {
    if (error instanceof SportsApiProError) {
      const status = error.code === "not_configured" ? 503
        : error.code === "invalid_response" ? 400
          : error.code === "rate_limited" ? 429
            : error.code === "feature_disabled" ? 403 : 502
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }
    return NextResponse.json({ error: "international_fixtures_unavailable" }, { status: 502 })
  }
}
