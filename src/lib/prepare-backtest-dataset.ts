import type { BacktestInputRow } from "./backtest.ts"

const RAW_REQUIRED = [
  "fixture_id", "kickoff", "completed_at", "home_team_id", "home_team",
  "away_team_id", "away_team", "home_goals", "away_goals",
] as const

type RawAppearance = {
  completedAt: number
  gf: number
  ga: number
  xgf: number | null
  xga: number | null
  xgSource: string | null
}

type RawFixture = {
  fixtureId: string
  kickoff: string
  kickoffAt: number
  completedAt: number
  homeId: string
  homeName: string
  awayId: string
  awayName: string
  homeGoals: number
  awayGoals: number
  homeXg: number | null
  awayXg: number | null
  xgSource: string | null
}

export function requiredRawColumns(): readonly string[] {
  return RAW_REQUIRED
}

function positiveInteger(value: string, row: string, key: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("Row " + row + ": " + key + " must be a non-negative whole number.")
  }
  return number
}

function optionalNonNegative(value: string | undefined, row: string, key: string): number | null {
  if (value == null || value.trim() === "") return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Row " + row + ": " + key + " must be a non-negative number when supplied.")
  }
  return number
}

function weighted(values: number[], windowSize: number): number {
  let weightTotal = 0
  let valueTotal = 0
  const halfLife = Math.max(1, windowSize / 2)
  values.forEach((value, index) => {
    const weight = Math.exp((-Math.LN2 * index) / halfLife)
    weightTotal += weight
    valueTotal += value * weight
  })
  return Math.round((valueTotal / (weightTotal || 1)) * 1000) / 1000
}

function latestWindow(rows: RawAppearance[], kickoffAt: number, windowSize: number): RawAppearance[] {
  return rows
    .filter((row) => row.completedAt < kickoffAt)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, windowSize)
}

