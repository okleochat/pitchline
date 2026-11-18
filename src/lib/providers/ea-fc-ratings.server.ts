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
let lastKnownActiveEaCollectionName: string | null = null

const LEAGUE_SLUGS: Partial<Record<LeagueId, string>> = {
  eng: "eng.1",
  ch: "eng.2",
  esp: "esp.1",
  ita: "ita.1",
  ger: "ger.1",
  fra: "fra.1",
  ned: "ned.1",
  por: "por.1",
  tur: "tur.1",
  ksa: "ksa.1",
  mls: "usa.1",
  bra: "bra.1",
  mx: "mex.1",
  ucl: "uefa.champions",
  uel: "uefa.europa",
  uecl: "uefa.europa.conf",
  int: "fifa.world",
}

const KNOWN_LEAGUE_SLUGS = new Set(
  Object.values(LEAGUE_SLUGS).filter((value): value is string => Boolean(value)),
)

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function leagueSlug(team: PlayerTeamContext): string | null {
  const supplied = team.feedSlug?.trim()
  if (supplied && KNOWN_LEAGUE_SLUGS.has(supplied)) return supplied
  if (supplied && /^[a-z0-9.-]{1,50}$/.test(supplied)) return supplied
  const rateLeague = team.rateLeague ?? team.league
  return LEAGUE_SLUGS[rateLeague] ?? LEAGUE_SLUGS[team.league] ?? null
}

function cacheGet<T>(key: string): { hit: boolean; value?: T } {
  const entry = memoryCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return { hit: false }
  }
  return { hit: true, value: entry.value as T }
}

function cacheSet(key: string, value: unknown, ttl: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttl })
  if (memoryCache.size > 1800) {
    const first = memoryCache.keys().next().value
    if (first) memoryCache.delete(first)
  }
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const existing = cacheGet<T>(key)
  if (existing.hit && Array.isArray(existing.value) && existing.value.length > 0) {
    return existing.value as T
  }
  if (existing.hit) memoryCache.delete(key)

  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const task = (async () => {
    const documentId = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 900)
    try {
      const doc = await getFirebaseAdminFirestore()
        .collection("provider_api_cache")
        .doc(documentId)
        .get()
      const stored = doc.data()

      if (stored?.cacheKey === key) {
        if (
          stored.expiresAt > Date.now() &&
          Array.isArray(stored.value) &&
          stored.value.length > 0
        ) {
          cacheSet(key, stored.value, stored.expiresAt - Date.now())
          return stored.value as T
        }

        // Delete every old null/empty/corrupt roster entry. A failed ESPN
        // response is never treated as a squad and is never cached.
        void doc.ref.delete().catch(() => {})
      }
    } catch {
      // Try ESPN directly when Firestore's shared cache is unavailable.
    }

    const value = await load()
    if (Array.isArray(value) && value.length > 0) {
      cacheSet(key, value, ttl)
      try {
        await getFirebaseAdminFirestore()
          .collection("provider_api_cache")
          .doc(documentId)
          .set({
            cacheKey: key,
            value,
            expiresAt: Date.now() + ttl,
            cachedAt: Date.now(),
          })
      } catch {
        // The fetched roster remains usable even if cache persistence fails.
      }
    }

    // Critical: null and empty arrays are deliberately not placed in either
    // memory or Firestore. The next request must try ESPN again.
    return value
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, task)
  return task
}

function athleteRecord(value: unknown): Dict | null {
  const item = record(value)
  if (!item) return null
  return record(item.athlete) ?? record(item.player) ?? item
}

function athleteId(value: unknown): string | null {
  const athlete = athleteRecord(value)
  const id = numeric(athlete?.id ?? athlete?.athleteId ?? athlete?.athlete_id)
  return id === null ? null : String(id)
}

function athleteName(value: unknown): string | null {
  const athlete = athleteRecord(value)
  if (!athlete) return null
  const direct = stringValue(
    athlete.fullName ?? athlete.displayName ?? athlete.name ??
    athlete.display_name ?? athlete.shortName ?? athlete.short_name,
  )
  if (direct) return direct
  const first = stringValue(athlete.firstName ?? athlete.first_name)
  const last = stringValue(athlete.lastName ?? athlete.last_name)
  return [first, last].filter(Boolean).join(" ") || null
}

