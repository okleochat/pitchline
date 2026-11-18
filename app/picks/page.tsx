import { Pitchline } from "@/components/pitchline"
import { getBoardSnapshot } from "@/lib/live-board.server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PicksPage() {
  // Use the Firestore snapshot when available; never rebuild from ESPN here.
  const initial = await getBoardSnapshot()
  return <Pitchline initial={initial} initialView="picks" />
}
