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

export type SquadPlayer = {
  id: string
  name: string
  number: number | null
  position: PlayerPosition
  scores: PlayerScores | null
}

export type TeamPlayerFactors = {
  attackMultiplier: number
  creativityMultiplier: number
  defenceMultiplier: number
  /** Index for the lower-usage portion of the registered squad. */
  squadDepth: number
  ratedPlayers: number
  squadCount: number
  coverage: number
  applied: boolean
}

export type ProTeamSquad = {
  /** Pitchline's team label, not the provider's raw team record. */
  teamName: string
  squadCount: number
  ratedPlayerCount: number
  attackIndex: number
  creativityIndex: number
  defenceIndex: number
  factors: TeamPlayerFactors
}

export type PlayerDataStatus =
  | "available"
  | "partial"
  | "not_configured"
  | "not_licensed"
  | "team_not_found"
  | "squad_not_available"
  | "provider_error"

export type ProPlayerData = {
  provider: "API-Football"
  status: PlayerDataStatus
  note: string
  home: ProTeamSquad | null
  away: ProTeamSquad | null
  adjustmentsApplied: boolean
}

export type PlayerTeamContext = {
  id: string
  name: string
  league: LeagueId
  rateLeague?: LeagueId
}