async function currentRoster(slug: string, teamId: string): Promise<unknown[] | null> {
  const key = "espn-ea-ratings-roster:v2:" + slug + ":" + teamId
  return cached(key, ROSTER_CACHE_MS, async () => {
    // Use ESPN's standard grouped-roster response without requesting an
    // unnecessarily high limit.
    const url = ESPN_SITE_BASE + "/" + slug + "/teams/" + teamId + "/roster"
    const payload = await getEspnJsonQuick(url)
    if (!payload) return null

    const players = normalizeEspnRoster(payload)
    if (!players.length) {
      console.warn("[Pitchline EA FC] ESPN roster response contained no usable players", {
        league: slug,
        teamId,
        responseKeys: Object.keys(payload).slice(0, 12),
      })
      return null
    }
    return players
  })
}

function rosterPosition(value: unknown): unknown {
  const item = record(value)
  const athlete = athleteRecord(value)
  return athlete?.position ?? item?.position ?? null
}

function rosterNumber(value: unknown): number | null {
  const athlete = athleteRecord(value)
  const item = record(value)
  return numeric(
    athlete?.jersey ?? athlete?.number ?? athlete?.jerseyNumber ??
    athlete?.jersey_number ?? item?.jersey ?? item?.number ?? item?.jersey_number,
  )
}

function rosterNationality(value: unknown): string | null {
  const athlete = athleteRecord(value)
  if (!athlete) return null
  const nationality = record(athlete.nationality) ?? record(athlete.citizenship)
  return stringValue(
    nationality?.displayName ?? nationality?.name ?? nationality?.abbreviation ??
    athlete.nationality ?? athlete.citizenship,
  )
}

function rosterNameCandidates(value: unknown): string[] {
  const athlete = athleteRecord(value)
  if (!athlete) return []
  const names = [
    athlete.fullName,
    athlete.displayName,
    athlete.name,
    athlete.display_name,
    athlete.shortName,
    athlete.short_name,
    [stringValue(athlete.firstName ?? athlete.first_name), stringValue(athlete.lastName ?? athlete.last_name)]
      .filter(Boolean).join(" "),
  ]
  return [...new Set(names.filter((name): name is string => typeof name === "string")
    .map((name) => name.trim()).filter(Boolean))]
}

type EaShardDocument = {
  database: string
  syncedAt?: string
  players?: unknown[]
}

async function activeEaShardCollection(): Promise<string> {
  if (eaCollectionNameCache && eaCollectionNameCache.expiresAt > Date.now()) {
    return eaCollectionNameCache.name
  }

  let collectionName: string
  try {
    const metadata = await getFirebaseAdminFirestore()
      .collection("ea_fc27_meta")
      .doc("current")
      .get()

    if (!metadata.exists) {
      // Preserve the pre-metadata collection only for installations that have
      // not yet published an active collection pointer.
      collectionName = LEGACY_EA_SHARD_COLLECTION
    } else {
      const candidate = stringValue(record(metadata.data())?.activeCollection)
      if (!candidate || !/^ea_fc27_players_[a-zA-Z0-9_]+$/.test(candidate)) {
        throw new Error("EA FC active collection pointer is missing or invalid")
      }
      collectionName = candidate
      lastKnownActiveEaCollectionName = candidate
    }
  } catch {
    // Reuse only a collection that this process previously verified from the
    // metadata pointer. Never silently switch to an old/empty legacy dataset.
    if (!lastKnownActiveEaCollectionName) {
      throw new Error("EA FC active collection metadata is temporarily unavailable")
    }
    collectionName = lastKnownActiveEaCollectionName
    console.warn("[Pitchline EA FC] Reusing the last verified player collection after a metadata read failure")
  }

  eaCollectionNameCache = {
    name: collectionName,
    expiresAt: Date.now() + EA_COLLECTION_CACHE_MS,
  }
  return collectionName
}

