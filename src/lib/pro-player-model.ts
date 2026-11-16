import type {
  PlayerPosition,
  PlayerScores,
  SquadPlayer,
  TeamPlayerFactors,
} from "./pro-player-data.ts"

type Dict = Record<string, unknown>

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function stat(source: Dict, stats: Dict, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = stats[key] ?? source[key]
    const candidate = record(raw)?.value ?? raw
    const value = numeric(candidate)
    if (value !== null) return value
  }
  return null
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

function weightedScore(values: Array<[number | null, number]>): number | null {
  const available = values.filter((item): item is [number, number] => item[0] !== null)
  const weight = available.reduce((sum, item) => sum + item[1], 0)
  if (weight <= 0) return null
  return available.reduce((sum, item) => sum + item[0] * item[1], 0) / weight
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(clamp(value) * 10) / 10
}

export function positionFrom(value: unknown): PlayerPosition {
  const position = record(value)
  const candidate = position?.shortLabel ?? position?.abbreviation ?? position?.abbr ?? position?.name ?? value
  const raw = typeof candidate === "string" ? candidate.trim().toUpperCase() : ""
  if (["G", "GK", "GKP"].includes(raw) || raw.includes("GOALKEEPER")) return "GK"
  if (["D", "DF", "DEF", "CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB", "SW"].includes(raw) ||
      raw.includes("DEFENDER") || raw.includes("BACK")) return "DF"
  if (["M", "MF", "MID", "CDM", "CM", "LCM", "RCM", "CAM", "LM", "RM", "DM"].includes(raw) ||
      raw.includes("MIDFIELDER")) return "MF"
  if (["F", "FW", "ATT", "ST", "CF", "LW", "RW", "LF", "RF"].includes(raw) ||
      raw.includes("FORWARD") || raw.includes("STRIKER") || raw.includes("ATTACKER")) return "FW"
  return "UNK"
}

/**
 * EA's base ratings are stable player-quality priors, not current match form.
 * Detailed attributes are preferred; the six face attributes provide a
 * position-neutral fallback when EA omits a detailed field.
 */
export function deriveEaPlayerScores(source: unknown): PlayerScores | null {
  const root = record(source)
  if (!root) return null
  const stats = record(root.stats) ?? {}
  const overallRaw = root.overall ?? root.overallRating
  const overall = numeric(record(overallRaw)?.value ?? overallRaw)
  const pace = stat(root, stats, "pac", "pace")
  const shooting = stat(root, stats, "sho", "shooting")
  const passing = stat(root, stats, "pas", "passing")
  const dribbling = stat(root, stats, "dri", "dribbling")
  const defending = stat(root, stats, "def", "defending")
  const physicality = stat(root, stats, "phy", "physicality")

  const attack = weightedScore([
    [stat(root, stats, "finishing"), 0.21],
    [stat(root, stats, "positioning"), 0.14],
    [stat(root, stats, "shotPower"), 0.10],
    [stat(root, stats, "longShots"), 0.05],
    [stat(root, stats, "volleys"), 0.04],
    [stat(root, stats, "headingAccuracy", "heading"), 0.05],
    [shooting, 0.15],
    [pace, 0.09],
    [dribbling, 0.09],
    [stat(root, stats, "sprintSpeed", "acceleration"), 0.08],
  ]) ?? overall

  const creativity = weightedScore([
    [stat(root, stats, "vision", "mentalityVision"), 0.22],
    [stat(root, stats, "shortPassing"), 0.20],
    [stat(root, stats, "longPassing"), 0.12],
    [passing, 0.17],
    [stat(root, stats, "ballControl"), 0.12],
    [dribbling, 0.10],
    [stat(root, stats, "crossing", "curve"), 0.07],
  ]) ?? overall

  const defence = weightedScore([
    [stat(root, stats, "defensiveAwareness", "marking"), 0.22],
    [stat(root, stats, "standingTackle"), 0.16],
    [stat(root, stats, "slidingTackle"), 0.09],
    [stat(root, stats, "interceptions"), 0.13],
    [defending, 0.15],
    [stat(root, stats, "strength"), 0.07],
    [stat(root, stats, "aggression"), 0.05],
    [stat(root, stats, "headingAccuracy", "heading", "jumping"), 0.06],
    [physicality, 0.07],
  ]) ?? overall

  const goalkeeper = weightedScore([
    [stat(root, stats, "gkDiving"), 0.24],
    [stat(root, stats, "gkHandling"), 0.17],
    [stat(root, stats, "gkPositioning"), 0.20],
    [stat(root, stats, "gkReflexes"), 0.24],
    [stat(root, stats, "gkKicking"), 0.08],
    [stat(root, stats, "reactions"), 0.07],
  ])

  const position = positionFrom(root.position)
  const hasAnyPlayerData = overall !== null || pace !== null || shooting !== null ||
    passing !== null || dribbling !== null || defending !== null || physicality !== null ||
    goalkeeper !== null
  if (!hasAnyPlayerData) return null

  return {
    attack: round(attack),
    creativity: round(creativity),
    defence: round(defence),
    goalkeeper: round(position === "GK" ? (goalkeeper ?? overall) : goalkeeper),
    seasonRating: round(overall),
    // EA ratings contain no real-world appearances or minutes. Keep these at
    // zero instead of inventing playing-time weights.
    appearances: 0,
    minutes: 0,
  }
}

