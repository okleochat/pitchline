import { analyticalMarkets, type ModelKind } from "./sim.ts"

const REQUIRED = [
  "fixture_id", "date", "features_as_of", "home_team", "away_team",
  "home_attack", "home_defense", "away_attack", "away_defense",
  "home_goals", "away_goals",
] as const

const XG_COLUMNS = ["home_xg_for", "home_xg_against", "away_xg_for", "away_xg_against"] as const

export type BacktestInputRow = Record<string, string> & { _row?: string }
export type Outcome = "home" | "draw" | "away"
export type ScoredRow = {
  fixtureId: string
  date: string
  actual: Outcome
  p: Record<Outcome, number>
  bttsP: number
  over25P: number
  bttsY: boolean
  over25Y: boolean
}

export type BinaryMetrics = {
  count: number
  brierScore: number
  logLoss: number
  reliability: { count: number; meanPredicted: number; observedRate: number }[]
}
export type OneXTwoMetrics = {
  count: number
  brierScore: number
  logLoss: number
  accuracy: number
  reliabilityByOutcome: Record<Outcome, BinaryMetrics["reliability"]>
}
export type MetricBundle = {
  matches: number
  oneX2: OneXTwoMetrics
  btts: BinaryMetrics
  over25: BinaryMetrics
}
export type BacktestReport = MetricBundle & {
  createdAt: string
  methodology: string
  period: { from: string; to: string }
  chronologicalSplit: null | {
    earlier: MetricBundle
    later: MetricBundle
    splitDate: string
    earlierShare: number
    laterShare: number
  }
  inputs: { featureBasis: "goals" | "xg"; xgSource: string | null }
}

export function parseCsv(input: string): BacktestInputRow[] {
  const records: string[][] = []
  let row: string[] = []
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
  if (headers.some((header) => !header)) throw new Error("CSV header contains an empty column name.")
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.")
  const missing = REQUIRED.filter((key) => !headers.includes(key))
  if (missing.length) throw new Error("Missing CSV columns: " + missing.join(", "))

  return records.slice(1).map((values, index) => ({
    ...Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])),
    _row: String(index + 2),
  }))
}

function numeric(row: BacktestInputRow, key: string): number {
  if (row[key] == null || String(row[key]).trim() === "") {
    throw new Error("Row " + row._row + ": " + key + " is required.")
  }
  const value = Number(row[key])
  if (!Number.isFinite(value) || value < 0) throw new Error("Row " + row._row + ": " + key + " must be a non-negative number.")
  return value
}

