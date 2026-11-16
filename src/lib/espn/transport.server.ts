import "server-only"

export type EspnJsonResult = {
  status: number
  ok: boolean
  data: Record<string, unknown> | null
}

/**
 * Status-aware ESPN transport for server-side diagnostics. The existing
 * nullable helper remains available to the live board and other callers.
 */
export async function getEspnJsonResult(url: string): Promise<EspnJsonResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", "user-agent": "Pitchline/1.0" },
      cache: "no-store",
    })
    if (!response.ok) {
      return { status: response.status, ok: false, data: null }
    }
    const payload: unknown = await response.json()
    const data = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null
    return { status: response.status, ok: true, data }
  } catch {
    return { status: 0, ok: false, data: null }
  }
}

/**
 * Shared server-side ESPN Site API transport used by the club board and the
 * international competition feed. ESPN's soccer scoreboard uses the same
 * endpoint shape for domestic leagues and national-team tournaments.
 */
export async function getEspnJson(url: string): Promise<Record<string, unknown> | null> {
  const result = await getEspnJsonResult(url)
  return result.ok ? result.data : null
}
