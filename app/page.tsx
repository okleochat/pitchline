import { Pitchline } from "@/components/pitchline"
import { snapshotBoard } from "@/data/football"

export default function HomePage() {
  // Render the bundled board immediately. Live ESPN refresh runs after the
  // client mounts, so a cold ESPN refresh cannot delay the first page paint.
  return <Pitchline initial={snapshotBoard()} />
}
