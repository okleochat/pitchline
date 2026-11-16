import { Pitchline } from "@/components/pitchline"
import { getLiveBoardForPro } from "@/lib/live-board.server"
import { getCurrentUser } from "@/lib/firebase/server-session"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function HomePage() {
  const user = await getCurrentUser()
  const board = await getLiveBoardForPro(Boolean(user?.isPro))
  return <Pitchline initial={board} />
}
