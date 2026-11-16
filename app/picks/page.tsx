import { Pitchline } from "@/components/pitchline"
import { getLiveBoard } from "@/lib/live-board.server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PicksPage() {
  const board = await getLiveBoard()
  return <Pitchline initial={board} initialView="picks" />
}
