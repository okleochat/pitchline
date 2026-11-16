import { NextResponse, type NextRequest } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { simulatePro, type ProTeam } from "@/lib/pro-sim"
import { getProPlayerData } from "@/lib/providers/apifootball-players.server"
import type { LeagueId } from "@/data/football"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Dict = Record<string, unknown>

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
  if (!id || id.length > 100 || !name || name.length > 100) return null
  if (!Number.isFinite(attack) || attack < 0 || attack > 6) return null
  if (!Number.isFinite(defense) || defense < 0 || defense > 6) return null
  const league = leagueValue(item.league)
  if (!league) return null
  const rateLeague = leagueValue(item.rateLeague)
  return { id, name, attack, defense, league, ...(rateLeague ? { rateLeague } : {}) }
}

export async function POST(request: NextRequest) {
  try {
    await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    }
    if (code === "PRO_REQUIRED") {
      return NextResponse.json({ error: "pro_required" }, { status: 403 })
    }
    return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
  }

  let body: Dict | null = null
  try {
    body = record(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const home = teamInput(body?.home)
  const away = teamInput(body?.away)
  const edge = typeof body?.edge === "number" ? body.edge : Number.NaN
  const roll = typeof body?.roll === "number" ? body.roll : Number.NaN
  const fixtureInput = record(body?.fixture)
  const kickoffAt = typeof fixtureInput?.kickoffAt === "string" &&
    Number.isFinite(new Date(fixtureInput.kickoffAt).getTime())
    ? fixtureInput.kickoffAt
    : undefined
  if (!home || !away || home.id === away.id) {
    return NextResponse.json({ error: "invalid_teams" }, { status: 400 })
  }
  if (!Number.isFinite(edge) || edge < 0.7 || edge > 1.6) {
    return NextResponse.json({ error: "invalid_home_edge" }, { status: 400 })
  }
  if (!Number.isSafeInteger(roll) || roll < 0 || roll > 1_000_000) {
    return NextResponse.json({ error: "invalid_simulation_seed" }, { status: 400 })
  }

  try {
    const playerData = await getProPlayerData({
      kickoffAt,
      home: { id: home.id, name: home.name, league: home.league, rateLeague: home.rateLeague },
      away: { id: away.id, name: away.name, league: away.league, rateLeague: away.rateLeague },
    })
    const homeFactors = playerData.adjustmentsApplied ? playerData.home?.factors : undefined
    const awayFactors = playerData.adjustmentsApplied ? playerData.away?.factors : undefined
    const report = simulatePro(home, away, edge, roll, homeFactors, awayFactors)
    return NextResponse.json({ ...report, playerData }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch {
    return NextResponse.json({ error: "pro_simulation_failed" }, { status: 500 })
  }
}
