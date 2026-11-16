import type { Board } from "@/data/football"

export type FormGame = { gf: number; ga: number; xgf?: number; xga?: number }
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
