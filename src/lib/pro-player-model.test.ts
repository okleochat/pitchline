import assert from "node:assert/strict"
import test from "node:test"
import {
  buildPlayerSeasonStats,
  deriveEspnPlayerScores,
  derivePlayerScores,
  deriveSportApiPlayerScores,
  deriveSquadFactors,
  normaliseSquadPlayer,
} from "./pro-player-model.ts"

const attackerStats = {
  games: { appearences: 24, minutes: 1850, rating: "7.42" },
  goals: { total: 14, assists: 5 },
  shots: { total: 58, on: 31 },
  passes: { total: 410, key: 32, accuracy: "82" },
  tackles: { total: 12, interceptions: 4 },
  duels: { total: 90, won: 47 },
  dribbles: { attempts: 35, success: 19 },
}

const strongScores = {
  attack: 85,
  creativity: 82,
  defence: 80,
  goalkeeper: 80,
  seasonRating: 82,
  appearances: 25,
  minutes: 2000,
}

test("player scores are derived from provider performance statistics", () => {
  const score = derivePlayerScores(attackerStats)
  assert.ok(score)
  assert.ok(score.attack !== null)
  assert.ok(score.creativity !== null)
  assert.ok(score.attack > 50)
  assert.ok(score.creativity > 50)
  assert.equal(score.appearances, 24)
  assert.equal(score.seasonRating, 74.2)
})

test("registered squad players join season statistics by provider player ID", () => {
  const stats = buildPlayerSeasonStats([{
    player: { id: 9, name: "Example Striker" },
    statistics: [attackerStats],
  }])
  const player = normaliseSquadPlayer({
    id: 9,
    name: "Example Striker",
    number: 9,
    position: "Attacker",
  }, stats)
  assert.equal(player?.position, "FW")
  assert.equal(player?.scores?.appearances, 24)
})

test("ESPN soccer category statistics are normalized into player-season scores", () => {
  const payload = {
    categories: [
      {
        name: "offensive",
        stats: [
          { name: "appearances", value: 24 },
          { name: "minutes", value: 1850 },
          { name: "rating", value: 7.42 },
          { name: "goals", value: 14 },
          { name: "assists", value: 5 },
          { name: "shots", value: 58 },
          { name: "shotsOnTarget", value: 31 },
          { name: "keyPasses", value: 32 },
        ],
      },
      {
        name: "defensive",
        stats: [
          { name: "tackles", value: 12 },
          { name: "interceptions", value: 4 },
          { name: "duels", value: 90 },
          { name: "duelsWon", value: 47 },
        ],
      },
    ],
  }
  const scores = deriveEspnPlayerScores(payload)
  assert.ok(scores)
  assert.equal(scores.appearances, 24)
  assert.equal(scores.minutes, 1850)
  assert.equal(scores.seasonRating, 74.2)
  assert.ok((scores.attack ?? 0) > 50)
  assert.ok((scores.creativity ?? 0) > 50)
  assert.ok((scores.defence ?? 0) > 40)
})

test("SportAPI per-match rows are aggregated into the selected current season only", () => {
  const scores = deriveSportApiPlayerScores({
    success: true,
    totals: {
      appearances: 46,
      goals: 12,
      assists: 6,
      mins_played: 2775,
    },
    matches: [
      {
        date: "2026-09-12",
        mins_played: 90,
        goals: 1,
        assists: 0,
        shots_total: 4,
        tackles: 2,
        saves: 0,
      },
      {
        date: "2026-10-04",
        mins_played: 75,
        goals: 0,
        assists: 1,
        shots_total: 2,
        tackles: 1,
        saves: 0,
      },
      {
        date: "2026-05-10",
        mins_played: 90,
        goals: 3,
        assists: 0,
        shots_total: 8,
        tackles: 0,
        saves: 0,
      },
    ],
  }, "2026-08-01", "2027-07-31")

  assert.ok(scores)
  assert.equal(scores.appearances, 2)
  assert.equal(scores.minutes, 165)
  // The May row and the provider's career totals must not leak into season form.
  assert.ok((scores.attack ?? 0) < 70)
  assert.equal(scores.seasonRating, null)
})

