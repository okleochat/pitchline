import type { LeagueId } from "@/data/football"

export type PlayerPosition = "GK" | "DF" | "MF" | "FW" | "UNK"

export type PlayerScores = {
  attack: number | null
  creativity: number | null
  defence: number | null
  goalkeeper: number | null
  seasonRating: number | null
  appearances: number
  minutes: number
}

export type LineupPlayer = {
  id: string
  name: string
  number: number | null
  position: PlayerPosition
  grid: string | null
  scores: PlayerScores | null
}

export type TeamLineupFactors = {
  attackMultiplier: number
  creativityMultiplier: number
  defenceMultiplier: number
  benchStrength: number
  ratedStarters: number
  starterCount: number
  coverage: number
  applied: boolean
}

export type ProTeamLineup = {
  /** The Pitchline team label, not the provider's raw team record. */
  teamName: string
  startingCount: number
  ratedStartingCount: number
  substituteCount: number
  ratedSubstituteCount: number
  attackIndex: number
  creativityIndex: number
  defenceIndex: number
  factors: TeamLineupFactors
}

export type PlayerDataStatus =
  | "available"
  | "partial"
  | "not_configured"
  | "not_licensed"
  | "fixture_not_selected"
  | "team_not_found"
  | "match_not_found"
  | "lineups_not_available"
  | "provider_error"

export type ProPlayerData = {
  provider: "API-Football"
  status: PlayerDataStatus
  note: string
  home: ProTeamLineup | null
  away: ProTeamLineup | null
  adjustmentsApplied: boolean
}

export type ProPlayerFixtureRequest = {
  kickoffAt: string
  competitionName?: string
}

export type PlayerTeamContext = {
  id: string
  name: string
  league: LeagueId
  rateLeague?: LeagueId
}
