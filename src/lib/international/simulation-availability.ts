import type { InternationalFixture } from "@/lib/international/fixtures.server"

export type InternationalSimulationSide = {
  id: string
  name: string
  short: string
  espnId: string
  feedSlug: string
  color: string | null
  competitionName: string
  competitionRegion: string
}

/**
 * Keep every country from the selected international fixture date available
 * to the manual simulator, while exposing only future, not-yet-started games
 * as upcoming fixtures.
 */
export function splitInternationalSimulationData(
  fixtures: readonly InternationalFixture[],
  nowMs: number,
): { upcomingFixtures: InternationalFixture[]; sides: InternationalSimulationSide[] } {
  const upcomingFixtures = fixtures.filter((fixture) => {
    const kickoff = new Date(fixture.kickoff).getTime()
    return !fixture.completed && fixture.statusState === "pre" && kickoff > nowMs
  })

  const sides = new Map<string, InternationalSimulationSide>()
  for (const fixture of fixtures) {
    for (const side of [fixture.home, fixture.away]) {
      const key = fixture.competitionSlug + ":" + side.espnId
      if (sides.has(key)) continue
      sides.set(key, {
        id: "int-" + side.espnId,
        name: side.name,
        short: (side.abbreviation || side.name.slice(0, 3)).slice(0, 4).toUpperCase(),
        espnId: side.espnId,
        feedSlug: fixture.competitionSlug,
        color: side.color,
        competitionName: fixture.competition,
        competitionRegion: fixture.region,
      })
    }
  }

  return { upcomingFixtures, sides: [...sides.values()] }
}