async function loadEaShard(shardId: string): Promise<EaShardDocument | null> {
  const collectionName = await activeEaShardCollection()
  const cacheKey = collectionName + ":" + shardId
  const cachedShard = eaShardCache.get(cacheKey)
  if (cachedShard && cachedShard.expiresAt > Date.now()) {
    return cachedShard.value as EaShardDocument | null
  }
  if (cachedShard) eaShardCache.delete(cacheKey)

  const pending = eaShardInFlight.get(cacheKey)
  if (pending) return pending

  const task = (async () => {
    const snapshot = await getFirebaseAdminFirestore()
      .collection(collectionName)
      .doc(shardId)
      .get()
    if (!snapshot.exists) {
      eaShardCache.set(cacheKey, { value: null, expiresAt: Date.now() + EMPTY_CACHE_MS })
      return null
    }
    const document = record(snapshot.data())
    if (!document || document.database !== "EA SPORTS FC 27" || !Array.isArray(document.players)) {
      eaShardCache.set(cacheKey, { value: null, expiresAt: Date.now() + EMPTY_CACHE_MS })
      return null
    }
    const value: EaShardDocument = {
      database: "EA SPORTS FC 27",
      syncedAt: stringValue(document.syncedAt) ?? undefined,
      players: document.players,
    }
    eaShardCache.set(cacheKey, { value, expiresAt: Date.now() + EA_SHARD_CACHE_MS })
    return value
  })().finally(() => eaShardInFlight.delete(cacheKey))

  eaShardInFlight.set(cacheKey, task)
  return task
}

/**
 * Read the required EA name shards in Firestore batches. A normal club roster
 * can reference hundreds of name shards; issuing one document.get() per shard
 * creates unnecessary latency and connection fan-out on Team Insights.
 */
async function loadEaShards(shardIds: string[]): Promise<Array<EaShardDocument | null>> {
  if (!shardIds.length) return []
  const collectionName = await activeEaShardCollection()
  const pendingById = new Map<string, Promise<EaShardDocument | null>>()
  const immediateById = new Map<string, EaShardDocument | null>()
  const missing: string[] = []

  for (const shardId of shardIds) {
    const cacheKey = collectionName + ":" + shardId
    const cachedShard = eaShardCache.get(cacheKey)
    if (cachedShard && cachedShard.expiresAt > Date.now()) {
      immediateById.set(shardId, cachedShard.value as EaShardDocument | null)
      continue
    }
    if (cachedShard) eaShardCache.delete(cacheKey)
    const pending = eaShardInFlight.get(cacheKey)
    if (pending) {
      pendingById.set(shardId, pending)
    } else {
      missing.push(shardId)
    }
  }

  if (missing.length) {
    const firestore = await getFirebaseAdminFirestore()
    const resolvers = new Map<string, (value: EaShardDocument | null) => void>()
    const resolved = new Set<string>()

    for (const shardId of missing) {
      const cacheKey = collectionName + ":" + shardId
      let resolvePending!: (value: EaShardDocument | null) => void
      const pending = new Promise<EaShardDocument | null>((resolve) => {
        resolvePending = resolve
      })
      resolvers.set(shardId, resolvePending)
      pendingById.set(shardId, pending)
      eaShardInFlight.set(cacheKey, pending)
    }

    const cacheSnapshot = (shardId: string, snapshot: {
      exists: boolean
      data(): unknown
    }) => {
      const cacheKey = collectionName + ":" + shardId
      let value: EaShardDocument | null = null
      let expiresAt = Date.now() + EMPTY_CACHE_MS
      if (snapshot.exists) {
        const document = record(snapshot.data())
        if (document?.database === "EA SPORTS FC 27" && Array.isArray(document.players)) {
          value = {
            database: "EA SPORTS FC 27",
            syncedAt: stringValue(document.syncedAt) ?? undefined,
            players: document.players,
          }
          expiresAt = Date.now() + EA_SHARD_CACHE_MS
        }
      }
      eaShardCache.set(cacheKey, { value, expiresAt })
      resolved.add(shardId)
      resolvers.get(shardId)?.(value)
    }

    try {
      // Firestore getAll is much faster than opening a separate RPC for every
      // player-name shard. Keep batches bounded for predictable request size.
      for (let offset = 0; offset < missing.length; offset += 100) {
        const batchIds = missing.slice(offset, offset + 100)
        const refs = batchIds.map((id) => firestore.collection(collectionName).doc(id))
        const snapshots = await firestore.getAll(...refs)
        snapshots.forEach((snapshot, index) => cacheSnapshot(batchIds[index], snapshot))
      }
    } catch (error) {
      console.warn("[Pitchline EA FC] Batched player-shard read failed; falling back to document reads", {
        reason: error instanceof Error ? error.message : "unknown error",
      })
      await Promise.all(missing.filter((id) => !resolved.has(id)).map(async (id) => {
        try {
          const snapshot = await firestore.collection(collectionName).doc(id).get()
          cacheSnapshot(id, snapshot)
        } catch {
          cacheSnapshot(id, { exists: false, data: () => null })
        }
      }))
    } finally {
      for (const shardId of missing) {
        const cacheKey = collectionName + ":" + shardId
        if (!resolved.has(shardId)) {
          eaShardCache.set(cacheKey, { value: null, expiresAt: Date.now() + EMPTY_CACHE_MS })
          resolvers.get(shardId)?.(null)
        }
        eaShardInFlight.delete(cacheKey)
      }
    }
  }

  return Promise.all(shardIds.map((shardId) => {
    if (immediateById.has(shardId)) {
      return Promise.resolve(immediateById.get(shardId) ?? null)
    }
    return pendingById.get(shardId) ?? Promise.resolve(null)
  }))
}

