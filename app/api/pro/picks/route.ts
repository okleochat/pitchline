import { NextResponse, type NextRequest } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { type ProTeam } from "@/lib/pro-sim"
import { runProEngine } from "@/lib/pro-engine"
import { getProPlayerData } from "@/lib/providers/ea-fc-ratings.server"
import type { LeagueId } from "@/data/football"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Dict = Record<string, unknown>
type PickFixtureInput = {
  fixtureId: string
  home: ProTeam
  away: ProTeam
  edge: number
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

const LEAGUE_IDS = new Set<LeagueId>([
  "eng", "esp", "ita", "ger", "fra", "ch", "ned", "por", "tur",
  "ksa", "mls", "bra", "mx", "ucl", "uel", "uecl", "int",
])

function leagueValue(value: unknown): LeagueId | undefined {
  return typeof value === "string" && LEAGUE_IDS.has(value as LeagueId)
    ? value as LeagueId
    : undefined
}

function teamInput(value: unknown): ProTeam | null {
  const item = record(value)
  if (!item) return null
  const id = typeof item.id === "string" ? item.id.trim() : ""
  const name = typeof item.name === "string" ? item.name.trim() : ""
  const attack = typeof item.attack === "number" ? item.attack : Number.NaN
  const defense = typeof item.defense === "number" ? item.defense : Number.NaN
  if (!id || id.length > 100 || !name || name.lengt¶»§q«^