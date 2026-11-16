import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { analyticalMarkets } from "../src/lib/sim.ts"

const REQUIRED = [
  "fixture_id", "date", "features_as_of", "home_team", "away_team",
  "home_attack", "home_defense", "away_attack", "away_defense",
  "home_goals", "away_goals",
]

export function parseCsv(input) {
  const records = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field.length === 0) quoted = true
    else if (char === ",") { row.push(field); field = "" }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1
      row.push(field); field = ""
      if (row.some((value) => value.trim())) records.push(row)
      row = []
    } else field += char
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field.")
  if (field.length || row.length) {
    row.push(field)
    if (row.some((value) => value.trim())) records.push(row)
  }
  if (records.length < 2) throw new Error("CSV needs a header and at least one fixture.")
  const headers = records[0].map((value) => value.trim())
  const missing = REQUIRED.filter((key) => !headers.includes(key))
  if (missing.length) throw new Error("Missing CSV columns: " + missing.join(", "))
  return records.slice(1).map((values, index) => ({
    ...Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])),
    _row: String(index + 2),
  }))
}

function numeric(row, key) {
  if (row[key] == null || String(row[key]).trim() === "") {
    throw new Error("Row " + row._row + ": " + key + " is required.")
  }
  const value = Number(row[key])
  if (!Number.isFinite(value) || value < 0) throw new Error("Row " + row._row + ": " + key + " must be a non-negative number.")
  return value
}

function binaryMetrics(items) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }))
  let brier = 0
  let logLoss = 0
  for (const item of items) {
    const p = Math.max(1e-12, Math.min(1 - 1e-12, item.p))
    const y = item.y ? 1 : 0
    brier += (p - y) ** 2
    logLoss -= y ? Math.log(p) : Math.log(1 - p)
    const bin = bins[Math.min(9, Math.floor(p * 10))]
    bin.n += 1; bin.p += p; bin.y += y
  }
  return {
    count: items.length,
    brierScore: brier / items.length,
    logLoss: logLoss / items.length,
    reliability: bins.filter((bin) => bin.n).map((bin) => ({
      count: bin.n, meanPredicted: bin.p / bin.n, observedRate: bin.y / bin.n,
    })),
  }
}

function oneXTwoMetrics(rows) {
  let brier = 0
  let logLoss = 0
  let correct = 0
  const calibration = { home: [], draw: [], away: [] }
  for (const row of rows) {
    const actual = row.actual
    const pActual = Math.max(1e-12, row.p[actual])
    logLoss -= Math.log(pActual)
    for (const outcome of ["home", "draw", "away"]) {
      const p = row.p[outcome]
      const y = actual === outcome
      brier += (p - (y ? 1 : 0)) ** 2
      calibration[outcome].push({ p, y })
    }
    if (Object.keys(row.p).sort((a, b) => row.p[b] - row.p[a])[0] === actual) correct += 1
  }
  return {
    count: rows.length,
    brierScore: brier / rows.length,
    logLoss: logLoss / rows.length,
    accuracy: correct / rows.length,
    reliabilityByOutcome: Object.fromEntries(Object.entries(calibration).map(([key, values]) => [
      key, binaryMetrics(values).reliability,
    ])),
  }
}

export function backtestRows(rows) {
  if (!rows.length) throw new Error("No fixtures supplied.")
  const ids = new Set()
  const scored = rows.map((row, index) => {
    const rowNumber = row._row ?? String(index + 2)
    if (!row.fixture_id || ids.has(row.fixture_id)) throw new Error("Row " + rowNumber + ": fixture_id must be unique.")
    ids.add(row.fixture_id)
    const kickoff = Date.parse(row.date)
    const featureCutoff = Date.parse(row.features_as_of)
    if (!Number.isFinite(kickoff)) throw new Error("Row " + rowNumber + ": date is invalid.")
    if (!Number.isFinite(featureCutoff) || featureCutoff >= kickoff) {
      throw new Error("Row " + rowNumber + ": features_as_of must be a valid timestamp before kickoff.")
    }
    const hg = numeric(row, "home_goals")
    const ag = numeric(row, "away_goals")
    if (!Number.isInteger(hg) || !Number.isInteger(ag)) throw new Error("Row " + rowNumber + ": goals must be whole numbers.")
    const home = { id: row.home_team, attack: numeric(row, "home_attack"), defense: numeric(row, "home_defense"), scorers: ["A", "B", "C"] }
    const away = { id: row.away_team, attack: numeric(row, "away_attack"), defense: numeric(row, "away_defense"), scorers: ["A", "B", "C"] }
    const edge = row.home_edge?.trim() ? numeric(row, "home_edge") : 1
    if (edge < 0.7 || edge > 1.6) throw new Error("Row " + rowNumber + ": home_edge must be between 0.7 and 1.6.")
    if (row.model && row.model !== "plain" && row.model !== "dixon") {
      throw new Error("Row " + rowNumber + ": model must be plain or dixon.")
    }
    const model = row.model === "dixon" ? "dixon" : "plain"
    const probabilities = analyticalMarkets(home, away, edge, model)
    return {
      fixtureId: row.fixture_id, date: row.date,
      actual: hg > ag ? "home" : hg === ag ? "draw" : "away",
      p: { home: probabilities.home, draw: probabilities.draw, away: probabilities.away },
      bttsP: probabilities.btts, over25P: probabilities.over25,
      bttsY: hg > 0 && ag > 0, over25Y: hg + ag >= 3,
    }
  })
  return {
    createdAt: new Date().toISOString(),
    matches: scored.length,
    methodology: "Requires pre-match point-in-time team rates. Uses exact normalized goal-grid probabilities; no odds/ROI.",
    oneX2: oneXTwoMetrics(scored),
    btts: binaryMetrics(scored.map((row) => ({ p: row.bttsP, y: row.bttsY }))),
    over25: binaryMetrics(scored.map((row) => ({ p: row.over25P, y: row.over25Y }))),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const input = args[args.indexOf("--input") + 1]
  const outputIndex = args.indexOf("--output")
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null
  if (!input || input.startsWith("--")) throw new Error("Usage: npm run backtest -- --input prematch-rates.csv [--output report.json]")
  const report = JSON.stringify(backtestRows(parseCsv(await readFile(input, "utf8"))), null, 2) + "\n"
  if (output) {
    await writeFile(output, report, "utf8")
    process.stdout.write("Backtest report written to " + path.resolve(output) + "\n")
  } else process.stdout.write(report)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(String(error?.message ?? error) + "\n"); process.exitCode = 1 })
}
