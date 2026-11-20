import "server-only"
import { LEAGUES, TEAMS, formRate, isCup, snapshotBoard, type Board, type Fixture, type LeagueId, type Team } from "@/data/football"
import { getEspnJson } from "@/lib/espn/transport.server"
import { getUpcomingInternationalFixtures, type InternationalFixture } from "@/lib/international/fixtures.server"
import { INTERNATIONAL_COMPETITIONS } from "@/lib/international/competitions"
import { splitInternationalSimulationData } from "@/lib/international/simulation-availability"
import { getNationalTeamDirectory } from "@/lib/international/national-teams.server"
import { estimateHomeAdvantage } from "@/lib/home-advantage"
import { getFirebaseAdminFirestore, hasFirebaseAdminCredentials } from "@/lib/firebase/admin"

const TTL_MS = 15 * 60 * 1000
const BOARD_MEMORY_CACHE_MS = 60 * 1000

const SOURCES: Record<LeagueId, { slug: string; tz: string }> = {
  eng: { slug: "eng.1", tz: "Europe/London" },
  esp: { slug: "esp.1", tz: "Europe/Madrid" },
  ita: { slug: "ita.1", tz: "Europe/Rome" },
  ger: { slug: "ger.1", tz: "Europe/Berlin" },
  fra: { slug: "fra.1", tz: "Europe/Paris" },
  ch: { slug: "eng.2", tz: "Europe/London" },
  ned: { slug: "ned.1", tz: "Europe/Amsterdam" },
  por: { slug: "por.1", tz: "Europe/Lisbon" },
  tur: { slug: "tur.1", tz: "Europe/Istanbul" },
  ksa: { slug: "ksa.1", tz: "Asia/Riyadh" },
  mls: { slug: "usa.1", tz: "America/New_York" },
  bra: { slug: "bra.1", tz: "America/Sao_Paulo" },
  mx: { slug: "mex.1", tz: "America/Mexico_City" },
  ucl: { slug: "uefa.champions", tz: "Europe/Paris" },
  uel: { slug: "uefa.europa", tz: "Europe/Paris" },
  uecl: { slug: "uefa.europa.conf", tz: "Europe/Paris" },
  int: { slug: "fifa.world", tz: "Africa/Lagos" },
}

const EXTRA: Record<string, string[]> = {
  "eng-bha": ["Brighton & Hove Albion", "Brighton"],
  "eng-bou": ["AFC Bournemouth"],
  "eng-tot": ["Tottenham Hotspur", "Spurs"],
  "eng-new": ["Newcastle United"],
  "eng-lee": ["Leeds United"],
  "eng-hul": ["Hull City"],
  "eng-ips": ["Ipswich Town"],
  "eng-nfo": ["Nottm Forest"],
  "eng-cov": ["Coventry City"],
  "eng-mun": ["Manchester United", "Man Utd"],
  "eng-mci": ["Manchester City", "Man City"],
  "eng-cry": ["Crystal Palace"],
  "ita-int": ["Internazionale", "Inter", "Inter Milan"],
  "ita-rom": ["AS Roma"],
  "ita-mil": ["AC Milan"],
  "ger-bay": ["Bayern Munich", "Bayern"],
  "ger-bvb": ["Borussia Dortmund", "Dortmund"],
  "ger-scf": ["SC Freiburg"],
  "ger-b04": ["Bayer Leverkusen", "Bayer 04 Leverkusen"],
  "ger-svw": ["Werder Bremen", "Bremen"],
  "ger-elv": ["SV Elversberg", "SV 07 Elversberg"],
  "ger-vfb": ["VfB Stuttgart"],
  "ger-tsg": ["TSG Hoffenheim"],
  "ger-sge": ["Eintracht Frankfurt"],
  "ger-hsv": ["Hamburg SV", "Hamburger SV"],
  "ger-m05": ["1. FSV Mainz 05"],
  "ger-scp": ["SC Paderborn 07"],
  "ger-fca": ["FC Augsburg"],
  "ger-koe": ["FC Cologne", "Cologne", "1. FC Köln", "Köln"],
  "ger-fcu": ["1. FC Union Berlin"],
  "ger-s04": ["Schalke 04", "FC Schalke 04"],
  "ger-bmg": ["Borussia Mönchengladbach", "Mönchengladbach"],
  "fra-psg": ["PSG", "Paris Saint-Germain"],
  "fra-om": ["Olympique de Marseille", "Olympique Marseille"],
  "fra-ol": ["Olympique Lyonnais"],
  "fra-asm": ["AS Monaco"],
  "fra-ren": ["Stade Rennais", "Stade Rennais FC"],
  "fra-sbr": ["Stade Brestois", "Stade Brestois 29"],
  "fra-rcl": ["RC Lens"],
  "fra-tfc": ["Toulouse FC"],
  "fra-rcs": ["RC Strasbourg"],
  "fra-aux": ["AJ Auxerre"],
  "fra-hac": ["Le Havre AC"],
  "esp-bar": ["FC Barcelona"],
  "esp-atm": ["Atletico Madrid", "Atlético"],
  "esp-ath": ["Athletic"],
  "esp-dep": ["Deportivo La Coruña", "Deportivo La Coruna"],
  "esp-rac": ["Racing de Santander"],
  "esp-ala": ["Deportivo Alavés", "Alaves"],
  "esp-ray": ["Rayo"],
  "esp-lev": ["Levante UD"],
  "esp-mal": ["Malaga"],
}

