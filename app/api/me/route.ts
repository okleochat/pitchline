import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getCurrentUser()
    return NextResponse.json({ user, isPro: user?.isPro ?? false }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 })
  }
}
