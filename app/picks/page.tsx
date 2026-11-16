import { Pitchline } from "@/components/pitchline"
import { SiteHeader } from "@/components/site-header"
import { getLiveBoard } from "@/lib/live-board.server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PicksPage() {
  const board = await getLiveBoard()
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pt-4 pb-16 sm:px-6">
      <SiteHeader subtitle="Model-ranked fixtures and markets" />
      <Pitchline initial={board} initialView="picks" />
    </main>
  )
}
