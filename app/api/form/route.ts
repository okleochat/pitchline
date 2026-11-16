import { NextRequest, NextResponse } from "next/server"
import { getRecentForm } from "@/lib/live-board.server"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeText(value: string | null, max: number): string {
  return (value ?? "").slice(0, max)
}
function safeId(value: string | null): string {
  const candidate = value ?? ""
  return /^\d{1,12}$/.test(candidate) ? candidate : ""
}
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const input = {
    homeSlug: safeText(params.get("homeSlug"), 40),
    homeEspn: safeId(params.get("homeEspn")),
    awaySlug: safeText(params.get("awaySlug"), 40),
    awayEspn: safeId(params.get("awayEspn")),
    homeName: safeText(params.get("homeName"), 100),
    awayName: safeText(params.get("awayName"), 100),
  }
  try {
    const user = await getCurrentUser()
    const result = await getRecentForm(input, Boolean(user?.isPro))
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch {
    return NextResponse.json({ error: "form_unavailable" }, { status: 503 })
  }
}
