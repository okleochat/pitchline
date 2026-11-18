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
  if (!id || id.length > 100 || !name || name.length > 100) return null
  if (!Number.isFinite(attack) || attack < 0 || attack > 6) return null
  if (!Number.isFinite(defense) || defense < 0 || defense > 6) return null
  const league = leagueValue(item.league)
  if (!league) return null
  const rateLeague = leagueValue(item.rateLeague)
  const espnId = typeof item.espnId === "string" && /^\d{1,12}$/.test(item.espnId) ? item.espnId : undefined
  const feedSlug = typeof item.feedSlug === "string" && /^[a-z0-9.-]{1,50}$/.test(item.feedSlug) ? item.feedSlug : undefined
  return {
    id, name, attack, defense, league,
    ...(rateLeague ? { rateLeague } : {}),
    ...(espnId ? { espnId } : {}),
    ...(feedSlug ? { feedSlug } : {}),
  }
}

function fixtureInput(value: unknown): PickFixtureInput | null {
  const item = record(value)
  if (!item) return null
  const fixtureId = typeof item.fixtureId === "string" ? item.fixtureId.trim() : ""
  const home = teamInput(item.home)
  const away = teamInput(item.away)
  const edge = typeof item.edge === "number" ? item.edge : Number.NaN
  if (!fixtureId || fixtureId.length > 160 || !home || !away || home.id === away.id) return null
  if (!Number.isFinite(edge) || edge < 0.7 || edge > 1.6) return null
  return { fixtureId, home, away, edge }
}

type ProPickSimulationResult =
  | {
      fixtureId: string
      probabilities: ReturnType<typeof runProEngine>["probabilities"]
      retryable?: true
    }
  | { fixtureId: string; retryable: true }

async function simulatePick(fixture: PickFixtureInput): Promise<ProPickSimulationResult> {
  const playerData = await getProPlayerData({
    home: {
      id: fixture.home.id, name: fixture.home.name, league: fixture.home.league,
      rateLeague: fixture.home.rateLeague, espnId: fixture.home.espnId, feedSlug: fixture.home.feedSlug,
    },
    away: {
      id: fixture.away.id, name: fixture.away.name, league: fixture.away.league,
      rateLeague: fixture.away.rateLeague, espnId: fixture.away.espnId, feedSlug: fixture.away.feedSlug,
    },
  })

  // Match Desk and Best Picks always use the same Pro simulation path.
  // Squad-provider failures remain visible as Pro results and are retryable.
  const retryable = playerData.status === "provider_error" || playerData.status === "roster_unavailable"
  const report = runProEngine({
    home: fixture.home,
    away: fixture.away,
    edge: fixture.edge,
    roll: 0,
    playerData,
  })
  return {
    fixtureId: fixture.fixtureId,
    probabilities: report.probabilities,
    ...(retryable ? { retryable: true as const } : {}),
  }
}

async function simulateFixturesBounded(
  fixtures: PickFixtureInput[],
  concurrency = 6,
): Promise<ProPickSimulationResult[]> {
  const results = new Array<ProPickSimulationResult>(fixtures.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, fixtures.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= fixtures.length) return
      const fixture = fixtures[index]
      try {
        results[index] = await simulatePick(fixture)
      } catch (error) {
        console.warn("[Pitchline Pro Picks] Fixture calculation failed; keeping other results", {
          fixtureId: fixture.fixtureId,
          message: error instanceof Error ? error.message : "unknown error",
        })
        results[index] = { fixtureId: fixture.fixtureId, retryable: true }
      }
    }
  })
  await Promise.all(workers)
  return results
}

export async function POST(request: NextRequest) {
  try {
    await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    if (code === "PRO_REQUIRED") return NextResponse.json({ error: "pro_required" }, { status: 403 })
    return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
  }

  let body: Dict | null = null
  try {
    body = record(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const rawFixtures = body?.fixtures
  if (!Array.isArray(rawFixtures) || rawFixtures.length < 1 || rawFixtures.length > 12) {
    return NextResponse.json({ error: "invalid_fixture_batch" }, { status: 400 })
  }

  const fixtures = rawFixtures.map(fixtureInput)
  if (fixtures.some((fixture) => fixture === null)) {
    return NextResponse.json({ error: "invalid_fixture" }, { status: 400 })
  }

  const simulations = await simulateFixturesBounded(fixtures as PickFixtureInput[])
  const results = simulations.flatMap((item) =>
    "probabilities" in item ? [item] : [],
  )
  const excludedCount = simulations.filter((item) => "excluded" in item).length
  const retryableFixtureIds = simulations.flatMap((item) =>
    "retryable" in item ? [item.fixtureId] : [],
  )
  return NextResponse.json(
    { results, excludedCount, retryableFixtureIds },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