const PALETTE = ["#1e3348", "#7a263a", "#1d4e3a", "#5c2d6e", "#9a3412", "#0b3d91", "#3f6212", "#7c2d12"]

type LiveSide = {
  espnId: string
  name: string
  shortName: string
  abbr: string
  color?: string
}

type CatalogIndex = Map<string, Team>
type NameIndex = Map<string, Team | null>
type LoadedLeague = {
  teams: Team[]
  fixtures: Fixture[]
  weekend: string
  season: string
  fixturesSource: "live" | "snapshot"
  fixturesUpdatedAt: string
  homeAdvantagePct: number
  names: { raw: string; team: Team }[]
}

let cache: { at: number; ttl: number; board: Board } | null = null
let inflight: Promise<Board> | null = null
const homeAdvantageCache = new Map<string, { at: number; value: number }>()
const HOME_ADVANTAGE_CACHE_MS = 6 * 60 * 60 * 1000

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripClub(value: string): string {
  return value
    .replace(/\b(fc|afc|cf|sc|sv|ac|as|rc|osc|ud|vfb|tsg|aj)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function indexLeague(league: LeagueId): CatalogIndex {
  const keys = new Map<string, Team[]>()
  const add = (key: string, team: Team) => {
    const cleaned = key.trim()
    if (!cleaned) return
    const list = keys.get(cleaned) ?? []
    if (!list.includes(team)) list.push(team)
    keys.set(cleaned, list)
  }
  for (const team of TEAMS.filter((item) => item.league === league)) {
    add(norm(team.name), team)
    add(stripClub(norm(team.name)), team)
    for (const alias of EXTRA[team.id] ?? []) {
      add(norm(alias), team)
      add(stripClub(norm(alias)), team)
    }
  }
  const unique: CatalogIndex = new Map()
  for (const [key, teams] of keys) {
    if (teams.length === 1) unique.set(key, teams[0])
  }
  return unique
}

function findCatalog(index: CatalogIndex, side: LiveSide): Team | undefined {
  const tries = [side.name, side.shortName, side.abbr].flatMap((value) => {
    const base = norm(value)
    return [base, stripClub(base)]
  })
  for (const key of tries) {
    const hit = index.get(key)
    if (hit) return hit
  }
  return undefined
}

function perGame(total: number, played: number, fallback: number): number {
  if (played <= 0) return fallback
  return Math.round((total / played) * 100) / 100
}

function shrunkRate(total: number, played: number, fallback: number): number {
  if (played <= 0) return fallback
  if (played >= 6) return perGame(total, played, fallback)
  const priorN = 4
  const prior = 1.35
  return Math.round(((total + prior * priorN) / (played + priorN)) * 100) / 100
}

function remember(index: NameIndex, raw: string, team: Team) {
  const base = norm(raw)
  for (const key of [base, stripClub(base)]) {
    if (!key) continue
    const prev = index.get(key)
    if (prev === undefined) index.set(key, team)
    else if (prev === null) continue
    else if (prev.id === team.id) index.set(key, team)
    else index.set(key, null)
  }
}

function lookupDomestic(index: NameIndex, side: LiveSide): Team | undefined {
  const keys = [side.name, side.shortName].flatMap((value) => {
    const base = norm(value)
    return [base, stripClub(base)]
  })
  for (const key of keys) {
    const hit = index.get(key)
    if (hit) return hit
  }
  return undefined
}

function indexSaved(teams: Team[]): NameIndex {
  const index: NameIndex = new Map()
  for (const team of teams) {
    remember(index, team.name, team)
    for (const alias of EXTRA[team.id] ?? []) remember(index, alias, team)
  }
  return index
}

function scorerLabel(athlete: { shortName?: string; displayName?: string }): string {
  const short = athlete.shortName?.trim() || athlete.displayName?.trim() || ""
  const dot = short.lastIndexOf(".")
  if (dot >= 0) {
    const rest = short.slice(dot + 1).trim()
    if (rest) return rest
  }
  return short
}

function inkFor(mark: string): string {
  const hex = mark.replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#f6f4ef"
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const y = (r * 299 + g * 587 + b * 114) / 1000
  return y > 160 ? "#1a1c19" : "#f6f4ef"
}

function freshMark(espnId: string, color?: string): { mark: string; ink: string } {
  const raw = color?.replace("#", "")
  if (raw && /^[0-9a-fA-F]{6}$/.test(raw)) {
    const ink = inkFor(raw)
    const yLight = ink === "#1a1c19"
    if (!yLight) return { mark: `#${raw.toLowerCase()}`, ink }
  }
  let hash = 0
  for (const char of espnId) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  const mark = PALETTE[hash % PALETTE.length]
  return { mark, ink: "#f6f4ef" }
}

function statValue(entry: { stats?: { name: string; value?: number }[] }, name: string): number {
  return entry.stats?.find((item) => item.name === name)?.value ?? 0
}

function utcDay(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${date.getUTCFullYear()}${month}${day}`
}

function todayUtc(): string {
  return utcDay(new Date().toISOString())
}

function ymdAdd(ymd: string, days: number): string {
  const date = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))))
  date.setUTCDate(date.getUTCDate() + days)
  return utcDay(date.toISOString())
}

function eventsOn(board: Record<string, unknown> | null, ymd: string): Record<string, unknown>[] {
  const events = (board?.events as Record<string, unknown>[] | undefined) ?? []
  return events.filter((event) => typeof event.date === "string" && utcDay(event.date) === ymd)
}

function clusterFrom(dates: string[], start: number): string[] {
  const days: string[] = []
  const anchor = new Date(dates[start]).getTime()
  for (let i = start; i < dates.length; i++) {
    if (new Date(dates[i]).getTime() - anchor > 4 * 24 * 60 * 60 * 1000) break
    days.push(utcDay(dates[i]))
  }
  return days
}

async function domesticDays(slug: string, calendar: string[]): Promise<string[]> {
  const today = todayUtc()
  let start = calendar.findIndex((iso) => utcDay(iso) >= today)
  if (start < 0) start = Math.max(0, calendar.length - 1)
  if (start < 0 || !calendar[start]) return []
  const days = clusterFrom(calendar, start)
  const last = days[days.length - 1] ?? ""
  const next = calendar.findIndex((iso) => utcDay(iso) > last)
  if (next < 0) return days
  const gap = new Date(calendar[next]).getTime() - new Date(calendar[start]).getTime()
  if (gap > 8 * 24 * 60 * 60 * 1000) return days
  const boards = await Promise.all(
    days.map((day) => getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${day}`)),
  )
  const seen = new Set<string>()
  for (const board of boards) {
    for (const event of (board?.events as { id?: string }[] | undefined) ?? []) {
      if (event.id) seen.add(String(event.id))
    }
  }
  if (seen.size >= 4) return days
  return [...days, ...clusterFrom(calendar, next)]
}

