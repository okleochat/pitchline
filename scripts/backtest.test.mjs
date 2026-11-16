import assert from "node:assert/strict"
import test from "node:test"
import { backtestRows, parseCsv } from "../src/lib/backtest.ts"

test("CSV parser handles quoted fields and reports model calibration", () => {
  const csv = [
    "fixture_id,date,features_as_of,home_team,away_team,home_attack,home_defense,away_attack,away_defense,home_goals,away_goals,model",
    'f1,2026-01-01T20:00:00Z,2026-01-01T18:00:00Z,"Home, FC",Away,1.7,0.9,1.1,1.3,2,0,plain',
    "f2,2026-01-02T20:00:00Z,2026-01-02T18:00:00Z,Home2,Away2,1.2,1.2,1.5,1.1,1,1,dixon",
  ].join("\n")
  const rows = parseCsv(csv)
  assert.equal(rows[0].home_team, "Home, FC")
  const report = backtestRows(rows)
  assert.equal(report.matches, 2)
  assert.equal(report.oneX2.count, 2)
  assert.ok(Number.isFinite(report.oneX2.brierScore))
  assert.ok(Number.isFinite(report.oneX2.logLoss))
  assert.equal(report.btts.count, 2)
  assert.equal(report.over25.count, 2)
})

test("backtest rejects duplicate fixtures and invalid rates", () => {
  const row = {
    fixture_id: "same", date: "2026-01-01T20:00:00Z", features_as_of: "2026-01-01T18:00:00Z", home_team: "A", away_team: "B",
    home_attack: "bad", home_defense: "1", away_attack: "1", away_defense: "1",
    home_goals: "1", away_goals: "0",
  }
  assert.throws(() => backtestRows([row]), /non-negative number/)
})
