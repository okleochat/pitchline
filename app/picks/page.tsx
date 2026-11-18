import { Pitchline } from "@/components/pitchline"
import { snapshotBoard } from "@/data/football"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function PicksPage() {
  // Match the homepage: render immediately from the bundled board. Pitchline
  // refreshes the shared live board in the browser after the first paint.
  return <Pitchline initial={snapshotBoard()} initialView="picks" />
}