async function cupDays(slug: string, firstBoard: Record<string, unknown> | null): Promise<string[]> {
  const now = Date.now() - 3 * 60 * 60 * 1000
  const future = [
    ...new Set(
      ((firstBoard?.events as { date?: string }[] | undefined) ?? [])
        .filter((event) => event.date && new Date(event.date).getTime() >= now)
        .map((event) => utcDay(event.date!)),
    ),
  ].sort()
  let first = future[0]
  if (!first) {
    const today = todayUtc()
    for (let batch = 0; batch < 3 && !first; batch++) {
      const slice = Array.from({ length: 7 }, (_, index) => ymdAdd(today, batch * 7 + index))
      const boards = await Promise.all(
        slice.map((day) => getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${day}`)),
      )
      const hit = slice.findIndex((day, index) => eventsOn(boards[index], day).length > 0)
      if (hit >= 0) first = slice[hit]
    }
  }
  if (!first) return []
  return [first, ymdAdd(first, 1), ymdAdd(first, 2)]
}

function kickLabel(iso: string, tz: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  })
    .format(date)
    .replace(",", "")
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).format(date)
  return `${day} · ${time}`
}

function weekendLabel(dates: Date[], tz: string): string {
  if (!dates.length) return "No fixtures"
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...options }).format(date)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (part(first, { day: "numeric", month: "short" }) === part(last, { day: "numeric", month: "short" })) {
    return part(first, { day: "numeric", month: "short" })
  }
  if (part(first, { month: "short" }) === part(last, { month: "short" })) {
    return `${part(first, { day: "numeric" })}–${part(last, { day: "numeric", month: "short" })}`
  }
  return `${part(first, { day: "numeric", month: "short" })}–${part(last, { day: "numeric", month: "short" })}`
}

function recentMonthKeys(count = 3): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    return String(date.getUTCFullYear()) + String(date.getUTCMonth() + 1).padStart(2, "0")
  })
}

async function getRecentHomeAdvantagePct(slug: string): Promise<number> {
  const months = recentMonthKeys(3)
  const cacheKey = slug + ":" + months[0]
  const cached = homeAdvantageCache.get(cacheKey)
  if (cached && Date.now() - cached.at < HOME_ADVANTAGE_CACHE_MS) return cached.value

  const boards = await Promise.all(
    months.map((month) =>
      getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${month}&limit=500`),
    ),
  )
  const scores: { homeGoals: number; awayGoals: number }[] = []
  const seen = new Set<string>()
  for (const board of boards) {
    for (const event of (board?.events as Record<string, unknown>[] | undefined) ?? []) {
      const id = String(event.id ?? "")
      if (!id || seen.has(id) || !isFinal(event)) continue
      const competition = (event.competitions as Record<string, unknown>[] | undefined)?.[0]
      const sides = (competition?.competitors as Record<string, unknown>[] | undefined) ?? []
      const home = sides.find((side) => side.homeAway === "home")
      const away = sides.find((side) => side.homeAway === "away")
      const homeGoals = scoreNum(home?.score)
      const awayGoals = scoreNum(away?.score)
      if (homeGoals === null || awayGoals === null) continue
      seen.add(id)
      scores.push({ homeGoals, awayGoals })
    }
  }

  const value = Math.round(estimateHomeAdvantage(scores) * 100)
  homeAdvantageCache.set(cacheKey, { at: Date.now(), value })
  if (homeAdvantageCache.size > 120) {
    const firstKey = homeAdvantageCache.keys().next().value
    if (firstKey) homeAdvantageCache.delete(firstKey)
  }
  return value
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  return getEspnJson(url)
}

function asSide(team: Record<string, unknown> | undefined): LiveSide | null {
  if (!team) return null
  const espnId = String(team.id ?? "")
  const name = String(team.displayName ?? team.name ?? "")
  if (!espnId || !name) return null
  return {
    espnId,
    name,
    shortName: String(team.shortDisplayName ?? name),
    abbr: String(team.abbreviation ?? name.slice(0, 3)),
    color: typeof team.color === "string" ? team.color : undefined,
  }
}

async function loadLeague(
  league: LeagueId,
  saved: Board,
  domestic: NameIndex | null,
): Promise<LoadedLeague | null> {
  const source = SOURCES[league]
  const cup = isCup(league)
  const [standings, statistics, firstBoard] = await Promise.all([
    getJson(`https://site.api.espn.com/apis/v2/sports/soccer/${source.slug}/standings`),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${source.slug}/statistics`),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${source.slug}/scoreboard`),
  ])
  const children =
    (standings?.children as { standings?: { seasonDisplayName?: string; entries?: unknown[] } }[] | undefined) ?? []
  const entries = children.flatMap((child) => child.standings?.entries ?? [])
  if (!entries.length) return null

  const catalog = indexLeague(league)
  const colors = new Map<string, string>()
  const scorers = new Map<string, string[]>()
  const takeScorer = (athlete: { shortName?: string; displayName?: string; team?: Record<string, unknown> } | undefined) => {
    const side = asSide(athlete?.team)
    if (!side) return
    if (side.color) colors.set(side.espnId, side.color)
    const label = scorerLabel(athlete ?? {})
    if (!label) return
    const list = scorers.get(side.espnId) ?? []
    if (!list.includes(label)) list.push(label)
    scorers.set(side.espnId, list)
  }
  const statGroups =
    (statistics?.stats as
      | { name?: string; leaders?: { athlete?: { shortName?: string; displayName?: string; team?: Record<string, unknown> } }[] }[]
      | undefined) ?? []
  for (const group of statGroups) {
    if (group.name !== "goalsLeaders" && group.name !== "assistsLeaders") continue
    for (const leader of group.leaders ?? []) takeScorer(leader.athlete)
  }

  const seasonName = children[0]?.standings?.seasonDisplayName ?? ""
  const seasonYear = Number(seasonName.slice(0, 4))
  const season = Number.isFinite(seasonYear) ? `${seasonYear}/${String((seasonYear + 1) % 100).padStart(2, "0")}` : saved.season

  const teams: Team[] = []
  const names: { raw: string; team: Team }[] = []
  const byEspn = new Map<string, Team>()
  for (const entry of entries as { team?: Record<string, unknown>; stats?: { name: string; value?: number }[] }[]) {
    const side = asSide(entry.team)
    if (!side || byEspn.has(side.espnId)) continue
    if (side.color) colors.set(side.espnId, side.color)
    const known = findCatalog(catalog, side)
    const played = statValue(entry, "gamesPlayed")
    const homeNames = scorers.get(side.espnId) ?? []
    const fallback = known?.scorers ?? []
    const picked = [...homeNames]
    for (const name of fallback) {
      if (picked.length >= 3) break
      if (!picked.includes(name)) picked.push(name)
    }
    while (picked.length < 3) picked.push(picked[0] ?? "Attacker")
    const attack = cup
      ? shrunkRate(statValue(entry, "pointsFor"), played, known?.attack ?? 1.35)
      : perGame(statValue(entry, "pointsFor"), played, known?.attack ?? 1.35)
    const defense = cup
      ? shrunkRate(statValue(entry, "pointsAgainst"), played, known?.defense ?? 1.35)
      : perGame(statValue(entry, "pointsAgainst"), played, known?.defense ?? 1.35)
    const paint = known ? { mark: known.mark, ink: known.ink } : freshMark(side.espnId, colors.get(side.espnId) ?? side.color)
    const team: Team = {
      id: known?.id ?? `live-${league}-${side.espnId}`,
      name: known?.name ?? side.shortName,
      short: (known?.short ?? side.abbr).slice(0, 4).toUpperCase(),
      league,
      attack,
      defense,
      mark: paint.mark,
      ink: paint.ink,
      scorers: [picked[0], picked[1], picked[2]],
      espnId: side.espnId,
      feedSlug: source.slug,
      rateLeague: league,
    }
    if (domestic) {
      const basis = lookupDomestic(domestic, side)
      if (basis) {
        team.attack = basis.attack
        team.defense = basis.defense
        team.mark = basis.mark
        team.ink = basis.ink
        if (basis.scorers.some((name) => name && name !== "Attacker")) team.scorers = basis.scorers
        if (basis.espnId) team.espnId = basis.espnId
        if (basis.feedSlug) team.feedSlug = basis.feedSlug
        team.rateLeague = basis.rateLeague ?? basis.league
      }
    }
    teams.push(team)
    byEspn.set(side.espnId, team)
    names.push({ raw: side.name, team }, { raw: side.shortName, team })
    if (known) names.push({ raw: known.name, team })
    for (const alias of EXTRA[team.id] ?? []) names.push({ raw: alias, team })
  }
  if (teams.length < (cup ? 8 : 10)) return null

  const calendar = ((firstBoard?.leagues as { calendar?: unknown[] }[] | undefined)?.[0]?.calendar ?? []).filter(
    (iso): iso is string => typeof iso === "string",
  )
  const days = cup || calendar.length === 0 ? await cupDays(source.slug, firstBoard) : await domesticDays(source.slug, calendar)
  const [boards, homeAdvantagePct] = await Promise.all([
    Promise.all(
      days.map((day) => getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${source.slug}/scoreboard?dates=${day}`)),
    ),
    getRecentHomeAdvantagePct(source.slug),
  ])
  const fixtures: { time: number; fixture: Fixture }[] = []
  const seen = new Set<string>()
  for (const board of boards) {
    for (const event of (board?.events as Record<string, unknown>[] | undefined) ?? []) {
      const id = String(event.id ?? "")
      if (!id || seen.has(id)) continue
      const competition = (event.competitions as { competitors?: { homeAway?: string; team?: Record<string, unknown> }[] }[] | undefined)?.[0]
      const sides = competition?.competitors ?? []
      const home = asSide(sides.find((item) => item.homeAway === "home")?.team)
      const away = asSide(sides.find((item) => item.homeAway === "away")?.team)
      if (!home || !away) continue
      const homeTeam = byEspn.get(home.espnId)
      const awayTeam = byEspn.get(away.espnId)
      if (!homeTeam || !awayTeam) continue
      const whenIso = String(event.date ?? "")
      if (!whenIso) continue
      if (homeTeam.id.startsWith("live-") && home.color) {
        const paint = freshMark(home.espnId, home.color)
        homeTeam.mark = paint.mark
        homeTeam.ink = paint.ink
      }
      if (awayTeam.id.startsWith("live-") && away.color) {
        const paint = freshMark(away.espnId, away.color)
        awayTeam.mark = paint.mark
        awayTeam.ink = paint.ink
      }
      seen.add(id)
      fixtures.push({
        time: new Date(whenIso).getTime(),
        fixture: {
          id: `espn-${id}`,
          league,
          homeId: homeTeam.id,
          awayId: awayTeam.id,
          when: kickLabel(whenIso, source.tz),
          kickoffAt: whenIso,
        },
      })
    }
  }
  fixtures.sort((a, b) => a.time - b.time)
  const savedFixtures = saved.fixtures.filter((fixture) => fixture.league === league)
  const ordered = fixtures.map((item) => item.fixture)
  return {
    teams,
    fixtures: ordered.length ? ordered : savedFixtures,
    weekend: fixtures.length ? weekendLabel(fixtures.map((item) => new Date(item.time)), source.tz) : saved.weekends[league],
    season,
    fixturesSource: ordered.length ? "live" : "snapshot",
    fixturesUpdatedAt: ordered.length ? new Date().toISOString() : saved.leagueStatus[league].fixturesUpdatedAt,
    homeAdvantagePct,
    names,
  }
}

export async function mergeInternationalFixtures(board: Board, international: InternationalFixture[]): Promise<Board> {
  // All countries on the selected date remain available for manual simulation,
  // including sides whose match is already live or completed. Only the future
  // fixtures returned by this split are added to the upcoming board.
  const { upcomingFixtures: upcoming, sides } = splitInternationalSimulationData(international, Date.now())
  if (!sides.length) {
    return {
      ...board,
      teams: board.teams.filter((team) => team.league !== "int" || team.directoryOnly),
      fixtures: board.fixtures.filter((fixture) => fixture.league !== "int"),
      weekends: { ...board.weekends, int: "No upcoming international window" },
      leagueStatus: {
        ...board.leagueStatus,
        int: {
          standings: "snapshot",
          fixtures: "snapshot",
          teamCount: board.teams.filter((team) => team.league === "int").length,
          fixtureCount: 0,
          updatedAt: new Date().toISOString(),
          fixturesUpdatedAt: new Date().toISOString(),
          homeAdvantagePct: 100,
        },
      },
    }
  }

  // Ratings are based on the same team's previous completed international
  // competition fixtures only. No current/future match score enters the rate.
  const nationalTeams = await Promise.all(sides.map(async (side): Promise<Team> => {
    const games = await recentGames(side.feedSlug, side.espnId).catch(() => null)
    const sample = formRate(games ?? undefined, 5)
    const color = side.color && /^[0-9a-fA-F]{6}$/.test(side.color.replace("#", ""))
      ? "#" + side.color.replace("#", "").toLowerCase()
      : "#1e3348"
    return {
      id: side.id,
      name: side.name,
      short: side.short,
      league: "int",
      attack: sample?.attack ?? 1.35,
      defense: sample?.defense ?? 1.35,
      mark: color,
      ink: "#f6f4ef",
      scorers: ["Attacker", "Attacker", "Attacker"],
      espnId: side.espnId,
      feedSlug: side.feedSlug,
      rateLeague: "int",
      formMatches: sample?.played ?? 0,
      competitionName: side.competitionName,
      ratingSource: sample
        ? side.competitionName + " · previous completed matches"
        : side.competitionName + " · neutral fallback; no completed history returned",
    }
  }))

  const teamBySlugAndId = new Map<string, Team>()
  nationalTeams.forEach((team) => {
    teamBySlugAndId.set((team.feedSlug ?? "") + ":" + (team.espnId ?? ""), team)
  })

  const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))

  const internationalFixtures: Fixture[] = upcoming.flatMap((fixture) => {
    const home = teamBySlugAndId.get(fixture.competitionSlug + ":" + fixture.home.espnId)
    const away = teamBySlugAndId.get(fixture.competitionSlug + ":" + fixture.away.espnId)
    if (!home || !away) return []
    return [{
      id: "international-" + fixture.id,
      league: "int",
      homeId: home.id,
      awayId: away.id,
      when: dateLabel(fixture.kickoff),
      kickoffAt: fixture.kickoff,
      competitionName: fixture.competition,
      competitionRegion: fixture.region,
    }]
  })

  const uniqueTeams = new Map(board.teams.filter((team) => team.league !== "int" || team.directoryOnly).map((team) => [team.id, team]))
  nationalTeams.forEach((team) => uniqueTeams.set(team.id, team))
  const weekendLabel = internationalFixtures.length
    ? internationalFixtures.length + " upcoming national-team fixtures"
    : "No upcoming international window"
  const now = new Date().toISOString()

  return {
    ...board,
    teams: [...uniqueTeams.values()],
    fixtures: [...board.fixtures.filter((fixture) => fixture.league !== "int"), ...internationalFixtures],
    weekends: { ...board.weekends, int: weekendLabel },
    leagueStatus: {
      ...board.leagueStatus,
      int: {
        standings: "live",
        fixtures: internationalFixtures.length ? "live" : "snapshot",
        teamCount: [...uniqueTeams.values()].filter((team) => team.league === "int").length,
        fixtureCount: internationalFixtures.length,
        updatedAt: now,
        fixturesUpdatedAt: now,
        homeAdvantagePct: 100,
      },
    },
  }
}


/**
 * Keep the complete country catalogue available to manual simulation, even
 * when those countries have no fixture in the current 30-day window.
 * Older saved boards used competition-specific IDs, so normalize to int-{ESPN
 * ID} and remap fixture references to avoid duplicate countries.
 */
async function withNationalTeamDirectory(board: Board): Promise<Board> {
  const directory = await getNationalTeamDirectory().catch(() => [])
  if (!directory.length) return board

  const byEspnId = new Map<string, Team>()
  for (const team of directory) {
    if (team.espnId) byEspnId.set(team.espnId, team)
  }

  const oldIdToCanonical = new Map<string, string>()
  const teamsWithoutEspnId: Team[] = []
  for (const current of board.teams) {
    if (current.league !== "int") continue
    if (!current.espnId || !/^\d{1,12}$/.test(current.espnId)) {
      teamsWithoutEspnId.push({ ...current, directoryOnly: false })
      continue
    }

    const canonicalId = "int-" + current.espnId
    oldIdToCanonical.set(current.id, canonicalId)
    const catalog = byEspnId.get(current.espnId)
    if (!catalog) {
      byEspnId.set(current.espnId, { ...current, id: canonicalId, directoryOnly: false })
      continue
    }

    // Keep a fixture-derived rating when it has completed-match evidence;
    // otherwise retain the directory's regional feed choice and neutral base.
    if ((current.formMatches ?? 0) > (catalog.formMatches ?? 0)) {
      byEspnId.set(current.espnId, {
        ...catalog,
        attack: current.attack,
        defense: current.defense,
        formMatches: current.formMatches,
        ratingSource: current.ratingSource ?? catalog.ratingSource,
        directoryOnly: false,
      })
    } else {
      byEspnId.set(current.espnId, { ...catalog, directoryOnly: false })
    }
  }

  const nationalTeams = [...byEspnId.values(), ...teamsWithoutEspnId]
  const fixtures = board.fixtures.map((fixture) => fixture.league !== "int"
    ? fixture
    : {
        ...fixture,
        homeId: oldIdToCanonical.get(fixture.homeId) ?? fixture.homeId,
        awayId: oldIdToCanonical.get(fixture.awayId) ?? fixture.awayId,
      })
  const now = new Date().toISOString()

  return {
    ...board,
    teams: [...board.teams.filter((team) => team.league !== "int"), ...nationalTeams],
    fixtures,
    leagueStatus: {
      ...board.leagueStatus,
      int: {
        ...board.leagueStatus.int,
        teamCount: nationalTeams.length,
        updatedAt: now,
      },
    },
  }
}

async function buildBoard(): Promise<Board> {
  const saved = snapshotBoard()
  const domesticLeagues = LEAGUES.filter((league) => !league.cup && league.id !== "int")
  const cupLeagues = LEAGUES.filter((league) => league.cup && league.id !== "int")
  const domesticLoaded = await Promise.all(domesticLeagues.map((league) => loadLeague(league.id, saved, null)))
  const index = indexSaved(saved.teams.filter((team) => !isCup(team.league)))
  domesticLoaded.forEach((result) => {
    if (!result) return
    for (const item of result.names) remember(index, item.raw, item.team)
  })
  const cupLoaded = await Promise.all(cupLeagues.map((league) => loadLeague(league.id, saved, index)))
  const loaded = new Map<LeagueId, LoadedLeague | null>()
  domesticLeagues.forEach((league, index) => loaded.set(league.id, domesticLoaded[index] ?? null))
  cupLeagues.forEach((league, index) => loaded.set(league.id, cupLoaded[index] ?? null))
  const liveCount = [...loaded.values()].filter(Boolean).length
  if (liveCount === 0) {
    const international = await getUpcomingInternationalFixtures(30).catch(() => null)
    return international ? mergeInternationalFixtures(saved, international.fixtures) : saved
  }

  const teams: Team[] = []
  const fixtures: Fixture[] = []
  const weekends = { ...saved.weekends }
  let season = saved.season
  for (const league of LEAGUES) {
    const result = loaded.get(league.id)
    if (!result) {
      teams.push(...saved.teams.filter((team) => team.league === league.id))
      fixtures.push(...saved.fixtures.filter((fixture) => fixture.league === league.id))
      continue
    }
    season = result.season
    teams.push(...result.teams)
    fixtures.push(...result.fixtures)
    weekends[league.id] = result.weekend
  }

  const updatedAt = new Date().toISOString()
  const leagueStatus = {} as Board["leagueStatus"]
  for (const league of LEAGUES) {
    const result = loaded.get(league.id)
    leagueStatus[league.id] = result
      ? {
          standings: "live",
          fixtures: result.fixturesSource,
          teamCount: result.teams.length,
          fixtureCount: result.fixtures.length,
          updatedAt,
          fixturesUpdatedAt: result.fixturesUpdatedAt,
          homeAdvantagePct: result.homeAdvantagePct,
        }
      : saved.leagueStatus[league.id]
  }
  const baseBoard: Board = {
    season,
    source: "live",
    updatedAt,
    updatedLabel: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/London",
    }).format(new Date(updatedAt)),
    teams,
    fixtures,
    weekends,
    leagueStatus,
  }
  const international = await getUpcomingInternationalFixtures(30).catch(() => null)
  return international ? mergeInternationalFixtures(baseBoard, international.fixtures) : baseBoard
}

function storedBoard(value: unknown): Board | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const board = value as Partial<Board>
  if (board.source !== "live" && board.source !== "snapshot") return null
  if (typeof board.updatedAt !== "string" || !Array.isArray(board.teams) || !Array.isArray(board.fixtures)) return null
  if (!board.weekends || typeof board.weekends !== "object" || !board.leagueStatus || typeof board.leagueStatus !== "object") return null
  return board as Board
}

async function readStoredBoard(): Promise<Board | null> {
  if (!hasFirebaseAdminCredentials()) return null
  const snapshot = await getFirebaseAdminFirestore()
    .collection("pitchlineData")
    .doc("liveBoard")
    .get()
  const data = snapshot.data()
  const savedAt = typeof data?.savedAt === "number" ? data.savedAt : 0
  // A missed cron run must not leave the app serving an arbitrarily old board.
  if (!savedAt || Date.now() - savedAt > 36 * 60 * 60 * 1000) return null
  return storedBoard(data?.board)
}

/**
 * Best Picks needs verified ESPN kickoff timestamps for saved slips. If the
 * scheduled Firestore board is missing or stale, refresh it rather than
 * rendering the bundled fixtures that contain only human-readable date labels.
 */
export async function getBoardSnapshot(): Promise<Board> {
  try {
    const saved = await readStoredBoard()
    if (saved?.source === "live" && saved.fixtures.every((fixture) =>
      typeof fixture.kickoffAt === "string" && Number.isFinite(Date.parse(fixture.kickoffAt))
    )) return withNationalTeamDirectory(saved)
  } catch (error) {
    console.warn("[pitchline/board] Saved snapshot unavailable; rebuilding live board", {
      message: error instanceof Error ? error.message : "unknown error",
    })
  }

  try {
    return await refreshLiveBoard()
  } catch (error) {
    console.warn("[pitchline/board] Live first-render refresh failed; using bundled fallback", {
      message: error instanceof Error ? error.message : "unknown error",
    })
    return withNationalTeamDirectory(snapshotBoard())
  }
}

/** Called only by the protected daily refresh job. */
export async function refreshLiveBoard(): Promise<Board> {
  if (!hasFirebaseAdminCredentials()) {
    throw new Error("Firebase Admin credentials are not available to the Production runtime.")
  }
  const board = await withNationalTeamDirectory(await buildBoard())
  const domesticLeagues = LEAGUES.filter((league) => league.id !== "int")
  const liveLeagueCount = domesticLeagues.filter(
    (league) => board.leagueStatus[league.id]?.standings === "live",
  ).length
  const minimumLiveLeagues = Math.max(5, Math.ceil(domesticLeagues.length * 0.45))
  const minimumTeams = Math.max(
    80,
    Math.floor(TEAMS.filter((team) => team.league !== "int").length * 0.45),
  )

  // Never replace a good database snapshot with an incomplete ESPN outage.
  const domesticTeamCount = board.teams.filter((team) => team.league !== "int").length
  if (board.source !== "live" || liveLeagueCount < minimumLiveLeagues || domesticTeamCount < minimumTeams) {
    throw new Error(
      `ESPN board refresh coverage too low (live leagues ${liveLeagueCount}/${domesticLeagues.length}; teams ${board.teams.length}/${minimumTeams}).`,
    )
  }

  await getFirebaseAdminFirestore()
    .collection("pitchlineData")
    .doc("liveBoard")
    .set({ schemaVersion: 1, savedAt: Date.now(), board: JSON.parse(JSON.stringify(board)) as Board })

  cache = { at: Date.now(), ttl: BOARD_MEMORY_CACHE_MS, board }
  return board
}

/**
 * Prefer the shared Firestore board. If the shared credential or stored
 * snapshot is unavailable, rebuild from ESPN rather than returning the static
 * snapshot: those fallback teams do not have the ESPN IDs needed by Pro squad
 * intelligence. The in-process cache prevents repeated ESPN pulls per warm
 * function instance while the shared Firestore integration is being repaired.
 */
export function getLiveBoard(): Promise<Board> {
  if (cache && Date.now() - cache.at < cache.ttl) return Promise.resolve(cache.board)
  if (!inflight) {
    inflight = (async () => {
      let saved: Board | null = null
      try {
        saved = await readStoredBoard()
      } catch (error) {
        console.warn("[pitchline/board] Firestore board unavailable; rebuilding from ESPN", {
          message: error instanceof Error ? error.message : "unknown error",
        })
      }

      if (saved?.source === "live") {
        const enriched = await withNationalTeamDirectory(saved)
        cache = { at: Date.now(), ttl: TTL_MS, board: enriched }
        return enriched
      }

      try {
        const live = await withNationalTeamDirectory(await buildBoard())
        if (live.source === "live") {
          cache = { at: Date.now(), ttl: TTL_MS, board: live }
          return live
        }
        const fallback = await withNationalTeamDirectory(saved ?? live ?? snapshotBoard())
        cache = { at: Date.now(), ttl: BOARD_MEMORY_CACHE_MS, board: fallback }
        return fallback
      } catch (error) {
        console.error("[pitchline/board] ESPN fallback failed; using last known board", {
          message: error instanceof Error ? error.message : "unknown error",
        })
        const fallback = await withNationalTeamDirectory(saved ?? cache?.board ?? snapshotBoard())
        cache = { at: Date.now(), ttl: 15 * 1000, board: fallback }
        return fallback
      }
    })().finally(() => {
      inflight = null
    })
  }
  return inflight
}

export type FormGame = { gf: number; ga: number }
export type FormResult = {
  home: { games: FormGame[] } | null
  away: { games: FormGame[] } | null
}

const FEED_SLUGS = new Set([
  ...Object.values(SOURCES).map((source) => source.slug),
  ...INTERNATIONAL_COMPETITIONS.map((competition) => competition.slug),
])
const formCache = new Map<string, { at: number; games: FormGame[] | null }>()

function scoreNum(score: unknown): number | null {
  if (typeof score === "number" && Number.isFinite(score)) return score
  if (typeof score === "string" && score.trim() && Number.isFinite(Number(score))) return Number(score)
  if (score && typeof score === "object" && "value" in score) {
    const value = (score as { value?: unknown }).value
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function isFinal(event: Record<string, unknown>): boolean {
  const competition = (event.competitions as Record<string, unknown>[] | undefined)?.[0]
  const status = (competition?.status ?? event.status) as
    | { type?: { name?: string; state?: string; completed?: boolean } }
    | string
    | undefined
  if (typeof status === "string") return status.includes("FULL_TIME")
  const type = status?.type
  if (!type) return false
  if (type.completed || type.state === "post") return true
  return String(type.name ?? "").includes("FULL_TIME")
}

async function recentGames(slug: string, espnId: string): Promise<FormGame[] | null> {
  if (!FEED_SLUGS.has(slug) || !/^\d{1,12}$/.test(espnId)) return null
  const key = `${slug}:${espnId}`
  const hit = formCache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.games
  const json = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${espnId}/schedule`)
  const events = (json?.events as Record<string, unknown>[] | undefined) ?? []
  const games: FormGame[] = []
  const newestFirst = [...events].sort((left, right) => {
    const leftDate = new Date(String(left.date ?? "")).getTime()
    const rightDate = new Date(String(right.date ?? "")).getTime()
    return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0)
  })
  for (const event of newestFirst) {
    if (!isFinal(event)) continue
    const competition = (
      event.competitions as { competitors?: { team?: { id?: string | number }; score?: unknown }[] }[] | undefined
    )?.[0]
    const sides = competition?.competitors ?? []
    const us = sides.find((side) => String(side.team?.id ?? "") === espnId)
    const them = sides.find((side) => side !== us)
    if (!us || !them) continue
    const gf = scoreNum(us.score)
    const ga = scoreNum(them.score)
    if (gf === null || ga === null) continue
    games.push({ gf, ga })
    if (games.length >= 10) break
  }
  const result = games.length ? games : null
  formCache.set(key, { at: Date.now(), games: result })
  return result
}

export async function getRecentForm(input: {
  homeSlug: string
  homeEspn: string
  awaySlug: string
  awayEspn: string
}): Promise<FormResult> {
  const [home, away] = await Promise.all([
    input.homeEspn ? recentGames(input.homeSlug, input.homeEspn) : Promise.resolve(null),
    input.awayEspn ? recentGames(input.awaySlug, input.awayEspn) : Promise.resolve(null),
  ])
  return {
    home: home ? { games: home } : null,
    away: away ? { games: away } : null,
  }
}
