import { NextRequest, NextResponse } from "next/server"
import { getInternationalFixtures } from "@/lib/international/fixtures.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("date")
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const today = values.year + "-" + values.month + "-" + values.day
  const date = requested || today

  try {
    const result = await getInternationalFixtures(date)
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "International fixtures are temporarily unavailable."
    const status = message.includes("valid YYYY-MM-DD") ? 400 : 502
    return NextResponse.json({ error: "international_fixtures_unavailable", message }, {
      status,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
