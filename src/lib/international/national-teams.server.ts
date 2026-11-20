import "server-only"

import { getEspnJsonBatch } from "@/lib/espn/transport.server"
import { mapNationalTeamDirectory } from "./national-teams"
import type { Team } from "@/data/football"

const ESPN_SOCCER = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const DIRECTORY_TTL_MS = 6 * 60 * 60 * 1000

// Prefer each country's current regional competition for recent-form lookups.
// FIFA Friendlies remains the complete fallback directory for countries that
// are not present in an active regional qualifier or Nations League.
const DIRECTORY_FEEDS = [
  "uefa.nations",
  "fifa.worldq.caf",
  "fifa.worldq.afc",
  "fifa.worldq.concacaf",
  "fifa.worldq.conmebol",
  "fifa.worldq.ofc",
  "fifa.friendly",
] as const

type TeamRow = Record<string, unknown>

let cachedTeams: Team[] = []
let cachedAt = 0
let inFlight: Promise<Team[]> | null = null

function rowsFrom(payload: Record<string, unknown> | null): TeamRow[] {
  const sports = Array.isArray(payload?.sports) ? payload.sports : []
  const rows: TeamRow[] = []
  for (const sportValue of sports) {
    const sport = sportValue && typeof sportValue === "object"
      ? sportValue as Record<string, unknown>
      : null
    const leagues = Array.isArray(sport?.leagues) ? sport.leagues : []
    for (const leagueValue of leagues) {
      const league = leagueValue && typeof leagueValue === "object"
        ? leagueValue as Record<string, unknown>
        : null
      if (Array.isArray(league?.teams)) {
        for (const teamValue of league.teams) {
          if (teamValue && typeof teamValue === "object") rows.push(teamValue as TeamRow)
        }
      }
    }
  }
  return rows
}

function teamId(row: TeamRow): string | null {
  const nested = row.team && typeof row.team === "object"
    ? row.team as Record<string, unknown>
    : row
  const value = nested.id
  const id = typeof value === "string" || typeof value === "number" ? String(value) : ""
  return /^\d{1,12}$/.test(id) ? id : null
}

export async function getNationalTeamDirectory(): Promise<Team[]> {
  if (cachedTeams.length && Date.now() - cachedAt < DIRECTORY_TTL_MS) return cachedTeams
  if (inFlight) return inFlight

  inFlight = (async () => {
    const results = await Promise.all(DIRECTORY_FEEDS.map(async (slug) => ({
      slug,
      rows: rowsFrom(await getEspnJsonBatch(ESPN_SOCCER + "/" + slug + "/teams?limit=500").catch(() => null)),
    })))

    const preferredFeedById = new Map<string, string>()
    for (const result of results) {
      for (const row of result.rows) {
        const id = teamId(row)
        if (id && !preferredFeedById.has(id)) preferredFeedById.set(id, result.slug)
      }
    }

    const friendly = results.find((item) => item.slug === "fifa.friendly")?.rows ?? []
    const allRows = friendly.length
      ? friendly
      : results.flatMap((item) => item.rows)
    const teams = mapNationalTeamDirectory(allRows, preferredFeedById)

    if (teams.length) {
      cachedTeams = teams
      cachedAt = Date.now()
      return teams
    }
    // Keep the last good directory through a temporary ESPN catalogue outage.
    return cachedTeams
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}
