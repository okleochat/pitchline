import { NextRequest, NextResponse } from "next/server"
import { getSportmonksFixtures, sportmonksConfig, SportmonksError } from "@/lib/providers/sportmonks"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(value + "T00:00:00Z")
  return Number.isFinite(time) ? value : null
}

export async function GET(request: NextRequest) {
  const config = sportmonksConfig()
  const startInput = request.nextUrl.searchParams.get("start")
  const endInput = request.nextUrl.searchParams.get("end")

  if (!startInput && !endInput) {
    return NextResponse.json({
      provider: "Sportmonks Football API v3",
      ...config,
      features: {
        fixtures: config.configured,
        teamXg: config.xgEnabled,
        prematchOdds: config.oddsEnabled,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } })
  }

  const start = validDate(startInput)
  const end = validDate(endInput)
  if (!start || !end) return NextResponse.json({ error: "Use valid YYYY-MM-DD start and end dates." }, { status: 400 })

  const user = await getCurrentUser()
  if (!user?.isPro) return NextResponse.json({ error: "pro_required" }, { status: user ? 403 : 401 })

  try {
    const result = await getSportmonksFixtures(start, end)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error) {
    const message = error instanceof SportmonksError ? error.message : "Sportmonks request failed."
    const status = error instanceof SportmonksError && error.status === 429 ? 429 :
      error instanceof SportmonksError && error.status ? 502 :
        message.includes("not configured") ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