async function findEaMatches(
  roster: unknown[],
): Promise<{ matches: Map<string, Dict>; syncedAt: string | null }> {
  const namedRoster = roster.flatMap((entry) => {
    const id = athleteId(entry)
    return id ? [{
      id,
      names: rosterNameCandidates(entry),
      position: rosterPosition(entry),
      nationality: rosterNationality(entry),
    }] : []
  })

  const shardIds = [...new Set(namedRoster.flatMap((item) =>
    item.names.map(playerNameShardId),
  ).filter(Boolean))]
  const shards = await loadEaShards(shardIds)
  const shardPlayers = shards.flatMap((shard) => shard?.players ?? [])
  const uniqueById = new Map<string, Dict>()
  for (const value of shardPlayers) {
    const player = record(value)
    const id = stringValue(player?.id)
    if (player && id) uniqueById.set(id, player)
  }
  const candidates = [...uniqueById.values()]
  const matches = new Map<string, Dict>()
  const claimedEaIds = new Set<string>()

  for (const rosterPlayer of namedRoster) {
    const match = matchEaPlayerByName({
      nameCandidates: rosterPlayer.names,
      position: rosterPlayer.position,
      nationality: rosterPlayer.nationality,
    }, candidates)
    const eaId = stringValue(match?.id)
    // One EA record must not inflate coverage by matching twice on an ESPN roster.
    if (match && eaId && !claimedEaIds.has(eaId)) {
      matches.set(rosterPlayer.id, match)
      claimedEaIds.add(eaId)
    }
  }

  const timestamps = shards
    .map((shard) => shard?.syncedAt)
    .filter((value): value is string => Boolean(value))
  const syncedAt = timestamps.sort().at(-1) ?? null
  return { matches, syncedAt }
}

function validProTeamSquadSnapshot(value: unknown): value is ProTeamSquad {
  const item = record(value)
  const factors = record(item?.factors)
  if (!item || !factors) return false
  const numericFields = [
    item.squadCount, item.ratedPlayerCount, item.attackIndex, item.creativityIndex,
    item.defenceIndex, factors.attackMultiplier, factors.creativityMultiplier,
    factors.defenceMultiplier, factors.squadDepth, factors.ratedPlayers,
    factors.squadCount, factors.coverage,
  ]
  if (!numericFields.every((field) => typeof field === "number" && Number.isFinite(field))) return false
  if (typeof item.teamName !== "string" || !item.teamName || typeof factors.applied !== "boolean") return false
  if (!Array.isArray(item.topPlayers)) return false
  if (item.dataUpdatedAt !== null && typeof item.dataUpdatedAt !== "string") return false
  return item.topPlayers.every((player) => {
    const candidate = record(player)
    return Boolean(candidate) &&
      typeof candidate?.id === "string" &&
      typeof candidate?.name === "string" &&
      typeof candidate?.position === "string" &&
      typeof candidate?.overall === "number" &&
      Number.isFinite(candidate.overall)
  })
}

