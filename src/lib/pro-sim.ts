import type { Team } from "@/data/football"
import { PRO_SIM_RUNS } from "./pro-sim-config.ts"
import type { TeamPlayerFactors, ProPlayerData } from "./pro-player-data"
import {
  expectedGoals,
  hashSeed,
  mulberry32,
  type MarketProbabilities,
  type Report,
  type Score,
} from "./sim.ts"

export type ProTeam = Pick<Team, "id" | "name" | "attack" | "defense" | "league" | "rateLeague">

const POSSESSIONS_PER_MATCH = 180
const POSSESSIONS_PER_SIDE = POSSESSIONS_PER_MATCH / 2
const BASE_BUILD_UP = 0.88
const BASE_PROGRESSION = 0.68
const BASE_CHANCE_CREATION = 0.19
const BASE_SHOT_RATE = BASE_BUILD_UP * BASE_PROGRESSION * BASE_CHANCE_CREATION
const BASE_EXPECTED_SHOTS = POSSESSIONS_PER_SIDE * BASE_SHOT_RATE

export type ProSimulationDetails = {
  possessionsHome: number
  possessionsAway: number
  possessionHomePct: number
  shotsHome: number
  shotsAway: number
  shotsOnTargetHome: number
  shotsOnTargetAway: number
  buildUpSuccessHomePct: number
  buildUpSuccessAwayPct: number
  progressionSuccessHomePct: number
  progressionSuccessAwayPct: number
  chanceCreationHomePct: number
  chanceCreationAwayPct: number
  simulatedXgHome: number
  simulatedXgAway: number
  playerAdjustmentsApplied: boolean
  homeAttackMultiplier: number
  awayAttackMultiplier: number
  homeDefenceMultiplier: number
  awayDefenceMultiplier: number
}

export type ProReport = Report & {
  engine: "phase-of-play-v1"
  details: ProSimulationDetails
  playerData?: ProPlayerData
}

