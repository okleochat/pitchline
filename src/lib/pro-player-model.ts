import type {
  LineupPlayer,
  PlayerPosition,
  PlayerScores,
  TeamLineupFactors,
} from "./pro-player-data.ts"

type Dict = Record<string, unknown>

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function valueAt(source: unknown, key: string): unknown {
  return record(source)?.[key]
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function metric(source: unknown, key: string): number {
  return numeric(valueAt(source, key)) ?? 0
}

function nested(source: unknown, first: string, second: string): number {
  return metric(valueAt(source, first), second)
}

function per90(total: number, minutes: number): number {
  return minutes > 0 ? (total * 90) / minutes : 0
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

function positionFrom(value: unknown): PlayerPosition {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (raw === "g" || raw.includes("goalkeeper") || raw === "goalie") return "GK"
  if (raw === "d" || raw.includes("defender") || raw.includes("back")) return "DF"
  if (raw === "m" || raw.includes("midfielder")) return "MF"
  if (raw === "f" || raw.includes("attacker") || raw.includes("forward") || raw.includes("striker")) return "FW"
  return "UNK"
}

export function derivePlayerScores(statistics: unknown): PlayerScores | null {
  const root = record(statistics)
  if (!root) return null
  const games = valueAt(root, "games")
  const minutes = metric(games, "minutes")
  const appearances = metric(games, "appearences") || metric(games, "appearances")
  if (minutes <= 0 || appearances <= 0) return null

  const goals = nested(root, "goals", "total")
  const assists = nested(root, "goals", "assists")
  const shots = nested(root, "shots", "total")
  const shotsOnTarget = nested(root, "shots", "on")
  const keyPasses = nested(root, "passes", "key")
  const passAccuracy = numeric(valueAt(valueAt(root, "passes"), "accuracy"))
  const tackles = nested(root, "tackles", "total")
  const interceptions = nested(root, "tackles", "interceptions")
  const duels = nested(root, "duels", "total")
  const duelsWon = nested(root, "duels", "won")
  const dribbleAttempts = nested(root, "dribbles", "attempts")
  const dribbleSuccess = nested(root, "dribbles", "success")
  const saves = nested(root, "goals", "saves")
  const conceded = nested(root, "goals", "conceded")
  const ratingValue = numeric(valueAt(games, "rating"))
  const seasonRating = ratingValue === null ? null : clamp(ratingValue * 10)

  const goalRate = per90(goals, minutes)
  const assistRate = per90(assists, minutes)
  const shotRate = per90(shots, minutes)
  const keyPassRate = per90(keyPasses, minutes)
  const tackleRate = per90(tackles, minutes)
  const interceptionRate = per90(interceptions, minutes)
  const dribbleSuccessRate = dribbleAttempts > 0 ? dribbleSuccess / dribbleAttempts : 0
  const duelWinRate = duels > 0 ? duelsWon / duels : 0
  const shotAccuracy = shots > 0 ? shotsOnTarget / shots : 0
  const saveRate = saves + conceded > 0 ? saves / (saves + conceded) : 0

  const ratingLift = seasonRating === null ? 0 : (seasonRating - 68) * 0.28
  const attack = clamp(
    38 + goalRate * 38 + shotRate * 3.3 + assistRate * 22 + shotAccuracy * 7 + ratingLift,
  )
  const creativity = clamp(
    42 + keyPassRate * 8.5 + assistRate * 23 + (passAccuracy ?? 0) * 0.12 +
      dribbleSuccessRate * 10 + ratingLift,
  )
  const defence = clamp(
    36 + tackleRate * 5.5 + interceptionRate * 8 + duelWinRate * 13 + ratingLift,
  )
  const goalkeeper = clamp(
    40 + saveRate * 32 + per90(saves, minutes) * 5 + (seasonRating === null ? 0 : (seasonRating - 68) * 0.35),
  )

  return {
    attack: Math.round(attack * 10) / 10,
    creativity: Math.round(creativity * 10) / 10,
    defence: Math.round(defence * 10) / 10,
    goalkeeper: Math.round(goalkeeper * 10) / 10,
    seasonRating: seasonRating === null ? null : Math.round(seasonRating * 10) / 10,
    appearances,
    minutes,
  }
}

export function deriveLineupFactors(
  starters: LineupPlayer[],
  substitutes: LineupPlayer[],
): TeamLineupFactors {
  const rated = starters.filter((player) => player.scores !== null)
  const ratedStarters = rated.length
  const starterCount = starters.length
  const coverage = starterCount > 0 ? ratedStarters / starterCount : 0

  const weightedAverage = (
    key: "attack" | "creativity" | "defence" | "goalkeeper",
    weights: Record<PlayerPosition, number>,
  ) => {
    let sum = 0
    let weightTotal = 0
    for (const player of rated) {
      const score = player.scores?.[key]
      const weight = weights[player.position]
      if (score === null || score === undefined || weight <= 0) continue
      sum += score * weight
      weightTotal += weight
    }
    return weightTotal > 0 ? sum / weightTotal : 50
  }

  const attackScore = weightedAverage("attack", { GK: 0.05, DF: 0.45, MF: 1, FW: 1.45, UNK: 0.65 })
  const creativityScore = weightedAverage("creativity", { GK: 0.05, DF: 0.5, MF: 1.4, FW: 0.9, UNK: 0.7 })
  const defenceScore = weightedAverage("defence", { GK: 0.4, DF: 1.45, MF: 0.95, FW: 0.35, UNK: 0.7 })
  const keeper = rated.find((player) => player.position === "GK" && player.scores?.goalkeeper !== null)
  const keeperScore = keeper?.scores?.goalkeeper ?? 50
  const defenceComposite = defenceScore * 0.78 + keeperScore * 0.22
  const benchScores = substitutes
    .map((player) => player.scores?.seasonRating ?? null)
    .filter((score): score is number => score !== null)
  const benchStrength = benchScores.length
    ? benchScores.reduce((sum, score) => sum + score, 0) / benchScores.length
    : 50

  // Shrink every player adjustment towards neutral when the provider's season
  // stats do not cover the full starting XI.
  const enoughData = ratedStarters >= 7 && coverage >= 0.6
  const shrink = enoughData ? coverage : 0
  const multiplier = (score: number, divisor: number, min: number, max: number) =>
    Math.min(max, Math.max(min, 1 + ((score - 50) / divisor) * shrink))

  return {
    attackMultiplier: multiplier(attackScore, 280, 0.93, 1.07),
    creativityMultiplier: multiplier(creativityScore, 250, 0.92, 1.08),
    defenceMultiplier: multiplier(defenceComposite, -280, 0.93, 1.07),
    benchStrength: benchStrength,
    ratedStarters,
    starterCount,
    coverage,
    applied: enoughData,
  }
}

export function normaliseLineupPlayer(
  lineupPlayer: unknown,
  playerStats: Map<string, PlayerScores>,
): LineupPlayer | null {
  const item = record(lineupPlayer)
  if (!item) return null

  const player = record(item.player)
  if (!player) return null

  const playerId = numeric(player.id)
  if (playerId === null) return null
  const id = String(playerId)

  if (typeof player.name !== "string") return null
  const name = player.name.trim()
  if (!name) return null

  const number = numeric(player.number)
  const position = positionFrom(player.pos)
  return {
    id,
    name,
    number: number === null ? null : number,
    position,
    grid: typeof player.grid === "string" ? player.grid : null,
    scores: playerStats.get(id) ?? null,
  }
}

export function buildLineupPlayerStats(
  playerResponse: unknown[],
): Map<string, PlayerScores> {
  const result = new Map<string, PlayerScores>()
  for (const item of playerResponse) {
    const row = record(item)
    const player = record(row?.player)
    if (!player) continue
    const playerId = numeric(player.id)
    if (playerId === null) continue
    const id = String(playerId)
    const stats = Array.isArray(row?.statistics) ? row.statistics : []
    const best = [...stats].sort((left, right) => {
      const leftGames = record(valueAt(left, "games"))
      const rightGames = record(valueAt(right, "games"))
      return metric(rightGames, "minutes") - metric(leftGames, "minutes")
    })[0]
    const scores = derivePlayerScores(best)
    if (scores) result.set(id, scores)
  }
  return result
}
