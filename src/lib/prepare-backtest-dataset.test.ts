import assert from "node:assert/strict"
import test from "node:test"
import { parseCsv } from "./backtest.ts"
import { prepareBacktestRows, requiredRawColumns } from "./prepare-backtest-dataset.ts"

function rawCsv(overlap = false) {
  const headers = [
    ...requiredRawColumns(),
    "home_xg", "away_xg", "xg_source",
  ]
  const rows: string[][] = []
  for (let index = 0; index < 5; index += 1) {
    const day = index + 1
    const kickoff = new Date(Date.UTC(2026, 0, day, 18)).toISOString()
    const completed = new Date(Date.UTC(2026, 0, day, 20)).toISOString()
    rows.push([
      `fixture-${index + 1}`, kickoff, completed, "home-id", "Home FC", "away-id", "Away FC",
      String(index % 3), String((index + 1) % 2), "1.4", "0.9", "Sportmonks xG",
    ])
  }
  if (overlap) {
    rows.push([
      "overlap", new Date(Date.UTC(2026, 0, 5, 19)).toISOString(),
      new Date(Date.UTC(2026, 0, 5, 23)).toISOString(),
      "home-id", "Home FC", "away-id", "Away FC", "1", "0", "1.1", "0.8", "Sportmonks xG",
    ])
  }
  rows.push([
    "target", new Date(Date.UTC(2026, 0, 5, 21)).toISOString(),
    new Date(Date.UTC(2026, 0, 5, 23)).toISOString(),
    "home-id", "Home FC", "away-id", "Away FC", "2", "1", "1.8", "1.2", "Sportmonks xG",
  ])
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
}

test("rolling prematch builder uses only earlier completed matches", () => {
  const raw = parseCsv(rawCsv(true), requiredRawColumns())
  const prepared = prepareBacktestRows(raw, 5)
  const target = prepared.find((row) => row.fixture_id === "target")
  assert.ok(target)
  assert.ok(Date.parse(target.features_as_of) < Date.parse(target.date))
  assert.ok(Number(target.home_attack) >= 0)
  assert.ok(Number(target.away_defense) >= 0)
  assert.equal(target.home_xg_for !== undefined, true)
  assert.equal(target.xg_source, "Sportmonks xG")
  assert.equal(prepared.some((row) => row.fixture_id === "overlap"), false)
})

test("rolling builder skips warm-up fixtures without a full history window", () => {
  const raw = parseCsv(rawCsv(), requiredRawColumns())
  const prepared = prepareBacktestRows(raw, 5)
  assert.deepEqual(prepared.map((row) => row.fixture_id), ["target"])
})

test("rolling builder validates completed-at timestamps and team identities", () => {
  const rows = parseCsv(rawCsv(), requiredRawColumns())
  rows[0].completed_at = rows[0].kickoff
  assert.throws(() => prepareBacktestRows(rows, 5), /after kickoff/)
  const duplicate = parseCsv(rawCsv(), requiredRawColumns())
  duplicate[1].away_team_id = duplicate[1].home_team_id
  assert.throws(() => prepareBacktestRows(duplicate, 5), /distinct home_team_id/)
})

test("raw builder omits xG columns if any prepared fixture lacks a full single-source xG window", () => {
  const rows = parseCsv(rawCsv(), requiredRawColumns())
  rows[0].home_xg = ""
  rows[0].away_xg = ""
  rows[0].xg_source = ""
  const prepared = prepareBacktestRows(rows, 5)
  assert.ok(prepared.every((row) => !row.home_xg_for && !row.xg_source))
})
