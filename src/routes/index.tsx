import { createFileRoute } from "@tanstack/react-router"
import { Pitchline } from "@/components/pitchline"
import { loadBoard } from "@/lib/board"

export const Route = createFileRoute("/")({
  loader: () => loadBoard(),
  component: Home,
})

function Home() {
  const board = Route.useLoaderData()
  return <Pitchline initial={board} />
}
