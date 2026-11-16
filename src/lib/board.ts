import { createServerFn } from "@tanstack/react-start"

export const loadBoard = createServerFn({ method: "GET" }).handler(async () => {
  const { getLiveBoard } = await import("./live-board.server")
  return getLiveBoard()
})

export type FormGame = { gf: number; ga: number }
export type FormResult = {
  home: { games: FormGame[] } | null
  away: { games: FormGame[] } | null
}

export const loadForm = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const body = (input ?? {}) as Record<string, unknown>
    const slug = (value: unknown) => (typeof value === "string" ? value.slice(0, 40) : "")
    const id = (value: unknown) => (typeof value === "string" && /^\d{0,12}$/.test(value) ? value : "")
    return {
      homeSlug: slug(body.homeSlug),
      homeEspn: id(body.homeEspn),
      awaySlug: slug(body.awaySlug),
      awayEspn: id(body.awayEspn),
    }
  })
  .handler(async ({ data }) => {
    const { getRecentForm } = await import("./live-board.server")
    return getRecentForm(data)
  })