test("SportAPI returns no player rating when it provides no dated match rows for the season", () => {
  assert.equal(deriveSportApiPlayerScores({
    totals: { appearances: 40, goals: 10, mins_played: 2000 },
    matches: [{ date: "2025-05-10", mins_played: 90, goals: 1 }],
  }, "2026-08-01", "2027-07-31"), null)
})

test("SportAPI squad field names normalize to the shared player model", () => {
  const stats = new Map([["4904", strongScores]])
  const player = normaliseSquadPlayer({
    id: 4904,
    full_name: "David Raya",
    position: "Goalkeeper",
    jersey_number: 1,
  }, stats)
  assert.equal(player?.id, "4904")
  assert.equal(player?.name, "David Raya")
  assert.equal(player?.number, 1)
  assert.equal(player?.position, "GK")
  assert.equal(player?.scores?.appearances, 25)
})

test("ESPN roster athlete records join season scores by athlete ID", () => {
  const stats = new Map([["123", strongScores]])
  const player = normaliseSquadPlayer({
    athlete: {
      id: "123",
      fullName: "Example Striker",
      jersey: "9",
      position: { abbreviation: "F", name: "Forward" },
    },
  }, stats)
  assert.equal(player?.id, "123")
  assert.equal(player?.name, "Example Striker")
  assert.equal(player?.number, 9)
  assert.equal(player?.position, "FW")
  assert.equal(player?.scores?.appearances, 25)
})

test("ESPN rows without a usable performance measure are not rated", () => {
  assert.equal(deriveEspnPlayerScores({
    categories: [{ stats: [
      { name: "appearances", value: 10 },
      { name: "minutes", value: 400 },
    ] }],
  }), null)
})

test("the whole registered squad remains neutral when performance coverage is too low", () => {
  const players = Array.from({ length: 24 }, (_, index) => ({
    id: String(index + 1),
    name: "Squad player " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : index < 9 ? "DF" as const : index < 17 ? "MF" as const : "FW" as const,
    scores: index < 6 ? strongScores : null,
  }))
  const result = deriveSquadFactors(players)
  assert.equal(result.factors.applied, false)
  assert.equal(result.factors.squadCount, 24)
  assert.equal(result.factors.ratedPlayers, 6)
  assert.equal(result.factors.attackMultiplier, 1)
  assert.equal(result.factors.creativityMultiplier, 1)
  assert.equal(result.factors.defenceMultiplier, 1)
})

test("well-covered squad statistics produce bounded non-neutral team factors", () => {
  const players = Array.from({ length: 24 }, (_, index) => ({
    id: String(index + 1),
    name: "Squad player " + index,
    number: index + 1,
    position: index === 0 ? "GK" as const : index < 8 ? "DF" as const : index < 17 ? "MF" as const : "FW" as const,
    scores: index < 18 ? {
      ...strongScores,
      minutes: 2200 - index * 65,
      seasonRating: 82 - index * 0.2,
    } : null,
  }))
  const result = deriveSquadFactors(players)
  assert.equal(result.factors.applied, true)
  assert.equal(result.factors.ratedPlayers, 18)
  assert.equal(result.factors.squadCount, 24)
  assert.ok(result.attackIndex > 50)
  assert.ok(result.creativityIndex > 50)
  assert.ok(result.defenceIndex > 50)
  assert.ok(result.factors.attackMultiplier > 1 && result.factors.attackMultiplier <= 1.07)
  assert.ok(result.factors.creativityMultiplier > 1 && result.factors.creativityMultiplier <= 1.08)
  assert.ok(result.factors.defenceMultiplier < 1 && result.factors.defenceMultiplier >= 0.93)
  assert.ok(result.factors.squadDepth > 0 && result.factors.squadDepth <= 100)
})

test("missing or invalid squad player records are ignored safely", () => {
  assert.equal(normaliseSquadPlayer(null, new Map()), null)
  assert.equal(normaliseSquadPlayer({ name: "No ID" }, new Map()), null)
  assert.equal(normaliseSquadPlayer({ id: 1, name: "  " }, new Map()), null)
})
