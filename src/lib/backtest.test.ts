import assert from "node:assert/strict"
import test from "node:test"
import { backtestRows, parseCsv } from "./backtest.ts"

const headers = [
  "fixture_id", "date", "features_as_of", "home_team", "away_team",
  "home_attack", "home_defense", "away_attack", "away_defense",
  "home_goals", "away_goals", "home_edge", "model",
]

function csvFor(matches = 40, addXg = false) {
  const columns = [...headers, ...(addXg ? [
    "home_xg_for", "home_xg_against", "away_xg_for", "away_xg_against", "xg_source",
  ] : [])]
  const rows = Array.from({ length: matches }, (_, index) => {
    const kickoff = new Date(Date.UTC(2026, 0, index + 1, 18)).toISOString()
    const availableAt = new Date(Date.parse(kickoff) - 3 * 60 * 60 * 1000).toISOString()
    const values = [
      `fixture-${index + 1}`, kickoff, availableAt, `Home ${index % 6}`, `Away ${index % 7}`,
      "1.45", "1.15", "1.25", "1.3",
      String(index % 4 === 0 ? 2 : index % 3 === 0 ? 0 : 1),
      String(index % 5 === 0 ? 2 : index % 2),
      "1", index % 2 ? "dixon" : "plain",
    ]
    if (addXg) values.push("1.62", "1.04", "1.21", "1.37", "Sportmonks xG fixture feed")
    return values.map((value) => {
      const escaped = String(value)
      return /[",\r\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped
    }).join(",")
  })
  return [columns.join(","), ...rows].join("\n")
}

test("CSV parser handles escaped commas and quoted fields", () => {
  const parsed = parseCsv(csvFor(1).replace("Home 0", "Home, Athletic"))
  assert.equal(parsed[0].home_team, "Home, Athletic")
})

test("backtest reports overall and chronological holdout metrics", () => {
  const report = backtestRows(parseCsv(csvFor()))
  assert.equal(report.matches, 40)
  assert.equal(report.chronologicalSplit?.earlier.matches, 28)
  assert.equal(report.chronologicalSplit?.later.matches, 12)
  assert.ok(report.oneX2.brierScore >= 0)
  assert.ok(report.oneX2.logLoss >= 0)
  assert.ok(report.btts.brierScore >= 0)
  assert.equal(report.inputs.featureBasis, "goals")
})

test("backtest rejects feature timestamps at or after kickoff", () => {
  const parsed = parseCsv(csvFor(1))
  parsed[0].features_as_of = parsed[0].date
  assert.throws(() => backtestRows(parsed), /before kickoff/)
})

test("backtest rejects duplicate fixtures", () => {
  const parsed = parseCsv(csvFor(2))
  parsed[1].fixture_id = parsed[0].fixture_id
  assert.throws(() => backtestRows(parsed), /must be unique/)
})

test("xG inputs require all source-attributed features", () => {
  const parsed = parseCsv(csvFor(1, true))
  parsed[0].home_xg_against = ""
  assert.throws(() => backtestRows(parsed), /require all four xG columns and xg_source/)
})

test("xG backtest uses source-attributed values when supplied", () => {
  const report = backtestRows(parseCsv(csvFor(2, true)))
  assert.equal(report.inputs.featureBasis, "xg")
  assert.equal(report.inputs.xgSource, "Sportmonks xG fixture feed")
})
