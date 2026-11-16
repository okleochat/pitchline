import "server-only"

/**
 * Shared server-side ESPN Site API transport used by the club board and the
 * international competition feed. ESPN's soccer scoreboard uses the same
 * endpoint shape for domestic leagues and national-team tournaments.
 */
export async function getEspnJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", "user-agent": "Pitchline/1.0" },
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
