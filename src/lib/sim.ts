import type { Team } from "@/data/football"

export const SIMS = 1000
export const LEAGUE_AVG = 1.35
/** Dixon–Coles low-score tie. Negative lifts 0–0 and 1–1. */
export const DIXON_RHO = -0.1

export type ModelKind = "plain" | "dixon"

export type Score = { h: number; a: number }

export type Report = {
  n: number
  homeXg: number
  awayXg: number
  homeWins: number
  draws: number
  awayWins: number
  btts: number
  homeClean: number
  awayClean: number
  over25: number
  meanHome: number
  meanAway: number
  mode: Score & { n: number }
  top: (Score & { n: number })[]
  /** [home 0..5+][away 0..5+] counts */
  matrix: number[][]
  /** ≤−4 … ≥+4, nine bins. Center index 4 is a draw. */
  margins: number[]
  /** 0 through 7+ */
  totals: number[]
  scores: Score[]
}

export type TapeKind = "kick" | "chance" | "goal" | "card" | "half" | "full"

export type TapeEvent = {
  min: number
  kind: TapeKind
  side: "home" | "away" | "none"
  text: string
  score: [number, number]
}

const MARGIN_LABELS = ["≤−4", "−3", "−2", "−1", "0", "+1", "+2", "+3", "≥+4"]
const TOTAL_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7+"]

export function marginLabels(): string[] {
  return MARGIN_LABELS
}

export function totalLabels(): string[] {
  return TOTAL_LABELS
}

export function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k += 1
    p *= rng()
    if (k > 40) break
  } while (p > limit)
  return k - 1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** edge is a home scoring multiplier. 1 is a neutral pitch. */
export function expectedGoals(home: Team, away: Team, edge: number): { homeXg: number; awayXg: number } {
  const safe = clamp(edge, 0.7, 1.6)
  const homeXg = clamp(home.attack * (away.defense / LEAGUE_AVG) * safe, 0.12, 4.8)
  const awayXg = clamp(away.attack * (home.defense / LEAGUE_AVG) / Math.sqrt(safe), 0.08, 4.4)
  return { homeXg, awayXg }
}

function poissonPmf(lambda: number, max: number): number[] {
  const probs = [Math.exp(-lambda)]
  for (let k = 1; k <= max; k++) probs[k] = (probs[k - 1] * lambda) / k
  return probs
}

const DC_MAX = 12

function dixonTau(homeGoals: number, awayGoals: number, homeXg: number, awayXg: number): number {
  const rho = DIXON_RHO
  let tau = 1
  if (homeGoals === 0 && awayGoals === 0) tau = 1 - homeXg * awayXg * rho
  else if (homeGoals === 0 && awayGoals === 1) tau = 1 + homeXg * rho
  else if (homeGoals === 1 && awayGoals === 0) tau = 1 + awayXg * rho
  else if (homeGoals === 1 && awayGoals === 1) tau = 1 - rho
  return tau > 0 ? tau : 0
}

function jointGrid(homeXg: number, awayXg: number): { grid: number[][]; cdf: number[] } {
  const homeP = poissonPmf(homeXg, DC_MAX)
  const awayP = poissonPmf(awayXg, DC_MAX)
  const grid: number[][] = []
  let sum = 0
  for (let homeGoals = 0; homeGoals <= DC_MAX; homeGoals++) {
    grid[homeGoals] = []
    for (let awayGoals = 0; awayGoals <= DC_MAX; awayGoals++) {
      const p = homeP[homeGoals] * awayP[awayGoals] * dixonTau(homeGoals, awayGoals, homeXg, awayXg)
      grid[homeGoals][awayGoals] = p
      sum += p
    }
  }
  const scale = sum || 1
  const cdf: number[] = []
  let acc = 0
  for (let homeGoals = 0; homeGoals <= DC_MAX; homeGoals++) {
    for (let awayGoals = 0; awayGoals <= DC_MAX; awayGoals++) {
      grid[homeGoals][awayGoals] /= scale
      acc += grid[homeGoals][awayGoals]
      cdf.push(acc)
    }
  }
  return { grid, cdf }
}

function sampleGrid(cdf: number[], rng: () => number): { h: number; a: number } {
  const u = rng()
  let lo = 0
  let hi = cdf.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (u <= cdf[mid]) hi = mid
    else lo = mid + 1
  }
  const span = DC_MAX + 1
  return { h: Math.floor(lo / span), a: lo % span }
}

