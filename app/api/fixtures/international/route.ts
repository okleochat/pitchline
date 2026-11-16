import { NextRequest, NextResponse } from "next/server"
import { getInternationalFixtures } from "@/lib/international.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const result = await getInternationalFixtures({
      start: request.nextUrl.searchParams.get("start"),
      end: request.nextUrl.searchParams.get("end"),
    })
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load international fixtures."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