function binaryMetrics(items: { p: number; y: boolean }[]): BinaryMetrics {
  if (!items.length) throw new Error("Cannot calculate metrics for an empty period.")
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }))
  let brier = 0
  let logLoss = 0
  for (const item of items) {
    const p = Math.max(1e-12, Math.min(1 - 1e-12, item.p))
    const y = item.y ? 1 : 0
    brier += (p - y) ** 2
    logLoss -= y ? Math.log(p) : Math.log(1 - p)
    const bin = bins[Math.min(9, Math.floor(p * 10))]
    bin.n += 1
    bin.p += p
    bin.y += y
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

function oneXTwoMetrics(rows: ScoredRow[]): OneXTwoMetrics {
  if (!rows.length) throw new Error("Cannot calculate metrics for an empty period.")
  let brier = 0
  let logLoss = 0
  let correct = 0
  const calibration: Record<Outcome, { p: number; y: boolean }[]> = { home: [], draw: [], away: [] }
  for (const row of rows) {
    const actual = row.actual
    const pActual = Math.max(1e-12, row.p[actual])
    logLoss -= Math.log(pActual)
    for (const outcome of ["home", "draw", "away"] as const) {
      const p = row.p[outcome]
      const y = actual === outcome
      brier += (p - (y ? 1 : 0)) ** 2
      calibration[outcome].push({ p, y })
    }
    if (Object.keys(row.p).sort((a, b) => row.p[b as Outcome] - row.p[a as Outcome])[0] === actual) correct += 1
  }
  return {
    count: rows.length,
    brierScore: brier / rows.length,
    logLoss: logLoss / rows.length,
    accuracy: correct / rows.length,
    reliabilityByOutcome: {
      home: binaryMetrics(calibration.home).reliability,
      draw: binaryMetrics(calibration.draw).reliability,
      away: binaryMetrics(calibration.away).reliability,
    },
  }
}

function metrics(rows: ScoredRow[]): MetricBundle {
  return {
    matches: rows.length,
    oneX2: oneXTwoMetrics(rows),
    btts: binaryMetrics(rows.map((row) => ({ p: row.bttsP, y: row.bttsY }))),
    over25: binaryMetrics(rows.map((row) => ({ p: row.over25P, y: row.over25Y }))),
  }
}

export function backtestRows(rows: BacktestInputRow[]): BacktestReport {
  if (!rows.length) throw new Error("No fixtures supplied.")
  const ids = new Set<string>()
  let xgSource: string | null = null
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

    const hasAnyXg = XG_COLUMNS.some((key) => String(row[key] ?? "").trim() !== "") || Boolean(row.xg_source?.trim())
    let xg: { home_xg_for: number; home_xg_against: number; away_xg_for: number; away_xg_against: number; source: string } | null = null
    if (hasAnyXg) {
      const missing = [...XG_COLUMNS, "xg_source"].filter((key) => !String(row[key] ?? "").trim())
      if (missing.length) throw new Error("Row " + rowNumber + ": xG features require all four xG columns and xg_source.")
      xg = {
        home_xg_for: numeric(row, "home_xg_for"),
        home_xg_against: numeric(row, "home_xg_against"),
        away_xg_for: numeric(row, "away_xg_for"),
        away_xg_against: numeric(row, "away_xg_against"),
        source: row.xg_source.trim(),
      }
      if (xgSource && xgSource !== xg.source) xgSource = "Multiple source-attributed xG providers"
      else if (!xgSource) xgSource = xg.source
    }

    const home = {
      id: row.home_team,
      attack: numeric(row, "home_attack"),
      defense: numeric(row, "home_defense"),
      scorers: ["A", "B", "C"] as [string, string, string],
      ...(xg ? { xgFor: xg.home_xg_for, xgAgainst: xg.home_xg_against, xgSource: xg.source } : {}),
    }
    const away = {
      id: row.away_team,
      attack: numeric(row, "away_attack"),
      defense: numeric(row, "away_defense"),
      scorers: ["A", "B", "C"] as [string, string, string],
      ...(xg ? { xgFor: xg.away_xg_for, xgAgainst: xg.away_xg_against, xgSource: xg.source } : {}),
    }
    const edge = row.home_edge?.trim() ? numeric(row, "home_edge") : 1
    if (edge < 0.7 || edge > 1.6) throw new Error("Row " + rowNumber + ": home_edge must be between 0.7 and 1.6.")
    if (row.model && row.model !== "plain" && row.model !== "dixon") {
      throw new Error("Row " + rowNumber + ": model must be plain or dixon.")
    }
    const model = (row.model === "dixon" ? "dixon" : "plain") as ModelKind
    const probabilities = analyticalMarkets(home, away, edge, model)
    return {
      fixtureId: row.fixture_id,
      date: row.date,
      actual: hg > ag ? "home" as const : hg === ag ? "draw" as const : "away" as const,
      p: { home: probabilities.home, draw: probabilities.draw, away: probabilities.away },
      bttsP: probabilities.btts,
      over25P: probabilities.over25,
      bttsY: hg > 0 && ag > 0,
      over25Y: hg + ag >= 3,
    }
  })

  const chronological = [...scored].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const splitIndex = Math.floor(chronological.length * 0.7)
  const earlier = chronological.slice(0, splitIndex)
  const later = chronological.slice(splitIndex)
  const chronologicalSplit = earlier.length >= 10 && later.length >= 10
    ? {
        earlier: metrics(earlier),
        later: metrics(later),
        splitDate: later[0].date,
        earlierShare: earlier.length / chronological.length,
        laterShare: later.length / chronological.length,
      }
    : null
  const all = metrics(chronological)
  return {
    createdAt: new Date().toISOString(),
    ...all,
    period: { from: chronological[0].date, to: chronological[chronological.length - 1].date },
    chronologicalSplit,
    methodology: "Exact normalized Poisson/Dixon–Coles goal-grid probabilities evaluated against point-in-time features timestamped before kickoff. The chronological split is a later-period holdout; it is not a trained model or betting ROI estimate.",
    inputs: { featureBasis: xgSource ? "xg" : "goals", xgSource },
  }
}
