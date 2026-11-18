import "server-only"

import type { LeagueId } from "@/data/football"
import { getEspnJsonQuick } from "@/lib/espn/transport.server"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { normalizeEspnRoster } from "@/lib/providers/espn-roster"
import {
  deriveSquadFactors,
  matchEaPlayerByName,
  normaliseEaSquadPlayer,
  playerNameShardId,
  positionFrom,
} from "@/lib/pro-player-model"
import type {
  PlayerTeamContext,
  ProPlayerData,
  ProSquadTopPlayer,
  ProTeamSquad,
  SquadPlayer,
} from "@/lib/pro-player-data"

type Dict = Record<string, unknown>
type CacheEntry = { expiresAt: number; value: unknown }

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const ROSTER_CACHE_MS = 12 * 60 * 60 * 1000
const EA_SHARD_CACHE_MS = 12 * 60 * 60 * 1000
const SQUAD_SNAPSHOT_CACHE_MS = 12 * 60 * 60 * 1000
const EMPTY_CACHE_MS = 15 * 60 * 1000
const memoryCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()
const eaShardCache = new Map<string, CacheEntry>()
const eaShardInFlight = new Map<string, Promise<EaShardDocument | null>>()
const squadSnapshotCache = new Map<string, CacheEntry>()
const squadSnapshotInFlight = new Map<string, Promise<ProTeamSquad | null>>()
const EA_COLLECTION_CACHE_MS = 5 * 60 * 1000
const LEGACY_EA_SHARD_COLLECTION = "ea_fc27_player_shards"
let eaCollectionNameCache: { name: string; expiresAt: number } | null = null
let lastKnownActiveEaCollectionName: string | null = nu¶»§q«^