import assert from "node:assert/strict"
import test from "node:test"
import { hasEligibleProPickSquadData } from "./pro-pick-eligibility.ts"
import type { ProPlayerData, ProTeamSquad } from "./pro-player-data.ts"
import {
  deriveEaPlayerScores,
  deriveSquadFactors,
  matchEaPlayerByName,
  normaliseEaSquadPlayer,
  normalisePlayerName,
  playerNameShardId,
  positionFrom,
  teamNameKey,
} from "./pro-player-model.ts"

const strongOutfield = {
  id: "1001",
  name: "Example Forward",
  overall: 88,
  position: "ST",
  stats: {
    pac: { value: 90 },
    sho: { value: 88 },
    pas: { value: 78 },
    dri: { value: 86 },
    def: { value: 42 },
    phy: { value: 80 },
    acceleration: { value: 91 },
    sprintSpeed: { value: 89 },
    finishing: { value: 90 },
    shotPower: { value: 87 },
    longShots: { value: 82 },
    volleys: { value: 84 },
    positioning: { value: 91 },
    vision: { value: 76 },
    shortPassing: { value: 79 },
    longPassing: { value: 72 },
    ballControl: { value: 88 },
    defensiveAwareness: { value: 40 },
    standingTackle: { value: 35 },
    slidingTackle: { value: 30 },
    interceptions: { value: 38 },
    strength: { value: 78 },
    aggression: { value: 70 },
  },
}

const strongGoalkeeper = {
  id: "1002",
  name: "Example Goalkeeper",
  overall: 86,
  position: "GK",
  stats: {
    gkDiving: { value: 88 },
    gkHandling: { value: 84 },
    gkKicking: { value: 78 },
    gkPositioning: { value: 87 },
    gkReflexes: { value: 90 },
    reactions: { value: 85 },
  },
}

test("EA base ratings derive attacking and creative scores from detailed attributes", () => {
  const score = deriveEaPlayerScores(strongOutfield)
  assert.ok(score)
  assert.equal(score.seasonRating, 88)
  assert.equal(score.appearances, 0)
  assert.equal(score.minutes, 0)
  assert.ok((score.attack ?? 0) > 80)
  assert.ok((score.creativity ?? 0) > 70)
  assert.ok((score.defence ?? 0) < 60)
})

test("goalkeepers use EA's dedicated goalkeeper attributes", () => {
  const score = deriveEaPlayerScores(strongGoalkeeper)
  assert.ok(score)
  assert.ok((score.goalkeeper ?? 0) >= 85)
  assert.equal(positionFrom("GK"), "GK")
  assert.equal(positionFrom("CB"), "DF")
  assert.equal(positionFrom("CDM"), "MF")
  assert.equal(positionFrom("RW"), "FW")
})

test("EA face attributes and overall provide a safe fallback when detailed stats are absent", () => {
  const score = deriveEaPlayerScores({
    overall: 77,
    position: "CM",
    stats: {
      pac: { value: 70 },
      sho: { value: 72 },
      pas: { value: 80 },
      dri: { value: 78 },
      def: { value: 65 },
      phy: { value: 68 },
    },
  })
  assert.ok(score)
  assert.ok((score.attack ?? 0) > 0)
  assert.ok((score.creativity ?? 0) > (score.attack ?? 0))
  assert.equal(score.seasonRating, 77)
})

test("ESPN roster names match EA identities through strict normalized name keys", () => {
  const candidate = {
    id: "ea-1001",
    name: "Kylian Mbappe",
    nameKeys: ["kylian mbappe", "mbappe"],
    nationality: "France",
    position: "ST",
    overall: 91,
    stats: {},
  }
  const match = matchEaPlayerByName({
    nameCandidates: ["Kylian Mbappé", "K. Mbappé"],
    position: "ST",
    nationality: "France",
  }, [candidate])
  assert.equal(match?.id, "ea-1001")
  assert.equal(normalisePlayerName("Kylian Mbappé"), "kylian mbappe")
  assert.equal(playerNameShardId("Kylian Mbappé"), "kyli")
  assert.equal(playerNameShardId("Mason Mount"), "maso")
  assert.equal(playerNameShardId("é"), "e___")
  assert.equal(playerNameShardId(""), "____")
})

test("ambiguous same-name EA records are not guessed", () => {
  const candidates = [
    { id: "1", nameKeys: ["alex smith"], position: "ST", nationality: "England" },
    { id: "2", nameKeys: ["alex smith"], position: "ST", nationality: "Scotland" },
  ]
  assert.equal(matchEaPlayerByName({
    nameCandidates: ["Alex Smith"],
    position: "ST",
  }, candidates), null)
})

test("position and nationality safely disambiguate duplicate player names", () => {
  const candidates = [
    { id: "1", nameKeys: ["alex smith"], position: "ST", nationality: "England" },
    { id: "2", nameKeys: ["alex smith"], position: "CB", nationality: "England" },
  ]
  const match = matchEaPlayerByName({
    nameCandidates: ["Alex Smith"],
    position: "CB",
    nationality: "England",
  }, candidates)
  assert.equal(match?.id, "2")
})

