import assert from "node:assert/strict"
import test from "node:test"
import { splitInternationalSimulationData } from "./simulation-availability.ts"
import type { InternationalFixture } from "./fixtures.server.ts"

function fixture(overrides: Partial<InternationalFixture> & Pick<InternationalFixture, "id" | "kickoff" | "statusState" | "completed">): InternationalFixture {
  const { id, kickoff, statusState, completed, ...rest } = overrides
  return {
    competition: "International Friendly",
    region: "World",
    home: { espnId: "1", name: "Nigeria", abbreviation: "NGA", logo: null, color: "008751" },
    away: { espnId: "2", name: "Ghana", abbreviation: "GHA", logo: null, color: "FCD116" },
    competitionSlug: "fifa.friendly",
    status: "Scheduled",
    score: { home: null, away: null },
    ...rest,
    id,
    kickoff,
    statusState,
    completed,
  }
}

test("international simulator keeps countries from completed and live fixtures selectable", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z")
  const { upcomingFixtures, sides } = splitInternationalSimulationData([
    fixture({ id: "past", kickoff: "2026-11-20T09:00:00.000Z", statusState: "post", completed: true }),
    fixture({
      id: "live",
      kickoff: "2026-11-20T11:00:00.000Z",
      statusState: "in",
      completed: false,
      home: { espnId: "3", name: "Senegal", abbreviation: "SEN", logo: null, color: "C8102E" },
      away: { espnId: "4", name: "Cameroon", abbreviation: "CMR", logo: null, color: "007A5E" },
    }),
    fixture({ id: "future", kickoff: "2026-11-20T16:00:00.000Z", statusState: "pre", completed: false }),
  ], now)

  assert.deepEqual(upcomingFixtures.map((item) => item.id), ["future"])
  assert.deepEqual(sides.map((side) => side.name), ["Nigeria", "Ghana", "Senegal", "Cameroon"])
  assert.deepEqual(sides.map((side) => side.id), ["int-1", "int-2", "int-3", "int-4"])
})

test("international simulator does not expose non-upcoming matches as future fixtures", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z")
  const { upcomingFixtures } = splitInternationalSimulationData([
    fixture({ id: "completed", kickoff: "2026-11-20T09:00:00.000Z", statusState: "post", completed: true }),
    fixture({ id: "live", kickoff: "2026-11-20T11:00:00.000Z", statusState: "in", completed: false }),
  ], now)

  assert.equal(upcomingFixtures.length, 0)
})
