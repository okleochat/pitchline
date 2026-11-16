import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { backtestRows } from "./backtest.mjs"

const ROOT = "https://raw.githubusercontent.com/hudl/open-data/master/data"
const USER_AGENT = "Pitchline-StatsBomb-OpenData-Research/1.0"
const CSV_HEADERS = [
  "fixture_id", "date", "features_as_of", "home_team", "away_team",
  "home_attack", "home_defense", "away_attack", "away_defense",
  "home_goals", "away_goals", "model",
]

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`StatsBomb Open Data request failed (${response.status}) for ${url}`)
  return response.json()
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

export function aggregateMatchXg(events) {
  const totals = new Map()
  for (const event of events) {
    if (event?.type?.name !== "Shot") continue
    const team = event?.team?.name
    const xg = finite(event?.shot?.statsbomb_xg)
    if (typeof team !== "string" || !team.trim() || xg === null) continue
    const current = totals.get(team) ?? { xgFor: 0, shots: 0 }
    current.xgFor += xg
    current.shots += 1
    totals.set(team, current)
  }
  return totals
}

function safeMean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isoForMatch(match) {
  const date = String(match.match_date ?? "")
  const time = String(match.kick_off ?? "12:00:00").slice(0, 8)
  const iso = new Date(`${date}T${/^\d{2}:\d{2}:\d{2}$/.test(time) ? time : "12:00:00"}Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(iso.getTime())) return null
  return iso.toISOString()
}

export function buildPrematchRows(matches, windowSize = 5) {
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 10) {
    throw new Error("The prematch history window must be an integer from 1 to 10.")
  }
  const validMatches = matches
    .filter((match) => match && match.id && match.match_date && match.homeTeam && match.awayTeam)
    .sort((a, b) => String(a.match_date).localeCompare(String(b.match_date)) || String(a.kickoff).localeCompare(String(b.kickoff)))

  const history = new Map()
  const output = []
  const dates = [...new Set(validMatches.map((match) => String(match.match_date)))]

  for (const date of dates) {
    const group = validMatches.filter((match) => String(match.match_date) === date)
    // Every fixture on a date is scored before any fixture from that date is added to history.
    // This conservative day boundary prevents same-day kick-off ordering from leaking features.
    for (const match of group) {
      const homeHistory = history.get(match.homeTeam) ?? []
      const awayHistory = history.get(match.awayTeam) ?? []
      if (homeHistory.length < windowSize || awayHistory.length < windowSize) continue

      const homeLast = homeHistory.slice(-windowSize)
      const awayLast = awayHistory.slice(-windowSize)
      const kickoff = match.kickoff || isoForMatch(match)
      if (!kickoff) continue
      const featuresAsOf = new Date(new Date(date + "T00:00:00Z").getTime() - 1000).toISOString()

      output.push({
        fixture_id: String(match.id),
        date: kickoff,
        features_as_of: featuresAsOf,
        home_team: match.homeTeam,
        away_team: match.awayTeam,
        home_attack: safeMean(homeLast.map((row) => row.xgFor)),
        home_defense: safeMean(homeLast.map((row) => row.xgAgainst)),
        away_attack: safeMean(awayLast.map((row) => row.xgFor)),
        away_defense: safeMean(awayLast.map((row) => row.xgAgainst)),
        home_goals: match.homeGoals,
        away_goals: match.awayGoals,
        model: "dixon",
      })
    }

    for (const match of group) {
      if (!Number.isInteger(match.homeGoals) || !Number.isInteger(match.awayGoals)) continue
      if (!Number.isFinite(match.homeXg) || !Number.isFinite(match.awayXg)) continue
      const home = history.get(match.homeTeam) ?? []
      home.push({ xgFor: match.homeXg, xgAgainst: match.awayXg })
      history.set(match.homeTeam, home)
      const away = history.get(match.awayTeam) ?? []
      away.push({ xgFor: match.awayXg, xgAgainst: match.homeXg })
      history.set(match.awayTeam, away)
    }
  }

  return output
}

function csvEscape(value) {
  const text = String(value ?? "")
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

function toCsv(rows) {
  return [CSV_HEADERS.join(","), ...rows.map((row) => CSV_HEADERS.map((key) => csvEscape(row[key])).join(","))].join("\n") + "\n"
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

function parseArgs(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      const key = args[index]
      values.set(key, args[index + 1] && !args[index + 1].startsWith("--") ? args[++index] : true)
    }
  }
  return values
}

async function listSeasons() {
  const competitions = await getJson(ROOT + "/competitions.json")
  for (const item of competitions) {
    const seasons = Array.isArray(item.seasons) ? item.seasons : []
    process.stdout.write(`${item.competition_id}\t${item.competition_name}\t${item.country_name ?? ""}\t${seasons.map((s) => `${s.season_id}:${s.season_name}`).join(" | ")}\n`)
  }
}

async function runBacktest(options) {
  const competitionId = Number(options.get("--competition-id"))
  const seasonId = Number(options.get("--season-id"))
  const windowSize = Number(options.get("--window") ?? 5)
  const prefix = String(options.get("--output") ?? "statsbomb-open-data")
  if (!Number.isInteger(competitionId) || competitionId < 1 || !Number.isInteger(seasonId) || seasonId < 1) {
    throw new Error("Usage: npm run backtest:statsbomb -- --competition-id <id> --season-id <id> [--window 5] [--output prefix]")
  }

  const matches = await getJson(`${ROOT}/matches/${competitionId}/${seasonId}.json`)
  const mapped = matches.map((match) => ({
    id: match.match_id,
    match_date: match.match_date,
    kick_off: match.kick_off,
    kickoff: isoForMatch(match),
    homeTeam: match.home_team?.home_team_name,
    awayTeam: match.away_team?.away_team_name,
    homeGoals: match.home_score,
    awayGoals: match.away_score,
  })).filter((match) => match.id && match.homeTeam && match.awayTeam && match.kickoff)

  process.stdout.write(`Fetching StatsBomb shot events for ${mapped.length} matches (4 concurrent requests)...\n`)
  const enriched = await mapLimit(mapped, 4, async (match, index) => {
    const events = await getJson(`${ROOT}/events/${match.id}.json`)
    const totals = aggregateMatchXg(events)
    const home = totals.get(match.homeTeam)
    const away = totals.get(match.awayTeam)
    if (!home || !away || home.shots === 0 || away.shots === 0) return null
    if (!Number.isInteger(match.homeGoals) || !Number.isInteger(match.awayGoals)) return null
    if ((index + 1) % 20 === 0) process.stdout.write(`Processed ${index + 1}/${mapped.length}\n`)
    return { ...match, homeXg: home.xgFor, awayXg: away.xgFor }
  })

  const usable = enriched.filter(Boolean)
  const rows = buildPrematchRows(usable, windowSize)
  if (!rows.length) {
    throw new Error(`No fixtures have ${windowSize} prior completed StatsBomb matches for both teams with usable shot-level xG. Try another competition/season or a smaller research window; do not fill missing values with goals.`)
  }

  const report = backtestRows(rows)
  const metadata = {
    ...report,
    source: "StatsBomb Open Data (Hudl)",
    competitionId,
    seasonId,
    rollingWindowMatches: windowSize,
    featureDefinition: "Mean shot-level StatsBomb xG for and against across the previous N completed matches for each team, excluding all matches played on the target fixture date.",
    attribution: "StatsBomb Open Data: https://github.com/hudl/open-data",
    limitations: [
      "Open data contains selected competitions and seasons, not global coverage.",
      "Match xG is aggregated from event-level shot.statsbomb_xg.",
      "This tests the goal-grid engine using pre-match xG averages; it does not validate live provider coverage or bookmaker ROI.",
      "Do not combine these results with goal-based training records without tracking feature provenance.",
    ],
  }

  const csvPath = path.resolve(prefix + ".csv")
  const reportPath = path.resolve(prefix + "-report.json")
  await mkdir(path.dirname(csvPath), { recursive: true })
  await writeFile(csvPath, toCsv(rows), "utf8")
  await writeFile(reportPath, JSON.stringify(metadata, null, 2) + "\n", "utf8")
  process.stdout.write(`Eligible fixtures: ${rows.length}\nCSV: ${csvPath}\nReport: ${reportPath}\n`)
  process.stdout.write(`1X2 Brier: ${metadata.oneX2.brierScore.toFixed(4)} · Log loss: ${metadata.oneX2.logLoss.toFixed(4)} · Accuracy: ${(metadata.oneX2.accuracy * 100).toFixed(1)}%\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.has("--list")) return listSeasons()
  return runBacktest(options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error?.message ?? error) + "\n")
    process.exitCode = 1
  })
}