/**
 * Persist the fully prepared ESPN + EA squad once per team and active EA
 * snapshot version. Later Match Desk and Best Picks requests reuse this final
 * Firestore team document instead of rebuilding it from hundreds of shards.
 */
async function getTeamSquadSnapshot(
  team: PlayerTeamContext,
  slug: string,
  collectionName: string,
): Promise<ProTeamSquad | null> {
  const espnId = team.espnId
  if (!espnId) return null

  const cacheKey = "espn-ea-squad:v1:" + collectionName + ":" + slug + ":" + espnId
  const inMemory = squadSnapshotCache.get(cacheKey)
  if (inMemory && inMemory.expiresAt > Date.now() && validProTeamSquadSnapshot(inMemory.value)) {
    return inMemory.value
  }
  if (inMemory) squadSnapshotCache.delete(cacheKey)

  const pending = squadSnapshotInFlight.get(cacheKey)
  if (pending) return pending

  const task = (async () => {
    const firestore = getFirebaseAdminFirestore()
    const documentId = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 900)
    const reference = firestore.collection("provider_api_cache").doc(documentId)

    try {
      const snapshot = await reference.get()
      const saved = record(snapshot.data())
      const expiresAt = typeof saved?.expiresAt === "number" ? saved.expiresAt : 0
      if (
        saved?.cacheKey === cacheKey &&
        expiresAt > Date.now() &&
        validProTeamSquadSnapshot(saved.value)
      ) {
        squadSnapshotCache.set(cacheKey, { value: saved.value, expiresAt })
        return saved.value
      }
    } catch {
      // Continue against the active EA ratings snapshot when cache is unavailable.
    }

    const roster = await currentRoster(slug, espnId)
    if (!roster?.length) return null

    const eaMatches = await findEaMatches(roster)
    const squad = buildSquad(team, roster, eaMatches.matches, eaMatches.syncedAt)
    const savedAt = Date.now()
    const expiresAt = savedAt + SQUAD_SNAPSHOT_CACHE_MS

    squadSnapshotCache.set(cacheKey, { value: squad, expiresAt })
    if (squadSnapshotCache.size > 1200) {
      const first = squadSnapshotCache.keys().next().value
      if (first) squadSnapshotCache.delete(first)
    }

    try {
      await reference.set({ cacheKey, value: squad, savedAt, expiresAt })
    } catch {
      // The current request can still use the prepared in-memory result.
    }
    return squad
  })().finally(() => squadSnapshotInFlight.delete(cacheKey))

  squadSnapshotInFlight.set(cacheKey, task)
  return task
}

function buildSquad(
  team: PlayerTeamContext,
  roster: unknown[],
  eaMatches: Map<string, Dict>,
  syncedAt: string | null,
): ProTeamSquad {
  const players: SquadPlayer[] = roster.flatMap((entry) => {
    const id = athleteId(entry)
    const name = athleteName(entry)
    if (!id || !name) return []
    const rawPosition = rosterPosition(entry)
    const currentPosition = positionFrom(rawPosition)
    const matched = eaMatches.get(id)

    if (matched) {
      const player = normaliseEaSquadPlayer(matched)
      if (player) {
        return [{
          ...player,
          // ESPN roster IDs/jerseys and positions are current roster context;
          // EA supplies the player-quality attributes.
          id: String(matched.id),
          name,
          number: rosterNumber(entry),
          position: currentPosition !== "UNK" ? currentPosition : player.position,
        }]
      }
    }

    return [{
      id: "espn:" + id,
      name,
      number: rosterNumber(entry),
      position: currentPosition,
      scores: null,
    }]
  })

  const derived = deriveSquadFactors(players)
  const topPlayers: ProSquadTopPlayer[] = players
    .filter((player): player is SquadPlayer & { scores: NonNullable<SquadPlayer["scores"]> } =>
      player.scores !== null,
    )
    .map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      overall: player.scores.seasonRating ?? 0,
    }))
    .filter((player) => player.overall > 0)
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 3)

  return {
    teamName: team.name,
    squadCount: players.length,
    ratedPlayerCount: derived.factors.ratedPlayers,
    attackIndex: derived.attackIndex,
    creativityIndex: derived.creativityIndex,
    defenceIndex: derived.defenceIndex,
    factors: derived.factors,
    topPlayers,
    dataUpdatedAt: syncedAt,
  }
}