export function analyticalSplit(
  home: Team,
  away: Team,
  edge: number,
  model: ModelKind = "plain",
): { homeXg: number; awayXg: number; home: number; draw: number; away: number } {
  const { homeXg, awayXg } = expectedGoals(home, away, edge)
  if (model === "dixon") {
    const { grid } = jointGrid(homeXg, awayXg)
    let hw = 0
    let dr = 0
    let aw = 0
    for (let h = 0; h <= DC_MAX; h++) {
      for (let a = 0; a <= DC_MAX; a++) {
        const p = grid[h][a]
        if (h > a) hw += p
        else if (h === a) dr += p
        else aw += p
      }
    }
    return { homeXg, awayXg, home: hw, draw: dr, away: aw }
  }
  const hp = poissonPmf(homeXg, 12)
  const ap = poissonPmf(awayXg, 12)
  let hw = 0
  let dr = 0
  let aw = 0
  for (let h = 0; h <= 12; h++) {
    for (let a = 0; a <= 12; a++) {
      const p = hp[h] * ap[a]
      if (h > a) hw += p
      else if (h === a) dr += p
      else aw += p
    }
  }
  const sum = hw + dr + aw || 1
  return { homeXg, awayXg, home: hw / sum, draw: dr / sum, away: aw / sum }
}

function marginBin(margin: number): number {
  if (margin <= -4) return 0
  if (margin >= 4) return 8
  return margin + 4
}

export function simulate(home: Team, away: Team, edge: number, roll: number, model: ModelKind = "plain"): Report {
  const { homeXg, awayXg } = expectedGoals(home, away, edge)
  const seed =
    model === "dixon"
      ? hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|${roll}|dixon`)
      : hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|${roll}|sims`)
  const rng = mulberry32(seed)
  const dixon = model === "dixon" ? jointGrid(homeXg, awayXg) : null
  const matrix = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0))
  const margins = Array.from({ length: 9 }, () => 0)
  const totals = Array.from({ length: 8 }, () => 0)
  const exact = new Map<string, Score & { n: number }>()
  const scores: Score[] = []
  let homeWins = 0
  let draws = 0
  let awayWins = 0
  let btts = 0
  let homeClean = 0
  let awayClean = 0
  let over25 = 0
  let sumH = 0
  let sumA = 0

  for (let i = 0; i < SIMS; i++) {
    const drawn = dixon ? sampleGrid(dixon.cdf, rng) : { h: poisson(homeXg, rng), a: poisson(awayXg, rng) }
    const h = drawn.h
    const a = drawn.a
    scores.push({ h, a })
    sumH += h
    sumA += a
    matrix[Math.min(5, h)][Math.min(5, a)] += 1
    margins[marginBin(h - a)] += 1
    totals[Math.min(7, h + a)] += 1
    if (h > a) homeWins += 1
    else if (h === a) draws += 1
    else awayWins += 1
    if (h > 0 && a > 0) btts += 1
    if (a === 0) homeClean += 1
    if (h === 0) awayClean += 1
    if (h + a > 2.5) over25 += 1
    const key = `${h}-${a}`
    const prev = exact.get(key)
    if (prev) prev.n += 1
    else exact.set(key, { h, a, n: 1 })
  }

  const ranked = [...exact.values()].sort((a, b) => b.n - a.n || b.h - a.h)
  const mode = ranked[0] ?? { h: 0, a: 0, n: 0 }

  return {
    n: SIMS,
    homeXg,
    awayXg,
    homeWins,
    draws,
    awayWins,
    btts,
    homeClean,
    awayClean,
    over25,
    meanHome: sumH / SIMS,
    meanAway: sumA / SIMS,
    mode,
    top: ranked.slice(0, 5),
    matrix,
    margins,
    totals,
    scores,
  }
}

export function splitHandicap(scores: Score[], line: number): { win: number; push: number; lose: number } {
  let win = 0
  let push = 0
  let lose = 0
  for (const score of scores) {
    const result = score.h - score.a + line
    if (Math.abs(result) < 1e-9) push += 1
    else if (result > 0) win += 1
    else lose += 1
  }
  return { win, push, lose }
}

export function splitTotal(scores: Score[], line: number): { over: number; push: number; under: number } {
  let over = 0
  let push = 0
  let under = 0
  for (const score of scores) {
    const total = score.h + score.a
    if (Math.abs(total - line) < 1e-9) push += 1
    else if (total > line) over += 1
    else under += 1
  }
  return { over, push, under }
}

const CHANCE_LINES = [
  (player: string) => `${player} forces a save`,
  (player: string) => `${player} shoots wide`,
  (player: string) => `${player} heads over the bar`,
  (player: string) => `The cross finds ${player}, and the keeper holds it`,
]

const GOAL_LINES = [
  (player: string) => `${player} finishes`,
  (player: string) => `${player} scores`,
  (player: string) => `${player} converts`,
]

