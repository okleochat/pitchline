import type {
  PlayerPosition,
  PlayerScores,
  SquadPlayer,
  TeamPlayerFactors,
} from "./pro-player-data.ts"

type Dict = Record<string, unknown>

export type DerivedSquadStrength = {
  attackIndex: number
  creativityIndex: number
  defenceIndex: number
  factors: TeamPlayerFactors
}

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

/**
 * API-Football's /players/squads endpoint returns current squad players
 * directly as a current registered-squad player record.
 */
export function normaliseSquadPlayer(
  squadEntry: unknown,
  playerStats: Map<string, PlayerScores>,
): SquadPlayer | null {
  const item = record(squadEntry)
  if (!item) return null
  const player = record(item.player) ?? item
  const playerId = numeric(player.id)
  if (playerId === null) return null
  const id = String(playerId)
  if (typeof player.name !== "string" || !player.name.trim()) return null

  return {
    id,
    name: player.name.trim(),
    number: numeric(player.number),
    position: positionFrom(player.position ?? player.pos),
    scores: playerStats.get(id) ?? null,
  }
}

/** Build a lookup of player-season scores keyed by API-Football player ID. */
export function buildPlayerSeasonStats(
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
    const statistics = Array.isArray(row?.statistics) ? row.statistics : []
    const best = [...statistics].sort((left, right) => {
      const leftGames = record(valueAt(left, "games"))
      const rightGames = record(valueAt(right, "games"))
      return metric(rightGames, "minutes") - metric(leftGames, "minutes")
    })[0]
    const scores = derivePlayerScores(best)
    if (!scores) continue

    const previous = result.get(id)
    if (!previous || scores.minutes > previous.minutes) result.set(id, scores)
  }
  return result
}

function involvementWeight(player: SquadPlayer): number {
  const minutes = player.scores?.minutes ?? 0
  // Diminishing returns prevent one high-minute player from dominating the
  // team index while still giving regular contributors more influence.
  return 0.25 + Math.min(1.25, Math.sqrt(minutes / 1800))
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
    const weight = roleWeight * involvementWeight(player)
    total += score * weight
    weightTotal += weight
  }
  return weightTotal > 0 ? total / weightTotal : 50
}

/**
 * Estimate team strength from the whole current squad, not a predicted
 * formation or a matchday XI. Playing time weights contributors, positions
 * distinguish player responsibilities, and low-usage players inform squad
 * depth. Adjustments shrink towards neutral when squad-stat coverage is thin.
 */
export function deriveSquadFactors(players: SquadPlayer[]): DerivedSquadStrength {
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

  const usageRanked = [...rated].sort(
    (left, right) => (right.scores?.minutes ?? 0) - (left.scores?.minutes ?? 0),
  )
  const depthPool = usageRanked.length >= 6
    ? usageRanked.slice(Math.floor(usageRanked.length / 2))
    : usageRanked
  const depthScores = depthPool.map((player) =>
    player.scores?.seasonRating ??
      ((player.scores?.attack ?? 50) + (player.scores?.creativity ?? 50) + (player.scores?.defence ?? 50)) / 3,
  )
  const squadDepth = depthScores.length
    ? depthScores.reduce((sum, score) => sum + score, 0) / depthScores.length
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
