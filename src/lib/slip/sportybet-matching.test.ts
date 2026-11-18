import assert from "node:assert/strict"
import test from "node:test"
import { matchSportyBetFixture, normalizeTeamName, resolveSportyBetSelection } from "./sportybet-matching.ts"
import { normalizeSlipLegs, type SlipLeg } from "./types.ts"

const now = Date.parse("2026-11-18T12:00:00.000Z")
const fixture = {
  eventId: "sr:match:72221406",
  homeTeamName: "Man City",
  awayTeamName: "Fulham",
  estimateStartTime: Date.parse("2026-11-20T20:30:00.000Z"),
  matchStatus: "Not start",
  markets: [
    {
      id: "1",
      desc: "1X2",
      outcomes: [
        { id: "1", desc: "Home", odds: "1.43", isActive: 1 },
        { id: "2", desc: "Draw", odds: "5.35", isActive: 1 },
        { id: "3", desc: "Away", odds: "7.03", isActive: 1 },
      ],
    },
    {
      id: "18",
      desc: "Over/Under",
      specifier: "total=2.5",
      outcomes: [
        { id: "12", desc: "Over 2.5", odds: "1.49", isActive: 1 },
        { id: "13", desc: "Under 2.5", odds: "2.65", isActive: 1 },
      ],
    },
    {
      id: "29",
      desc: "GG/NG",
      outcomes: [
        { id: "74", desc: "Yes", odds: "1.73", isActive: 1 },
        { id: "76", desc: "No", odds: "2.10", isActive: 1 },
      ],
    },
  ],
}

const baseLeg: SlipLeg = {
  key: "pitchline-fixture-1:Manchester City to win",
  fixtureId: "pitchline-fixture-1",
  league: "eng",
  competitionName: "Premier League",
  kickoffAt: "2026-11-20T20:30:00.000Z",
  when: "Fri 20 Nov · 20:30",
  homeTeam: "Manchester City",
  awayTeam: "Fulham",
  label: "Manchester City to win",
  kind: "result",
  probability: 0.68,
}

test("normalizes common bookmaker team aliases", () => {
  assert.equal(normalizeTeamName("Man City"), "manchester city")
  assert.equal(normalizeTeamName("Manchester City"), "manchester city")
  assert.equal(normalizeTeamName("Brighton & Hove Albion"), "brighton and hove albion")
})

test("matches a fixture only when teams, kickoff and pre-match status agree", () => {
  assert.equal(matchSportyBetFixture(baseLeg, [fixture], now)?.eventId, fixture.eventId)
  assert.equal(matchSportyBetFixture({ ...baseLeg, awayTeam: "Arsenal" }, [fixture], now), null)
  assert.equal(matchSportyBetFixture({ ...baseLeg, kickoffAt: "2026-11-21T23:00:00.000Z" }, [fixture], now), null)
  assert.equal(matchSportyBetFixture(baseLeg, [{ ...fixture, matchStatus: "In Progress" }], now), null)
})

test("resolves 1X2, totals specifiers and both-teams-to-score outcomes", () => {
  const home = resolveSportyBetSelection(baseLeg, fixture)
  assert.equal(home?.marketId, "1")
  assert.equal(home?.outcomeId, "1")
  assert.equal(home?.odds, 1.43)

  const under = resolveSportyBetSelection({
    ...baseLeg, label: "Under 2.5 goals", kind: "goals",
  }, fixture)
  assert.equal(under?.marketId, "18")
  assert.equal(under?.specifier, "total=2.5")
  assert.equal(under?.outcomeId, "13")

  const yes = resolveSportyBetSelection({
    ...baseLeg, label: "Both teams to score", kind: "btts",
  }, fixture)
  assert.equal(yes?.marketId, "29")
  assert.equal(yes?.outcomeId, "74")
})

test("refuses an inactive or missing market outcome", () => {
  const inactive = {
    ...fixture,
    markets: fixture.markets.map((market) => market.id === "1"
      ? { ...market, outcomes: market.outcomes?.map((outcome) => ({ ...outcome, isActive: 0 })) }
      : market),
  }
  assert.equal(resolveSportyBetSelection(baseLeg, inactive), null)
})

test("validates a slip and rejects multiple selections from the same fixture", () => {
  const first = normalizeSlipLegs([baseLeg])
  assert.equal(first?.length, 1)
  assert.equal(normalizeSlipLegs(Array.from({ length: 50 }, (_, index) => ({
    ...baseLeg,
    fixtureId: "fixture-" + index,
    key: "fixture-" + index + ":" + baseLeg.label,
  })))?.length, 50)
  assert.equal(normalizeSlipLegs(Array.from({ length: 51 }, (_, index) => ({
    ...baseLeg,
    fixtureId: "fixture-" + index,
    key: "fixture-" + index + ":" + baseLeg.label,
  }))), null)
  assert.equal(normalizeSlipLegs([
    baseLeg,
    { ...baseLeg, label: "Draw", key: baseLeg.fixtureId + ":Draw" },
  ]), null)
})