export function normaliseEaSquadPlayer(source: unknown): SquadPlayer | null {
  const item = record(source)
  if (!item) return null
  const idValue = item.id ?? item.playerId
  const id = typeof idValue === "string" || typeof idValue === "number" ? String(idValue).trim() : ""
  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!id || !name) return null
  const scores = deriveEaPlayerScores(item)
  if (!scores) return null
  const number = numeric(item.number)
  return {
    id,
    name,
    number,
    position: positionFrom(item.position),
    scores,
  }
}

function weightedAverage(
  players: SquadPlayer[],
  key: "attack" | "creativity" | "defence" | "goalkeeper",
  positionWeights: Record<PlayerPosition, number>,
): number {
  let total = 0
  let weightTotal = 0
  for (const player of players) {
    const score = player.scores?.[key]
    const roleWeight = positionWeights[player.position]
    if (score === null || score === undefined || roleWeight <= 0) continue
    total += score * roleWeight
    weightTotal += roleWeight
  }
  return weightTotal > 0 ? total / weightTotal : 50
}

/**
 * Aggregate the full EA club player pool. Every player receives equal
 * availability weighting because EA does not supply real-world minutes.
 * Position weights separate goalkeeping, defensive, midfield and attacking
 * contributions; the lower-rated half estimates squad depth.
 */