function result(
  status: ProPlayerData["status"],
  note: string,
  home: ProTeamSquad | null = null,
  away: ProTeamSquad | null = null,
): ProPlayerData {
  return {
    provider: "EA SPORTS FC 27",
    status,
    note,
    home,
    away,
    adjustmentsApplied: Boolean(home?.factors.applied && away?.factors.applied),
  }
}

/**
 * ESPN supplies each selected team's current roster. Pitchline matches those
 * identities to EA's base-player ratings, using strict normalized name keys.
 * No per-player ESPN season-stat requests are made.
 */
export async function getProPlayerData(input: {
  home: PlayerTeamContext
  away: PlayerTeamContext
}): Promise<ProPlayerData> {
  const homeSlug = leagueSlug(input.home)
  const awaySlug = leagueSlug(input.away)
  if (!input.home.espnId || !input.away.espnId || !homeSlug || !awaySlug) {
    return result(
      "team_not_found",
      "ESPN team identity is missing for one or both selected teams. Refresh the live board so Pitchline can use the current ESPN team mapping.",
    )
  }
  if (!/^\d{1,12}$/.test(input.home.espnId) || !/^\d{1,12}$/.test(input.away.espnId)) {
    return result("team_not_found", "ESPN returned an invalid team identifier for one or both selected teams.")
  }

  try {
    const collectionName = await activeEaShardCollection()
    const [home, away] = await Promise.all([
      getTeamSquadSnapshot(input.home, homeSlug, collectionName),
      getTeamSquadSnapshot(input.away, awaySlug, collectionName),
    ])
    if (!home || !away) {
      const missing = [
        ...(!home ? [input.home.name] : []),
        ...(!away ? [input.away.name] : []),
      ]
      return result(
        "roster_unavailable",
        "ESPN did not return a usable current roster for " + missing.join(" and ") +
          ". The Pro simulation will continue with team-level inputs.",
      )
    }

    const bothApplied = home.factors.applied && away.factors.applied

    const coverageText = [
      input.home.name + " " + home.ratedPlayerCount + "/" + home.squadCount,
      input.away.name + " " + away.ratedPlayerCount + "/" + away.squadCount,
    ].join("; ")
    const timestamps = [home.dataUpdatedAt, away.dataUpdatedAt].filter(Boolean)
    const updateText = timestamps.length
      ? " EA database sync: " + [...new Set(timestamps)].join(", ") + "."
      : ""

    return result(
      bothApplied ? "available" : "partial",
      bothApplied
        ? "ESPN's current rosters were matched to EA FC 27 player attributes. Pitchline's position-aware squad indices are incorporated into the Pro simulation. These ratings describe base player quality, not live form or matchday availability." + updateText
        : "ESPN returned both current rosters, but EA FC 27 matched only " + coverageText +
          ". Both teams' player multipliers remain neutral until each side has at least 12 matched players and 60% coverage." + updateText,
      home,
      away,
    )
  } catch (error) {
    console.error("[Pitchline EA FC] ESPN roster / EA ratings lookup failed", {
      message: error instanceof Error ? error.message : "unknown error",
    })
    return result(
      "provider_error",
      "Pitchline could not load ESPN rosters or its private EA FC 27 player database. The Pro simulation will continue with team-level inputs.",
    )
  }
}
