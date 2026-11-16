import assert from "node:assert/strict"
import test from "node:test"
import { aggregateMatchXg, buildPrematchRows } from "./statsbomb-backtest.mjs"

test("aggregates event-level StatsBomb shot xG by team", () => {
  const result = aggregateMatchXg([
    { type: { name: "Shot" }, team: { name: "A" }, shot: { statsbomb_xg: 0.2 } },
    { type: { name: "Shot" }, team: { name: "A" }, shot: { statsbomb_xg: 0.5 } },
    { type: { name: "Shot" }, team: { name: "B" }, shot: { statsbomb_xg: 0.1 } },
    { type: { name: "Pass" }, team: { name: "A" } },
  ])
  assert.equal(result.complete, true)
  assert.equal(result.totals.get("A").xgFor, 0.7)
  assert.equal(result.totals.get("A").shots, 2)
  assert.equal(result.totals.get("B").xgFor, 0.1)
})

test("uses only five previous completed matches and excludes same-day matches", () => {
  const matches = []
  for (let i = 1; i <= 5; i += 1) {
    matches.push({
      id: String(i), match_date: `2026-10-${String(i).padStart(2, "0")}`,
      kickoff: `2026-10-${String(i).padStart(2, "0")}T12:00:00.000Z`,
      homeTeam: "A", awayTeam: "B", homeGoals: 1, awayGoals: 0,
      homeXg: 1.2, awayXg: 0.5,
    })
  }
  matches.push({
    id: "target", match_date: "2026-10-06", kickoff: "2026-10-06T12:00:00.000Z",
    homeTeam: "A", awayTeam: "B", homeGoals: 2, awayGoals: 1, homeXg: 1.7, awayXg: 0.9,
  })
  matches.push({
    id: "same-day", match_date: "2026-10-06", kickoff: "2026-10-06T14:00:00.000Z",
    homeTeam: "A", awayTeam: "B", homeGoals: 0, awayGoals: 0, homeXg: 0.2, awayXg: 0.2,
  })

  const rows = buildPrematchRows(matches, 5)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.fixture_id), ["target", "same-day"])
  assert.equal(rows[0].home_attack, 1.2)
  assert.equal(rows[0].home_defense, 0.5)
  assert.equal(rows[0].away_attack, 0.5)
  assert.equal(rows[0].away_defense, 1.2)
  assert.ok(Date.parse(rows[0].features_as_of) < Date.parse(rows[0].date))
  assert.ok(Date.parse(rows[0].features_as_of) < Date.parse("2026-10-06T00:00:00.000Z"))
})

test("fails closed if fewer than the requested prior matches exist", () => {
  const row = {
    id: "one", match_date: "2026-10-01", kickoff: "2026-10-01T12:00:00.000Z",
    homeTeam: "A", awayTeam: "B", homeGoals: 0, awayGoals: 0, homeXg: 0.2, awayXg: 0.1,
  }
  assert.equal(buildPrematchRows([row], 5).length, 0)
})
