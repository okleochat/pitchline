import type { Board } from "@/data/football"
import type { ProReport, ProTeam } from "@/lib/pro-sim"

export type FormGame = { gf: number; ga: number }
export type FormResult = {
  home: { games: FormGame[] } | null
  away: { games: FormGame[] } | null
}

export async function loadBoard(): Promise<Board> {
  const response = await fetch("/api/board", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not refresh the Pitchline board.")
  return (await response.json()) as Board
}

export async function loadForm(input: {
  data: { homeSlug: string; homeEspn: string; awaySlug: string; awayEspn: string }
}): Promise<FormResult> {
  const query = new URLSearchParams(input.data)
  const response = await fetch("/api/form?" + query.toString(), { cache: "no-store" })
  if (!response.ok) throw new Error("Could not refresh recent form.")
  return (await response.json()) as FormResult
}


export async function loadProSimulation(input: {
  data: { home: ProTeam; away: ProTeam; edge: number; roll: number; fixture?: { kickoffAt: string } }
  signal?: AbortSignal
}): Promise<ProReport> {
  const response = await fetch("/api/pro/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (response.status === 401 || result.error === "authentication_required") {
      throw new Error("Sign in to use the Pro simulation engine.")
    }
    if (response.status === 403 || result.error === "pro_required") {
      throw new Error("An active Pro subscription is required for this engine.")
    }
    if (response.status === 503) {
      throw new Error("Pitchline could not verify your Pro subscription. Try again shortly.")
    }
    throw new Error("The Pro simulation could not be completed.")
  }
  return (await response.json()) as ProReport
}
