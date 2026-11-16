import "server-only"

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { deriveSquadFactors, normaliseEaSquadPlayer, teamNameKey } from "@/lib/pro-player-model"
import type {
  PlayerTeamContext,
  ProPlayerData,
  ProSquadTopPlayer,
  ProTeamSquad,
  SquadPlayer,
} from "@/lib/pro-player-data"

type Dict = Record<string, unknown>

type CachedTeam = {
  expiresAt: number
  value: ProTeamSquad | null
}

const TEAM_CACHE_MS = 6 * 60 * 60 * 1000
const teamCache = new Map<string, CachedTeam>()

// Team names in ESPN/Pitchline and EA's ratings page are not always identical.
// Alias values are the EA club labels used by the private Firestore sync.
const TEAM_ALIASES: Record<string, string[]> = {
  "racing santander": ["racing de santander"],
  "athletic bilbao": ["athletic club"],
  "athletic club": ["athletic bilbao"],
  "atletico madrid": ["atletico de madrid"],
  "paris saint germain": ["paris saint-germain", "paris sg"],
  "psg": ["paris saint-germain", "paris saint germain"],
  "inter": ["internazionale", "fc internazionale milano", "inter milan"],
  "inter milan": ["inter", "fc internazionale milano"],
  "milan": ["ac milan"],
  "manchester united": ["manchester utd", "man utd"],
  "man utd": ["manchester united", "manchester utd"],
  "manchester city": ["man city"],
  "man city": ["manchester city"],
  "tottenham": ["tottenham hotspur"],
  "wolves": ["wolverhampton wanderers"],
  "qpr": ["queens park rangers"],
  "west brom": ["west bromwich albion"],
  "newcastle": ["newcastle united"],
  "brighton": ["brighton and hove albion"],
  "nottm forest": ["nottingham forest"],
  "monchengladbach": ["borussia monchengladbach"],
  "gladbach": ["borussia monchengladbach"],
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function teamDocumentCandidates(name: string): string[] {
  const key = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  const names = [name, ...(TEAM_ALIASES[key] ?? [])]
  return [...new Set(names.map(teamNameKey).filter(Boolean))]
}

function buildTeamSquad(
  context: PlayerTeamContext,
  document: Dict,
): ProTeamSquad | null {
  const rawPlayers = Array.isArray(document.players) ? document.players : []
  const players = rawPlayers
    .map(normaliseEaSquadPlayer)
    .filter((player): player is SquadPlayer => player !== null)
  if (!players.length) return null

  const derived = deriveSquadFactors(players)
  const topPlayers: ProSquadTopPlayer[] = players
    .map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      overall: player.scores?.seasonRating ?? 0,
    }))
    .filter((player) => player.overall > 0)
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 3)

  return {
    teamName: context.name,
    squadCount: players.length,
    ratedPlayerCount: derived.factors.ratedPlayers,
    attackIndex: derived.attackIndex,
    creativityIndex: derived.creativityIndex,
    defenceIndex: derived.defenceIndex,
    factors: derived.factors,
    topPlayers,
    dataUpdatedAt: stringValue(document.syncedAt),
  }
}

async function loadTeam(context: PlayerTeamContext): Promise<ProTeamSquad | null> {
  const candidates = teamDocumentCandidates(context.name)
  for (const documentId of candidates) {
    const cached = teamCache.get(documentId)
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.value) return { ...cached.value, teamName: context.name }
      continue
    }

    const snapshot = await getFirebaseAdminFirestore()
      .collection("ea_fc27_teams")
      .doc(documentId)
      .get()
    if (!snapshot.exists) {
      teamCache.set(documentId, { expiresAt: Date.now() + TEAM_CACHE_MS, value: null })
      continue
    }

    const data = record(snapshot.data())
    if (!data || data.database !== "EA SPORTS FC 27") {
      teamCache.set(documentId, { expiresAt: Date.now() + TEAM_CACHE_MS, value: null })
      continue
    }

    const squad = buildTeamSquad(context, data)
    teamCache.set(documentId, { expiresAt: Date.now() + TEAM_CACHE_MS, value: squad })
    if (squad) return squad
  }
  return null
}

function result(
  status: ProPlayerData["status"],
  note: string,
  home: ProTeamSquad | null = null,
  away: ProTeamSquad | null = null,
): ProPlayerData {
  const adjustmentsApplied = Boolean(home?.factors.applied && away?.factors.applied)
  return {
    provider: "EA SPORTS FC 27",
    status,
    note,
    home,
    away,
    adjustmentsApplied,
  }
}

/**
 * EA base ratings supply the player-quality layer. ESPN remains Pitchline's
 * fixture/team context source; no SportAPI, live player match logs, or
 * fabricated appearances/minutes are used here.
 */
export async function getProPlayerData(input: {
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  try {
    const [home, away] = await Promise.all([
      loadTeam(input.home),
      loadTeam(input.away),
    ])

    if (!home || !away) {
      const missing = [
        ...(!home ? [input.home.name] : []),
        ...(!away ? [input.away.name] : []),
      ]
      return result(
        "team_not_found",
        "EA FC 27 ratings are not loaded for " + missing.join(" and ") +
          ". The Pro simulator will use its normal team-level inputs for this fixture.",
        home,
        away,
      )
    }

    const updatedAt = [home.dataUpdatedAt, away.dataUpdatedAt].filter(Boolean)
    const updateText = updatedAt.length
      ? " Dataset sync: " + [...new Set(updatedAt)].join(", ") + "."
      : ""
    if (home.factors.applied && away.factors.applied) {
      return result(
        "available",
        "EA FC 27 base player attributes are incorporated into both club-strength profiles. These are player-quality ratings, not live form, confirmed lineups, or injury information." + updateText,
        home,
        away,
      )
    }

    return result(
      "partial",
      "EA FC 27 player records were found, but at least one club has fewer than 12 rated players or less than 60% database coverage. To avoid one-sided adjustments, both teams remain neutral." + updateText,
      home,
      away,
    )
  } catch (error) {
    console.error("[Pitchline EA FC] Player ratings lookup failed", {
      message: error instanceof Error ? error.message : "unknown error",
    })
    return result(
      "provider_error",
      "EA FC 27 player ratings could not be read from Pitchline's private ratings database. The Pro simulator will continue with team-level inputs.",
    )
  }
}
