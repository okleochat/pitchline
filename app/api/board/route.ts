import { NextResponse } from "next/server"
import { getLiveBoard } from "@/lib/live-board.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const board = await getLiveBoard()
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch {
    return NextResponse.json({ error: "board_unavailable" }, { status: 503 })
  }
}