type PhaseProfile = {
  buildUp: number
  progression: number
  chanceCreation: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function phaseProfile(
  attack: number,
  oppositionDefense: number,
  minute: number,
  trailing: boolean,
  leading: boolean,
  attackMultiplier: number,
  defenceMultiplier: number,
  creativityMultiplier: number,
  squadDepth: number,
): PhaseProfile {
  // Player-derived squad attack, creativity and defensive multipliers modify this phase profile when both squads pass coverage.
  const adjustedAttack = attack * attackMultiplier * Math.sqrt(creativityMultiplier)
  const adjustedDefense = oppositionDefense * defenceMultiplier
  const mismatch = Math.tanh(Math.log((adjustedAttack + 0.35) / (adjustedDefense + 0.35)))
  const fatigue = minute <= 55 ? 1 : 1 - 0.06 * ((minute - 55) / 35)
  const squadRecovery = clamp(1 + (squadDepth - 50) / 2000, 0.97, 1.03)
  const squadDepthRecovery = minute >= 70 ? squadRecovery : 1
  const urgency = minute >= 55 && trailing ? 1.16 : minute >= 55 && leading ? 0.94 : 1

  return {
    buildUp: clamp((BASE_BUILD_UP + mismatch * 0.035) * fatigue * squadDepthRecovery, 0.72, 0.96),
    progression: clamp((BASE_PROGRESSION + mismatch * 0.045) * fatigue * squadDepthRecovery, 0.52, 0.84),
    chanceCreation: clamp((BASE_CHANCE_CREATION + mismatch * 0.03) * urgency, 0.1, 0.3),
  }
}

function marginBin(margin: number): number {
  if (margin <= -4) return 0
  if (margin >= 4) return 8
  return margin + 4
}

function emptyProbabilities(): MarketProbabilities {
  return {
    home: 0,
    draw: 0,
    away: 0,
    btts: 0,
    homeClean: 0,
    awayClean: 0,
    over15: 0,
    under15: 0,
    over25: 0,
    under25: 0,
    over35: 0,
  }
}

/**
 * Pro phase-of-play simulation.
 *
 * Each match is sampled as a sequence of possessions. Possessions move through
 * build-up, progression, chance creation and finishing. Match state and a
 * lightweight fatigue and squad-depth curves alter those phase probabilities.
 *
 * Team-level attack/defence rates provide the stable baseline. When a permitted
 * player feed returns adequately covered registered squads, derived team-level
 * squad factors adjust the expected goals and phase transitions. No matchday
 * starting XI or formation is required.
 */
export function simulatePro(
  home: ProTeam,
  away: ProTeam,
  edge: number,
  roll: number,
  homeSquad?: TeamPlayerFactors,
  awaySquad?: TeamPlayerFactors,
): ProReport {
  const safeEdge = clamp(edge, 0.7, 1.6)
  const neutralFactors: TeamPlayerFactors = {
    attackMultiplier: 1, creativityMultiplier: 1, defenceMultiplier: 1,
    squadDepth: 50, ratedPlayers: 0, squadCount: 0, coverage: 0, applied: false,
  }
  const bothSquadsApplied = Boolean(homeSquad?.applied && awaySquad?.applied)
  const homeFactors = bothSquadsApplied ? homeSquad! : neutralFactors
  const awayFactors = bothSquadsApplied ? awaySquad! : neutralFactors
  const adjustedHome = {
    attack: home.attack * homeFactors.attackMultiplier * Math.sqrt(homeFactors.creativityMultiplier),
    defense: home.defense * homeFactors.defenceMultiplier,
  }
  const adjustedAway = {
    attack: away.attack * awayFactors.attackMultiplier * Math.sqrt(awayFactors.creativityMultiplier),
    defense: away.defense * awayFactors.defenceMultiplier,
  }
  const base = expectedGoals(adjustedHome, adjustedAway, safeEdge)
  const seed = hashSeed(
    `${home.id}|${away.id}|${safeEdge.toFixed(3)}|${roll}|phase-of-play-v1`,
  )
  const rng = mulberry32(seed)

  const relativeStrength = Math.tanh(
    Math.log((adjustedHome.attack + 0.35) / (adjustedAway.defense + 0.35)) -
      Math.log((adjustedAway.attack + 0.35) / (adjustedHome.defense + 0.35)),
  )
  const baseHomePossession = clamp(0.5 + relativeStrength * 0.035 + (safeEdge - 1) * 0.06, 0.39, 0.61)

  const matrix = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0))
  const margins = Array.from({ length: 9 }, () => 0)
  const totals = Array.from({ length: 8 }, () => 0)
  const exact = new Map<string, Score & { n: number }>()
  const scores: Score[] = []
  const probabilities = emptyProbabilities()

  let homeWins = 0
  let draws = 0
  let awayWins = 0
  let btts = 0
  let homeClean = 0
  let awayClean = 0
  let over15 = 0
  let over25 = 0
  let over35 = 0
  let sumHomeGoals = 0
  let sumAwayGoals = 0
  let sumHomeXg = 0
  let sumAwayXg = 0

  let possessionsHome = 0
  let possessionsAway = 0
  let shotsHome = 0
  let shotsAway = 0
  let shotsOnTargetHome = 0
  let shotsOnTargetAway = 0
  let buildUpsHome = 0
  let buildUpsAway = 0
  let progressionsHome = 0
  let progressionsAway = 0
  let chancesHome = 0
  let chancesAway = 0

  for (let run = 0; run < PRO_SIM_RUNS; run++) {
    let homeGoals = 0
    let awayGoals = 0
    let homeXg = 0
    let awayXg = 0

    for (let possession = 0; possession < POSSESSIONS_PER_MATCH; possession++) {
      const minute = 1 + (possession / (POSSESSIONS_PER_MATCH - 1)) * 89
      const homePossessionShare =
        minute >= 55 && awayGoals > homeGoals
          ? clamp(baseHomePossession + 0.035, 0.39, 0.64)
          : minute >= 55 && homeGoals > awayGoals
            ? clamp(baseHomePossession - 0.02, 0.36, 0.61)
            : baseHomePossession
      const isHome = rng() < homePossessionShare
      const attack = isHome ? home : away
      const opposition = isHome ? away : home
      const trailing = isHome ? homeGoals < awayGoals : awayGoals < homeGoals
      const leading = isHome ? homeGoals > awayGoals : awayGoals > homeGoals
      const attackingFactors = isHome ? homeFactors : awayFactors
      const defendingFactors = isHome ? awayFactors : homeFactors
      const phase = phaseProfile(
        attack.attack,
        opposition.defense,
        minute,
        trailing,
        leading,
        attackingFactors.attackMultiplier,
        defendingFactors.defenceMultiplier,
        attackingFactors.creativityMultiplier,
        attackingFactors.squadDepth,
      )

      if (isHome) possessionsHome += 1
      else possessionsAway += 1

      if (rng() >= phase.buildUp) continue
      if (isHome) buildUpsHome += 1
      else buildUpsAway += 1

      if (rng() >= phase.progression) continue
      if (isHome) progressionsHome += 1
      else progressionsAway += 1

      if (rng() >= phase.chanceCreation) continue
      if (isHome) {
        chancesHome += 1
        shotsHome += 1
      } else {
        chancesAway += 1
        shotsAway += 1
      }

      // Shot quality is scaled to the team's pre-match expected-goal baseline.
      // More successful phases create more shots; weaker phases create fewer.
      const targetXg = isHome ? base.homeXg : base.awayXg
      const meanShotXg = targetXg / BASE_EXPECTED_SHOTS
      const shotXg = clamp(meanShotXg * (0.68 + rng() * 0.64), 0.008, 0.62)
      const onTargetChance = clamp(0.3 + shotXg * 1.15, 0.3, 0.78)
      let onTarget = rng() < onTargetChance
      const goal = rng() < shotXg

      if (goal) {
        onTarget = true
        if (isHome) homeGoals += 1
        else awayGoals += 1
      }
      if (onTarget) {
        if (isHome) shotsOnTargetHome += 1
        else shotsOnTargetAway += 1
      }
      if (isHome) homeXg += shotXg
      else awayXg += shotXg
    }

    scores.push({ h: homeGoals, a: awayGoals })
    sumHomeGoals += homeGoals
    sumAwayGoals += awayGoals
    sumHomeXg += homeXg
    sumAwayXg += awayXg
    matrix[Math.min(5, homeGoals)][Math.min(5, awayGoals)] += 1
    margins[marginBin(homeGoals - awayGoals)] += 1
    totals[Math.min(7, homeGoals + awayGoals)] += 1

    if (homeGoals > awayGoals) homeWins += 1
    else if (homeGoals === awayGoals) draws += 1
    else awayWins += 1
    if (homeGoals > 0 && awayGoals > 0) btts += 1
    if (awayGoals === 0) homeClean += 1
    if (homeGoals === 0) awayClean += 1
    if (homeGoals + awayGoals >= 2) over15 += 1
    if (homeGoals + awayGoals >= 3) over25 += 1
    if (homeGoals + awayGoals >= 4) over35 += 1

    const scoreKey = `${homeGoals}-${awayGoals}`
    const previous = exact.get(scoreKey)
    if (previous) previous.n += 1
    else exact.set(scoreKey, { h: homeGoals, a: awayGoals, n: 1 })
  }

  const ranked = [...exact.values()].sort((left, right) => right.n - left.n || right.h - left.h)
  const mode = ranked[0] ?? { h: 0, a: 0, n: 0 }
  const runs = PRO_SIM_RUNS
  const average = (value: number) => value / runs

  probabilities.home = average(homeWins)
  probabilities.draw = average(draws)
  probabilities.away = average(awayWins)
  probabilities.btts = average(btts)
  probabilities.homeClean = average(homeClean)
  probabilities.awayClean = average(awayClean)
  probabilities.over15 = average(over15)
  probabilities.under15 = 1 - probabilities.over15
  probabilities.over25 = average(over25)
  probabilities.under25 = 1 - probabilities.over25
  probabilities.over35 = average(over35)

  const totalPossessions = possessionsHome + possessionsAway
  const details: ProSimulationDetails = {
    possessionsHome: average(possessionsHome),
    possessionsAway: average(possessionsAway),
    possessionHomePct: totalPossessions > 0 ? (possessionsHome / totalPossessions) * 100 : 50,
    shotsHome: average(shotsHome),
    shotsAway: average(shotsAway),
    shotsOnTargetHome: average(shotsOnTargetHome),
    shotsOnTargetAway: average(shotsOnTargetAway),
    buildUpSuccessHomePct: possessionsHome > 0 ? (buildUpsHome / possessionsHome) * 100 : 0,
    buildUpSuccessAwayPct: possessionsAway > 0 ? (buildUpsAway / possessionsAway) * 100 : 0,
    progressionSuccessHomePct: buildUpsHome > 0 ? (progressionsHome / buildUpsHome) * 100 : 0,
    progressionSuccessAwayPct: buildUpsAway > 0 ? (progressionsAway / buildUpsAway) * 100 : 0,
    chanceCreationHomePct: progressionsHome > 0 ? (chancesHome / progressionsHome) * 100 : 0,
    chanceCreationAwayPct: progressionsAway > 0 ? (chancesAway / progressionsAway) * 100 : 0,
    simulatedXgHome: average(sumHomeXg),
    simulatedXgAway: average(sumAwayXg),
    playerAdjustmentsApplied: homeFactors.applied && awayFactors.applied,
    homeAttackMultiplier: homeFactors.attackMultiplier,
    awayAttackMultiplier: awayFactors.attackMultiplier,
    homeDefenceMultiplier: homeFactors.defenceMultiplier,
    awayDefenceMultiplier: awayFactors.defenceMultiplier,
  }

  return {
    n: runs,
    probabilities,
    homeXg: details.simulatedXgHome,
    awayXg: details.simulatedXgAway,
    homeWins,
    draws,
    awayWins,
    btts,
    homeClean,
    awayClean,
    over25,
    meanHome: average(sumHomeGoals),
    meanAway: average(sumAwayGoals),
    mode,
    top: ranked.slice(0, 5),
    matrix,
    margins,
    totals,
    scores,
    engine: "phase-of-play-v1",
    details,
  }
}
