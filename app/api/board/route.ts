import { NextResponse } from "next/server"
import { getLiveBoardForPro } from "@/lib/live-board.server"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getCurrentUser()
    const board = await getLiveBoardForPro(Boolean(user?.isPro))
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch {
    return NextResponse.json({ error: "board_unavailable" }, { status: 503 })
  }
}