export function deriveSquadFactors(players: SquadPlayer[]): {
  attackIndex: number
  creativityIndex: number
  defenceIndex: number
  factors: TeamPlayerFactors
} {
  const rated = players.filter((player) => player.scores !== null)
  const squadCount = players.length
  const ratedPlayers = rated.length
  const coverage = squadCount > 0 ? ratedPlayers / squadCount : 0

  const attackIndex = weightedAverage(
    rated,
    "attack",
    { GK: 0.05, DF: 0.45, MF: 1, FW: 1.45, UNK: 0.65 },
  )
  const creativityIndex = weightedAverage(
    rated,
    "creativity",
    { GK: 0.05, DF: 0.5, MF: 1.4, FW: 0.9, UNK: 0.7 },
  )
  const outfieldDefence = weightedAverage(
    rated,
    "defence",
    { GK: 0.1, DF: 1.45, MF: 0.95, FW: 0.35, UNK: 0.7 },
  )
  const goalkeeperIndex = weightedAverage(
    rated,
    "goalkeeper",
    { GK: 1, DF: 0, MF: 0, FW: 0, UNK: 0 },
  )
  const defenceIndex = outfieldDefence * 0.78 + goalkeeperIndex * 0.22

  const depthScores = rated
    .map((player) => player.scores?.seasonRating)
    .filter((score): score is number => score !== null && score !== undefined)
    .sort((left, right) => left - right)
  const depthPool = depthScores.length >= 6
    ? depthScores.slice(0, Math.ceil(depthScores.length / 2))
    : depthScores
  const squadDepth = depthPool.length
    ? depthPool.reduce((sum, score) => sum + score, 0) / depthPool.length
    : 50

  const enoughData = squadCount >= 12 && ratedPlayers >= 12 && coverage >= 0.6
  const shrink = enoughData ? Math.min(1, coverage) : 0
  const multiplier = (score: number, divisor: number, min: number, max: number) =>
    Math.min(max, Math.max(min, 1 + ((score - 50) / divisor) * shrink))

  return {
    attackIndex: Math.round(attackIndex * 10) / 10,
    creativityIndex: Math.round(creativityIndex * 10) / 10,
    defenceIndex: Math.round(defenceIndex * 10) / 10,
    factors: {
      attackMultiplier: multiplier(attackIndex, 280, 0.93, 1.07),
      creativityMultiplier: multiplier(creativityIndex, 250, 0.92, 1.08),
      defenceMultiplier: multiplier(defenceIndex, -280, 0.93, 1.07),
      squadDepth: Math.round(squadDepth * 10) / 10,
      ratedPlayers,
      squadCount,
      coverage,
      applied: enoughData,
    },
  }
}

export function teamNameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

/** Normalize names consistently with scripts/sync_ea_fc27.py. */
export function normalisePlayerName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** First three alphanumeric characters select the Firestore EA player shard. */
export function playerNameShardId(value: string): string {
  const compact = normalisePlayerName(value).replace(/[^a-z0-9]/g, "")
  return compact.slice(0, 3).padEnd(3, "_") || "___"
}

/**
 * Match an ESPN roster identity to EA's base-player record.
 * Name equality is strict after accent/punctuation normalization. Position
 * and nationality may disambiguate duplicate names; unresolved collisions
 * intentionally return null rather than guessing.
 */
export function matchEaPlayerByName(input: {
  nameCandidates: string[]
  position?: unknown
  nationality?: string | null
}, candidates: unknown[]): Dict | null {
  const keys = new Set(input.nameCandidates.map(normalisePlayerName).filter(Boolean))
  if (!keys.size) return null

  const matches = candidates.flatMap((candidate) => {
    const item = record(candidate)
    if (!item) return []
    const nameKeys = Array.isArray(item.nameKeys)
      ? item.nameKeys.filter((key): key is string => typeof key === "string")
      : [typeof item.name === "string" ? item.name : ""]
    return nameKeys.some((key) => keys.has(normalisePlayerName(key))) ? [item] : []
  })
  const unique = [...new Map(matches.map((item) => [String(item.id ?? ""), item])).values()]
  if (unique.length <= 1) return unique[0] ?? null

  const rosterPosition = positionFrom(input.position)
  if (rosterPosition !== "UNK") {
    const positionMatches = unique.filter((item) => positionFrom(item.position) === rosterPosition)
    if (positionMatches.length === 1) return positionMatches[0]
    if (positionMatches.length > 1) {
      unique.splice(0, unique.length, ...positionMatches)
    }
  }

  const nationality = input.nationality ? normalisePlayerName(input.nationality) : ""
  if (nationality) {
    const nationalityMatches = unique.filter((item) =>
      typeof item.nationality === "string" &&
      normalisePlayerName(item.nationality) === nationality,
    )
    if (nationalityMatches.length === 1) return nationalityMatches[0]
  }

  return unique.length === 1 ? unique[0] : null
}