export function prepareBacktestRows(rawRows: BacktestInputRow[], windowSize = 5): BacktestInputRow[] {
  if (!Number.isInteger(windowSize) || windowSize < 3 || windowSize > 10) {
    throw new Error("Rolling window must be an integer between 3 and 10.")
  }
  if (!rawRows.length) throw new Error("No raw fixtures supplied.")

  const fixtureIds = new Set<string>()
  const fixtures: RawFixture[] = rawRows.map((row, index) => {
    const rowNumber = row._row ?? String(index + 2)
    if (!row.fixture_id || fixtureIds.has(row.fixture_id)) {
      throw new Error("Row " + rowNumber + ": fixture_id must be unique.")
    }
    fixtureIds.add(row.fixture_id)
    const kickoffAt = Date.parse(row.kickoff)
    const completedAt = Date.parse(row.completed_at)
    if (!Number.isFinite(kickoffAt)) throw new Error("Row " + rowNumber + ": kickoff is invalid.")
    if (!Number.isFinite(completedAt) || completedAt <= kickoffAt) {
      throw new Error("Row " + rowNumber + ": completed_at must be a valid timestamp after kickoff.")
    }
    if (!row.home_team_id || !row.away_team_id || row.home_team_id === row.away_team_id) {
      throw new Error("Row " + rowNumber + ": distinct home_team_id and away_team_id are required.")
    }
    const homeXg = optionalNonNegative(row.home_xg, rowNumber, "home_xg")
    const awayXg = optionalNonNegative(row.away_xg, rowNumber, "away_xg")
    const xgSource = row.xg_source?.trim() || null
    if ((homeXg !== null || awayXg !== null || xgSource) && (homeXg === null || awayXg === null || !xgSource)) {
      throw new Error("Row " + rowNumber + ": xG requires home_xg, away_xg and xg_source together.")
    }
    return {
      fixtureId: row.fixture_id,
      kickoff: row.kickoff,
      kickoffAt,
      completedAt,
      homeId: row.home_team_id,
      homeName: row.home_team,
      awayId: row.away_team_id,
      awayName: row.away_team,
      homeGoals: positiveInteger(row.home_goals, rowNumber, "home_goals"),
      awayGoals: positiveInteger(row.away_goals, rowNumber, "away_goals"),
      homeXg,
      awayXg,
      xgSource,
    }
  }).sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId))

  const history = new Map<string, RawAppearance[]>()
  const prepared: BacktestInputRow[] = []

  for (const fixture of fixtures) {
    const homeHistory = latestWindow(history.get(fixture.homeId) ?? [], fixture.kickoffAt, windowSize)
    const awayHistory = latestWindow(history.get(fixture.awayId) ?? [], fixture.kickoffAt, windowSize)

    if (homeHistory.length === windowSize && awayHistory.length === windowSize) {
      const featureCutoff = Math.max(
        ...homeHistory.map((row) => row.completedAt),
        ...awayHistory.map((row) => row.completedAt),
      )
      if (featureCutoff >= fixture.kickoffAt) {
        throw new Error("Internal point-in-time validation failed for fixture " + fixture.fixtureId + ".")
      }

      const homeAttack = weighted(homeHistory.map((row) => row.gf), windowSize)
      const homeDefense = weighted(homeHistory.map((row) => row.ga), windowSize)
      const awayAttack = weighted(awayHistory.map((row) => row.gf), windowSize)
      const awayDefense = weighted(awayHistory.map((row) => row.ga), windowSize)

      const allRecent = [...homeHistory, ...awayHistory]
      const xgSources = new Set(allRecent.map((row) => row.xgSource))
      const completeXg = allRecent.every((row) => row.xgf !== null && row.xga !== null && row.xgSource)
      const source = xgSources.size === 1 ? [...xgSources][0] : null
      const row: BacktestInputRow = {
        fixture_id: fixture.fixtureId,
        date: fixture.kickoff,
        features_as_of: new Date(featureCutoff).toISOString(),
        home_team: fixture.homeName,
        away_team: fixture.awayName,
        home_attack: String(homeAttack),
        home_defense: String(homeDefense),
        away_attack: String(awayAttack),
        away_defense: String(awayDefense),
        home_goals: String(fixture.homeGoals),
        away_goals: String(fixture.awayGoals),
        home_edge: "1",
        model: "dixon",
      }
      if (completeXg && source) {
        row.home_xg_for = String(weighted(homeHistory.map((item) => item.xgf!), windowSize))
        row.home_xg_against = String(weighted(homeHistory.map((item) => item.xga!), windowSize))
        row.away_xg_for = String(weighted(awayHistory.map((item) => item.xgf!), windowSize))
        row.away_xg_against = String(weighted(awayHistory.map((item) => item.xga!), windowSize))
        row.xg_source = source
      }
      prepared.push(row)
    }

    const append = (teamId: string, appearance: RawAppearance) => {
      const rows = history.get(teamId) ?? []
      rows.push(appearance)
      history.set(teamId, rows)
    }
    append(fixture.homeId, {
      completedAt: fixture.completedAt,
      gf: fixture.homeGoals,
      ga: fixture.awayGoals,
      xgf: fixture.homeXg,
      xga: fixture.awayXg,
      xgSource: fixture.xgSource,
    })
    append(fixture.awayId, {
      completedAt: fixture.completedAt,
      gf: fixture.awayGoals,
      ga: fixture.homeGoals,
      xgf: fixture.awayXg,
      xga: fixture.homeXg,
      xgSource: fixture.xgSource,
    })
  }

  if (!prepared.length) {
    throw new Error("No fixture had enough prior completed matches. Supply more history or reduce the rolling window.")
  }

  const xgKeys = ["home_xg_for", "home_xg_against", "away_xg_for", "away_xg_against", "xg_source"]
  const allRowsHaveXg = prepared.every((row) => xgKeys.every((key) => Boolean(row[key])))
  const xgSources = new Set(prepared.map((row) => row.xg_source).filter(Boolean))
  if (!allRowsHaveXg || xgSources.size !== 1) {
    for (const row of prepared) for (const key of xgKeys) delete row[key]
  }
  return prepared
}

export function stringifyPreparedRows(rows: BacktestInputRow[]): string {
  if (!rows.length) throw new Error("No prepared prematch rows to export.")
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const text = String(value ?? "")
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n") + "\n"
}
