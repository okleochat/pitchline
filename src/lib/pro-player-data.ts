import type { LeagueId } from "@/data/football"

export type PlayerPosition = "GK" | "DF" | "MF" | "FW" | "UNK"

export type PlayerScores = {
  /** EA attribute-derived attacking contribution, 0–100. */
  attack: number | null
  /** EA attribute-derived creativity contribution, 0–100. */
  creativity: number | null
  /** EA attribute-derived defending contribution, 0–100. */
  defence: number | null
  /** EA goalkeeper-attribute score, 0–100. */
  goalkeeper: number | null
  /** EA base overall rating; not a live-form or match-performance rating. */
  seasonRating: number | null
  /** EA ratings do not provide real-world appearances or minutes. */
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
  /** Average base rating of the lower-rated half of the club's EA player pool. */
  squadDepth: number
  ratedPlayers: number
  squadCount: number
  coverage: number
  applied: boolean
}

export type ProSquadTopPlayer = {
  id: string
  name: string
  position: PlayerPosition
  overall: number
}

export type ProTeamSquad = {
  /** Pitchline's team label, not the EA database's raw club label. */
  teamName: string
  squadCount: number
  ratedPlayerCount: number
  attackIndex: number
  creativityIndex: number
  defenceIndex: number
  factors: TeamPlayerFactors
  topPlayers: ProSquadTopPlayer[]
  dataUpdatedAt: string | null
}

export type PlayerDataStatus =
  | "available"
  | "partial"
  | "team_not_found"
  | "provider_error"

export type ProPlayerData = {
  provider: "EA SPORTS FC 27"
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
  espnId?: string
  feedSlug?: string
}