function pickPlayer(team: Team, rng: () => number): string {
  const bias = rng()
  if (bias < 0.5) return team.scorers[0]
  if (bias < 0.8) return team.scorers[1]
  return team.scorers[2]
}

function distinctMinutes(count: number, rng: () => number, taken: Set<number>): number[] {
  const minutes: number[] = []
  let guard = 0
  while (minutes.length < count && guard < 240) {
    guard += 1
    const minute = 1 + Math.floor(rng() * 90)
    if (taken.has(minute)) continue
    taken.add(minute)
    minutes.push(minute)
  }
  return minutes
}

export function playOne(home: Team, away: Team, edge: number, roll: number, model: ModelKind = "plain"): TapeEvent[] {
  const { homeXg, awayXg } = expectedGoals(home, away, edge)
  const seed =
    model === "dixon"
      ? hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|tape|${roll}|dixon`)
      : hashSeed(`${home.id}|${away.id}|${edge.toFixed(3)}|tape|${roll}`)
  const rng = mulberry32(seed)
  const drawn =
    model === "dixon" ? sampleGrid(jointGrid(homeXg, awayXg).cdf, rng) : { h: poisson(homeXg, rng), a: poisson(awayXg, rng) }
  const homeGoals = drawn.h
  const awayGoals = drawn.a
  const taken = new Set<number>()
  const raw: Omit<TapeEvent, "score">[] = []

  for (const minute of distinctMinutes(homeGoals, rng, taken)) {
    const player = pickPlayer(home, rng)
    raw.push({
      min: minute,
      kind: "goal",
      side: "home",
      text: GOAL_LINES[Math.floor(rng() * GOAL_LINES.length)](player),
    })
  }
  for (const minute of distinctMinutes(awayGoals, rng, taken)) {
    const player = pickPlayer(away, rng)
    raw.push({
      min: minute,
      kind: "goal",
      side: "away",
      text: GOAL_LINES[Math.floor(rng() * GOAL_LINES.length)](player),
    })
  }
  for (const minute of distinctMinutes(poisson(homeXg * 2.2, rng), rng, taken)) {
    const player = pickPlayer(home, rng)
    raw.push({
      min: minute,
      kind: "chance",
      side: "home",
      text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](player),
    })
  }
  for (const minute of distinctMinutes(poisson(awayXg * 2.2, rng), rng, taken)) {
    const player = pickPlayer(away, rng)
    raw.push({
      min: minute,
      kind: "chance",
      side: "away",
      text: CHANCE_LINES[Math.floor(rng() * CHANCE_LINES.length)](player),
    })
  }
  if (rng() < 0.62) {
    const side = rng() < 0.5 ? "home" : "away"
    const minute = distinctMinutes(1, rng, taken)[0]
    if (minute) {
      raw.push({
        min: minute,
        kind: "card",
        side,
        text: "Booking for a late challenge",
      })
    }
  }

  raw.sort((a, b) => a.min - b.min)

  const events: TapeEvent[] = []
  let h = 0
  let a = 0
  let half = false
  events.push({ min: 0, kind: "kick", side: "none", text: "Kick-off", score: [0, 0] })

  for (const item of raw) {
    if (!half && item.min > 45) {
      half = true
      events.push({ min: 45, kind: "half", side: "none", text: "Half-time", score: [h, a] })
    }
    if (item.kind === "goal") {
      if (item.side === "home") h += 1
      else a += 1
    }
    events.push({ ...item, score: [h, a] })
  }
  if (!half) {
    events.push({ min: 45, kind: "half", side: "none", text: "Half-time", score: [h, a] })
  }
  events.push({ min: 90, kind: "full", side: "none", text: "Full-time", score: [h, a] })
  return events
}

export function indexFor(team: Team, peers: Team[]): number {
  const nets = peers.map((peer) => peer.attack - peer.defense)
  const min = Math.min(...nets)
  const max = Math.max(...nets)
  const net = team.attack - team.defense
  if (max === min) return 50
  return Math.round(38 + ((net - min) / (max - min)) * 58)
}

export function pctLabel(count: number, total: number): string {
  if (total <= 0) return "0%"
  return `${((count / total) * 100).toFixed(1)}%`
}

export function shareLabel(share: number): string {
  return `${(share * 100).toFixed(0)}%`
}

/** Fair decimal odds from a share of the simulations. */
export function fairDecimal(share: number): string {
  if (!(share > 0.004)) return "—"
  const price = 1 / share
  if (price >= 100) return price.toFixed(0)
  return price.toFixed(2)
}

export function formatLine(n: number): string {
  const body = Math.abs(n).toFixed(1)
  if (n > 0) return `+${body}`
  if (n < 0) return `−${body}`
  return "0.0"
}

export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}