test("EA player records normalize to the shared squad shape", () => {
  const player = normaliseEaSquadPlayer(strongOutfield)
  assert.equal(player?.id, "1001")
  assert.equal(player?.name, "Example Forward")
  assert.equal(player?.position, "FW")
  assert.equal(player?.scores?.seasonRating, 88)
  assert.equal(normaliseEaSquadPlayer(null), null)
  assert.equal(normaliseEaSquadPlayer({ name: "Missing ID" }), null)
})

test("club key normalization is accent and punctuation insensitive", () => {
  assert.equal(teamNameKey("Racing de Santander"), "racing-de-santander")
  assert.equal(teamNameKey("Atlético Madrid"), "atletico-madrid")
  assert.equal(teamNameKey("Paris Saint-Germain"), "paris-saint-germain")
})

test("EA club ratings apply only when both teams have sufficient database coverage", () => {
  const squad = Array.from({ length: 22 }, (_, index) => {
    const record = index === 0
      ? { ...strongGoalkeeper, id: "gk-" + index }
      : {
          ...strongOutfield,
          id: "player-" + index,
          name: "Player " + index,
          position: index < 7 ? "CB" : index < 15 ? "CM" : "ST",
          overall: 84 - index,
        }
    return normaliseEaSquadPlayer(record)!
  })
  const derived = deriveSquadFactors(squad)
  assert.equal(derived.factors.squadCount, 22)
  assert.equal(derived.factors.ratedPlayers, 22)
  assert.equal(derived.factors.coverage, 1)
  assert.equal(derived.factors.applied, true)
  assert.ok(derived.attackIndex > 50)
  assert.ok(derived.creativityIndex > 50)
  assert.ok(derived.defenceIndex > 50)
  assert.ok(derived.factors.squadDepth > 0)
  assert.ok(derived.factors.attackMultiplier >= 0.93 && derived.factors.attackMultiplier <= 1.07)
  assert.ok(derived.factors.creativityMultiplier >= 0.92 && derived.factors.creativityMultiplier <= 1.08)
  assert.ok(derived.factors.defenceMultiplier >= 0.93 && derived.factors.defenceMultiplier <= 1.07)
})

test("incomplete EA coverage leaves the squad neutral", () => {
  const squad = Array.from({ length: 24 }, (_, index) => {
    if (index >= 8) {
      return {
        id: String(index),
        name: "Unrated " + index,
        number: null,
        position: "UNK" as const,
        scores: null,
      }
    }
    return normaliseEaSquadPlayer({
      ...strongOutfield,
      id: String(index),
      name: "Rated " + index,
    })!
  })
  const derived = deriveSquadFactors(squad)
  assert.equal(derived.factors.applied, false)
  assert.equal(derived.factors.coverage, 8 / 24)
  assert.equal(derived.factors.attackMultiplier, 1)
  assert.equal(derived.factors.creativityMultiplier, 1)
  assert.equal(derived.factors.defenceMultiplier, 1)
})


function eligibleTestSquad(teamName: string, ratedPlayers = 18, squadCount = 22): ProTeamSquad {
  return {
    teamName,
    squadCount,
    ratedPlayerCount: ratedPlayers,
    attackIndex: 70,
    creativityIndex: 68,
    defenceIndex: 66,
    factors: {
      attackMultiplier: 1.02,
      creativityMultiplier: 1.02,
      defenceMultiplier: 0.99,
      squadDepth: 60,
      ratedPlayers,
      squadCount,
      coverage: squadCount > 0 ? ratedPlayers / squadCount : 0,
      applied: ratedPlayers >= 12 && squadCount >= 12 && ratedPlayers / squadCount >= 0.6,
    },
    topPlayers: [],
    dataUpdatedAt: null,
  }
}

function eligibleTestData(home = eligibleTestSquad("Home"), away = eligibleTestSquad("Away")): ProPlayerData {
  return {
    provider: "EA SPORTS FC 27",
    status: "available",
    note: "",
    home,
    away,
    adjustmentsApplied: Boolean(home.factors.applied && away.factors.applied),
  }
}

test("Pro Best Picks require sufficient rated squad data for both teams", () => {
  assert.equal(hasEligibleProPickSquadData(eligibleTestData()), true)
  assert.equal(
    hasEligibleProPickSquadData(eligibleTestData(eligibleTestSquad("Home"), eligibleTestSquad("Away", 8, 22))),
    false,
  )
  assert.equal(
    hasEligibleProPickSquadData(eligibleTestData(eligibleTestSquad("Home", 11, 22), eligibleTestSquad("Away"))),
    false,
  )
})

test("Pro Best Picks exclude unavailable, partial and one-sided squad data", () => {
  const valid = eligibleTestData()
  assert.equal(hasEligibleProPickSquadData({ ...valid, status: "partial", adjustmentsApplied: false }), false)
  assert.equal(hasEligibleProPickSquadData({ ...valid, status: "roster_unavailable", adjustmentsApplied: false }), false)
  assert.equal(hasEligibleProPickSquadData({ ...valid, away: null }), false)
})
