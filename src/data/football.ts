import { MORE_FIXTURES, MORE_TEAMS, MORE_WEEKENDS } from "@/data/more-leagues"

export type LeagueId =
  | "eng"
  | "esp"
  | "ita"
  | "ger"
  | "fra"
  | "ch"
  | "ned"
  | "por"
  | "tur"
  | "ksa"
  | "mls"
  | "bra"
  | "mx"
  | "ucl"
  | "uel"
  | "uecl"

export type Team = {
  id: string
  name: string
  short: string
  league: LeagueId
  /** Saved goals scored per match. Live tables replace this when the feed is up. */
  attack: number
  /** Saved goals conceded per match. Lower is tighter. */
  defense: number
  mark: string
  ink: string
  scorers: [string, string, string]
  /** ESPN team id when the live feed built this club. */
  espnId?: string
  /** ESPN league slug the recent-form feed should use. */
  feedSlug?: string
  /** League the attack and defense rates actually come from. */
  rateLeague?: LeagueId
  /** Optional, source-attributed xG and xGA per match. Never inferred from goals. */
  xgFor?: number
  xgAgainst?: number
  xgSource?: string
}

export type Fixture = {
  id: string
  league: LeagueId
  homeId: string
  awayId: string
  when: string
}

export const SEASON = "2026/27"

export const LEAGUES: { id: LeagueId; name: string; short: string; place: string; cup?: boolean }[] = [
  { id: "eng", name: "Premier League", short: "Premier League", place: "England" },
  { id: "esp", name: "La Liga", short: "La Liga", place: "Spain" },
  { id: "ita", name: "Serie A", short: "Serie A", place: "Italy" },
  { id: "ger", name: "Bundesliga", short: "Bundesliga", place: "Germany" },
  { id: "fra", name: "Ligue 1", short: "Ligue 1", place: "France" },
  { id: "ch", name: "Championship", short: "Championship", place: "England" },
  { id: "ned", name: "Eredivisie", short: "Eredivisie", place: "Netherlands" },
  { id: "por", name: "Liga Portugal", short: "Portugal", place: "Portugal" },
  { id: "tur", name: "Süper Lig", short: "Süper Lig", place: "Turkey" },
  { id: "ksa", name: "Saudi Pro League", short: "Saudi", place: "Saudi Arabia" },
  { id: "mls", name: "MLS", short: "MLS", place: "United States" },
  { id: "bra", name: "Brasileirão Série A", short: "Brasileirão", place: "Brazil" },
  { id: "mx", name: "Liga MX", short: "Liga MX", place: "Mexico" },
  { id: "ucl", name: "Champions League", short: "Champions", place: "Europe", cup: true },
  { id: "uel", name: "Europa League", short: "Europa", place: "Europe", cup: true },
  { id: "uecl", name: "Conference League", short: "Conference", place: "Europe", cup: true },
]

function t(
  id: string,
  name: string,
  short: string,
  league: LeagueId,
  attack: number,
  defense: number,
  mark: string,
  ink: string,
  scorers: [string, string, string],
): Team {
  return { id, name, short, league, attack, defense, mark, ink, scorers }
}

const W = "#f6f4ef"
const N = "#1a1c19"

export const TEAMS: Team[] = [
  t("eng-ars", "Arsenal", "ARS", "eng", 1.5, 0.5, "#e30613", W, ["Saka", "Havertz", "Ødegaard"]),
  t("eng-bha", "Brighton", "BHA", "eng", 2.6, 0.7, "#0057b8", W, ["Groß", "Kostoulas", "Ayari"]),
  t("eng-mci", "Manchester City", "MCI", "eng", 2.1, 1.3, "#6cabdd", N, ["Haaland", "Cherki", "Semenyo"]),
  t("eng-liv", "Liverpool", "LIV", "eng", 1.4, 1.0, "#c8102e", W, ["Isak", "Gakpo", "Wirtz"]),
  t("eng-che", "Chelsea", "CHE", "eng", 1.9, 1.6, "#034694", W, ["João Pedro", "Rogers", "Palmer"]),
  t("eng-eve", "Everton", "EVE", "eng", 1.2, 1.0, "#003399", W, ["Barry", "Dewsbury-Hall", "Beto"]),
  t("eng-bou", "Bournemouth", "BOU", "eng", 1.6, 1.4, "#d4121c", W, ["Evanilson", "Tavernier", "Kluivert"]),
  t("eng-bre", "Brentford", "BRE", "eng", 1.6, 1.1, "#e30613", W, ["Schade", "Thiago", "Lewis-Potter"]),
  t("eng-lee", "Leeds United", "LEE", "eng", 1.0, 0.8, "#ffcd00", N, ["Calvert-Lewin", "Okafor", "James"]),
  t("eng-avl", "Aston Villa", "AVL", "eng", 1.4, 1.7, "#95bfe5", N, ["Jackson", "McGinn", "Tielemans"]),
  t("eng-tot", "Tottenham", "TOT", "eng", 1.0, 1.1, "#132257", W, ["van Hecke", "Solanke", "Marmoush"]),
  t("eng-new", "Newcastle", "NEW", "eng", 1.3, 1.6, "#241f20", W, ["Barnes", "Willock", "Elanga"]),
  t("eng-hul", "Hull City", "HUL", "eng", 1.1, 1.1, "#f5a300", N, ["Belloumi", "McBurnie", "Kamara"]),
  t("eng-ips", "Ipswich Town", "IPS", "eng", 1.5, 2.0, "#0033a0", W, ["Enciso", "Clarke", "Flemming"]),
  t("eng-ful", "Fulham", "FUL", "eng", 1.0, 1.2, "#1a1c19", W, ["King", "Jiménez", "Muniz"]),
  t("eng-nfo", "Nottingham Forest", "NFO", "eng", 0.9, 1.3, "#dd0000", W, ["Delap", "Ndoye", "Gibbs-White"]),
  t("eng-cov", "Coventry City", "COV", "eng", 1.0, 1.9, "#6ec1e4", N, ["Rudoni", "Sakamoto", "Simms"]),
  t("eng-mun", "Manchester United", "MUN", "eng", 1.4, 1.9, "#da291c", W, ["Mbeumo", "Fernandes", "Cunha"]),
  t("eng-sun", "Sunderland", "SUN", "eng", 0.8, 1.7, "#e30613", W, ["Brobbey", "Le Fée", "Isidor"]),
  t("eng-cry", "Crystal Palace", "CRY", "eng", 1.0, 2.4, "#1b458f", W, ["Mateta", "Mitchell", "Sarr"]),

  t("esp-bar", "Barcelona", "BAR", "esp", 4.0, 1.08, "#a50044", W, ["Raphinha", "Yamal", "Fermín"]),
  t("esp-rma", "Real Madrid", "RMA", "esp", 2.58, 0.83, "#0c1c4c", W, ["Mbappé", "Bellingham", "Güler"]),
  t("esp-atm", "Atlético Madrid", "ATM", "esp", 1.92, 0.83, "#c60c30", W, ["Baena", "Simeone", "David"]),
  t("esp-bet", "Real Betis", "BET", "esp", 1.67, 1.25, "#00954c", W, ["Isco", "Ezzalzouli", "Bakambu"]),
  t("esp-rso", "Real Sociedad", "RSO", "esp", 1.75, 1.67, "#0067b1", W, ["Óskarsson", "Sucic", "Oyarzabal"]),
  t("esp-sev", "Sevilla", "SEV", "esp", 1.42, 1.58, "#d0002b", W, ["Romero", "Lukébakio", "Ocampos"]),
  t("esp-ath", "Athletic Club", "ATH", "esp", 1.36, 1.0, "#ee1c25", W, ["Berenguer", "Williams", "Sancet"]),
  t("esp-vil", "Villarreal", "VIL", "esp", 1.42, 1.25, "#ffe200", N, ["Mikautadze", "Pérez", "Comesaña"]),
  t("esp-dep", "Deportivo", "DEP", "esp", 1.25, 1.17, "#004b93", W, ["Aubameyang", "Yeremay", "Mella"]),
  t("esp-rac", "Racing Santander", "RAC", "esp", 1.42, 2.5, "#007a33", W, ["Zabiri", "Vicente", "Arana"]),
  t("esp-cel", "Celta Vigo", "CEL", "esp", 0.83, 0.83, "#8ac3ee", N, ["Swedberg", "Larsen", "Alfon"]),
  t("esp-ala", "Alavés", "ALA", "esp", 1.25, 1.42, "#0055a5", W, ["Boyé", "Mariano", "García"]),
  t("esp-esp", "Espanyol", "ESP", "esp", 1.08, 1.17, "#007fc8", W, ["Roberto", "Puado", "Jofre"]),
  t("esp-ray", "Rayo Vallecano", "RAY", "esp", 1.36, 1.91, "#e30613", W, ["Camello", "García", "De Frutos"]),
  t("esp-get", "Getafe", "GET", "esp", 0.67, 1.5, "#004fa3", W, ["Satriano", "Mayoral", "Mata"]),
  t("esp-osa", "Osasuna", "OSA", "esp", 1.0, 1.92, "#d21034", W, ["Budimir", "Oroz", "Ibáñez"]),
  t("esp-lev", "Levante", "LEV", "esp", 1.33, 1.75, "#0b3d91", W, ["Brugui", "Morales", "Gómez"]),
  t("esp-elc", "Elche", "ELC", "esp", 1.17, 1.67, "#1f7a3a", W, ["Niño", "Josán", "Mourad"]),
  t("esp-val", "Valencia", "VAL", "esp", 0.67, 1.67, "#ee3524", W, ["Pepelu", "Duro", "López"]),
  t("esp-mal", "Málaga", "MAL", "esp", 0.75, 1.92, "#1b4f9c", W, ["Niño", "Loren", "Febas"]),

  t("ita-laz", "Lazio", "LAZ", "ita", 2.27, 0.82, "#87d8f7", N, ["Isaksen", "Noslin", "Frattesi"]),
  t("ita-int", "Inter", "INT", "ita", 2.55, 1.18, "#010e80", W, ["Thuram", "Lautaro", "Esposito"]),
  t("ita-rom", "Roma", "ROM", "ita", 2.82, 0.91, "#8e1f2f", W, ["Malen", "Soulé", "Dybala"]),
  t("ita-mil", "Milan", "MIL", "ita", 2.09, 1.18, "#fb090b", W, ["Cissè", "Rabiot", "Pulisic"]),
  t("ita-com", "Como", "COM", "ita", 1.64, 0.91, "#001f5b", W, ["Douvikas", "Paz", "Belotti"]),
  t("ita-fro", "Frosinone", "FRO", "ita", 2.18, 1.36, "#ffd200", N, ["Raimondo", "Calò", "Caso"]),
  t("ita-juv", "Juventus", "JUV", "ita", 1.36, 1.09, "#1a1c19", W, ["Kolo Muani", "Yıldız", "Conceição"]),
  t("ita-bol", "Bologna", "BOL", "ita", 1.45, 1.27, "#1a2f6b", W, ["Orsolini", "Bernardeschi", "Pobega"]),
  t("ita-cag", "Cagliari", "CAG", "ita", 0.91, 1.36, "#8b1e3f", W, ["Maldini", "Luvumbo", "Zortea"]),
  t("ita-nap", "Napoli", "NAP", "ita", 1.64, 1.27, "#12a0d7", W, ["De Bruyne", "Højlund", "McTominay"]),
  t("ita-tor", "Torino", "TOR", "ita", 1.36, 1.55, "#8b1e3f", W, ["Adams", "Vlašić", "Zapata"]),
  t("ita-ata", "Atalanta", "ATA", "ita", 1.55, 1.82, "#1a1c19", W, ["Krstović", "Lookman", "De Ketelaere"]),
  t("ita-gen", "Genoa", "GEN", "ita", 1.0, 1.45, "#a50034", W, ["Osmajic", "Pinamonti", "Vitinha"]),
  t("ita-lec", "Lecce", "LEC", "ita", 1.09, 2.0, "#ffd100", N, ["Coulibaly", "Maleh", "Siebert"]),
  t("ita-fio", "Fiorentina", "FIO", "ita", 1.55, 2.27, "#582c83", W, ["Pellegrino", "Kean", "Gudmundsson"]),
  t("ita-par", "Parma", "PAR", "ita", 0.82, 1.55, "#1a1c19", "#ffd100", ["Romero", "Bonny", "Man"]),
  t("ita-sas", "Sassuolo", "SAS", "ita", 1.45, 2.64, "#1a6b3c", W, ["Adžić", "Berardi", "Laurienté"]),
  t("ita-mon", "Monza", "MON", "ita", 1.55, 2.27, "#e30613", W, ["Varela", "Colombo", "Djuric"]),
  t("ita-ven", "Venezia", "VEN", "ita", 0.73, 1.91, "#f6891f", N, ["Akor", "Hainaut", "Yeboah"]),
  t("ita-udi", "Udinese", "UDI", "ita", 1.09, 2.27, "#1a1c19", W, ["Ekkelenkamp", "Zaniolo", "Kamara"]),

  t("ger-bay", "Bayern Munich", "BAY", "ger", 3.22, 1.0, "#dc052d", W, ["Kane", "Olise", "Díaz"]),
  t("ger-bvb", "Dortmund", "BVB", "ger", 1.78, 0.78, "#fde100", N, ["Nmecha", "Silva", "Adeyemi"]),
  t("ger-scf", "Freiburg", "SCF", "ger", 2.22, 1.11, "#1a1c19", W, ["Suzuki", "Matanović", "Grifo"]),
  t("ger-rbl", "RB Leipzig", "RBL", "ger", 3.0, 1.44, "#dd0741", W, ["Nkunku", "Nusa", "Rômulo"]),
  t("ger-b04", "Leverkusen", "B04", "ger", 2.22, 1.89, "#e32221", W, ["Schick", "Boniface", "Adli"]),
  t("ger-svw", "Werder Bremen", "SVW", "ger", 1.89, 1.67, "#1d4e3a", W, ["Füllkrug", "Grüll", "Ducksch"]),
  t("ger-elv", "Elversberg", "ELV", "ger", 1.89, 2.0, "#c8102e", W, ["Krattenmacher", "Petkov", "Keidel"]),
  t("ger-vfb", "Stuttgart", "VFB", "ger", 1.67, 1.67, "#e30613", W, ["Demirović", "Undav", "Führich"]),
  t("ger-tsg", "Hoffenheim", "TSG", "ger", 1.78, 1.89, "#1961b3", W, ["Kramarić", "Hložek", "Bischof"]),
  t("ger-sge", "Frankfurt", "SGE", "ger", 1.67, 2.22, "#1a1c19", W, ["Ebnoutalib", "Burkardt", "Knauff"]),
  t("ger-hsv", "Hamburg", "HSV", "ger", 1.11, 2.22, "#005ca9", W, ["Muheim", "Glatzel", "Königsdörffer"]),
  t("ger-m05", "Mainz", "M05", "ger", 2.0, 2.11, "#c3141c", W, ["Tietz", "Amiri", "Lee"]),
  t("ger-scp", "Paderborn", "SCP", "ger", 0.89, 1.22, "#003399", W, ["Tigges", "Pieringer", "Philippe"]),
  t("ger-fca", "Augsburg", "FCA", "ger", 2.22, 2.22, "#ba3733", W, ["Gregoritsch", "Essende", "Vargas"]),
  t("ger-koe", "Köln", "KOE", "ger", 1.11, 1.56, "#ed1c24", W, ["El Mala", "Dallinga", "Ache"]),
  t("ger-fcu", "Union Berlin", "FCU", "ger", 0.78, 2.33, "#e30613", W, ["Haberer", "Skarke", "Latte Lath"]),
  t("ger-s04", "Schalke", "S04", "ger", 0.56, 1.22, "#004b93", W, ["Adamu", "Wöber", "Karaman"]),
  t("ger-bmg", "Gladbach", "BMG", "ger", 1.33, 2.78, "#1a1c19", W, ["Scally", "Machino", "Lidberg"]),

  t("fra-psg", "Paris Saint-Germain", "PSG", "fra", 2.2, 1.0, "#004170", W, ["Torres", "Hakimi", "Dembélé"]),
  t("fra-lil", "Lille", "LIL", "fra", 1.4, 0.7, "#e01a22", W, ["Zhegrova", "Haraldsson", "André"]),
  t("fra-pfc", "Paris FC", "PFC", "fra", 1.7, 1.0, "#1a2744", W, ["Sinayoko", "Gory", "Guilavogui"]),
  t("fra-om", "Marseille", "OM", "fra", 2.2, 1.4, "#2faee0", N, ["Gouiri", "Harit", "Greenwood"]),
  t("fra-ol", "Lyon", "OL", "fra", 1.5, 0.9, "#0033a0", W, ["Nuamah", "Tolisso", "Athekame"]),
  t("fra-nic", "Nice", "NIC", "fra", 1.5, 1.2, "#1a1c19", W, ["Wahi", "Diop", "Hein"]),
  t("fra-asm", "Monaco", "ASM", "fra", 1.3, 1.1, "#e30613", W, ["Brunner", "Golovin", "Embolo"]),
  t("fra-ren", "Rennes", "REN", "fra", 2.1, 2.1, "#e30613", W, ["Lepaul", "Dia", "Szymański"]),
  t("fra-sbr", "Brest", "SBR", "fra", 1.8, 1.2, "#ed1c24", W, ["Ajorque", "Doumbia", "Sima"]),
  t("fra-lor", "Lorient", "LOR", "fra", 0.9, 0.8, "#f36f21", N, ["Katseris", "Kroupi", "Pagis"]),
  t("fra-rcl", "Lens", "RCL", "fra", 1.7, 1.5, "#ffd100", N, ["Thauvin", "Sotoca", "Frankowski"]),
  t("fra-tfc", "Toulouse", "TFC", "fra", 1.5, 1.4, "#5c2d6e", W, ["Tengstedt", "Cásseres", "Magri"]),
  t("fra-rcs", "Strasbourg", "RCS", "fra", 1.8, 2.2, "#009fe3", N, ["Yassine", "Nanasi", "Emegha"]),
  t("fra-aux", "Auxerre", "AUX", "fra", 1.3, 2.4, "#1a1c19", W, ["Archer", "Namaso", "Faivre"]),
  t("fra-lem", "Le Mans", "LEM", "fra", 1.2, 1.9, "#c8102e", W, ["Mafouta", "Bourabaa", "Eyoum"]),
  t("fra-ang", "Angers", "ANG", "fra", 0.9, 1.9, "#1a1c19", W, ["Allevinah", "Niane", "Bahoya"]),
  t("fra-tro", "Troyes", "TRO", "fra", 0.7, 1.7, "#0055a5", W, ["Ripart", "Tormin", "Diakité"]),
  t("fra-hac", "Le Havre", "HAC", "fra", 0.9, 2.2, "#6badd6", N, ["Maja", "Soumaré", "Kechta"]),
  ...(MORE_TEAMS as Team[]),
]

const BY_ID = new Map(TEAMS.map((team) => [team.id, team]))

export function teamById(id: string): Team | undefined {
  return BY_ID.get(id)
}

export function teamsIn(league: LeagueId): Team[] {
  return TEAMS.filter((team) => team.league === league)
}

export function leagueName(id: LeagueId): string {
  return LEAGUES.find((league) => league.id === id)?.name ?? id
}

export function leagueShort(id: LeagueId): string {
  return LEAGUES.find((league) => league.id === id)?.short ?? id
}

export function isCup(id: LeagueId): boolean {
  return Boolean(LEAGUES.find((league) => league.id === id)?.cup)
}

/**
 * Coarse association-level proxy, not calibrated club Elo or club strength.
 * Championship uses a desk estimate; non-UEFA competitions remain neutral.
 * Cross-league predictions are exploratory until validated against historical fixtures.
 */
export const LEAGUE_WEIGHT: Record<LeagueId, number> = {
  eng: 1,
  esp: 86.493 / 107.685,
  ita: 91.732 / 107.685,
  ger: 84.973 / 107.685,
  fra: 72.296 / 107.685,
  ch: 0.6,
  ned: 56.395 / 107.685,
  por: 69.15 / 107.685,
  tur: 53.075 / 107.685,
  ksa: 1,
  mls: 1,
  bra: 1,
  mx: 1,
  ucl: 1,
  uel: 1,
  uecl: 1,
}

export function leagueWeight(id: LeagueId): number {
  return LEAGUE_WEIGHT[id] ?? 1
}

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

let weightTeams: Team[] | null = null
let weightNames: Map<string, LeagueId> | null = null

function domesticNames(teams: Team[]): Map<string, LeagueId> {
  if (weightTeams === teams && weightNames) return weightNames
  const map = new Map<string, LeagueId>()
  for (const team of teams) {
    if (isCup(team.league)) continue
    map.set(foldName(team.name), team.rateLeague ?? team.league)
  }
  weightTeams = teams
  weightNames = map
  return map
}

/** Where a club's goals-per-game number was earned. Cups fall back to a domestic name match. */
export function rateLeagueOf(team: Team, teams: Team[]): LeagueId {
  if (team.rateLeague) return team.rateLeague
  if (!isCup(team.league)) return team.league
  return domesticNames(teams).get(foldName(team.name)) ?? team.league
}

export type RateSample = {
  played: number
  attack: number
  defense: number
  xgAttack?: number
  xgDefense?: number
  xgSource?: string
}

export function formRate(
  games: { gf: number; ga: number; xgf?: number; xga?: number; xgSource?: string }[] | undefined,
  take: number,
): RateSample | null {
  if (!games?.length || take <= 0) return null
  const slice = games.slice(0, take)
  const halfLife = Math.max(1, take / 2)
  let totalWeight = 0
  let gf = 0
  let ga = 0
  let xgf = 0
  let xga = 0
  const xgSources = new Set(slice.map((game) => game.xgSource).filter((value): value is string => Boolean(value)))
  const hasCompleteXg = slice.every((game) =>
    typeof game.xgf === "number" && Number.isFinite(game.xgf) &&
    typeof game.xga === "number" && Number.isFinite(game.xga) &&
    typeof game.xgSource === "string" && game.xgSource.length > 0,
  ) && xgSources.size === 1
  slice.forEach((game, index) => {
    const weight = Math.exp((-Math.LN2 * index) / halfLife)
    totalWeight += weight
    gf += game.gf * weight
    ga += game.ga * weight
    if (hasCompleteXg) {
      xgf += game.xgf! * weight
      xga += game.xga! * weight
    }
  })
  return {
    played: slice.length,
    attack: Math.round((gf / (totalWeight || 1)) * 100) / 100,
    defense: Math.round((ga / (totalWeight || 1)) * 100) / 100,
    ...(hasCompleteXg ? {
      xgAttack: Math.round((xgf / (totalWeight || 1)) * 100) / 100,
      xgDefense: Math.round((xga / (totalWeight || 1)) * 100) / 100,
      xgSource: [...xgSources][0],
    } : {}),
  }
}mport { MORE_FIXTURES, MORE_TEAMS, MORE_WEEKENDS } from "@/data/more-leagues"

export type LeagueId =
  | "eng"
  | "esp"
  | "ita"
  | "ger"
  | "fra"
  | "ch"
  | "ned"
  | "por"
  | "tur"
  | "ksa"
  | "mls"
  | "bra"
  | "mx"
  | "ucl"
  | "uel"
  | "uecl"

export type Team = {
  id: string
  name: string
  short: string
  league: LeagueId
  /** Saved goals scored per match. Live tables replace this when the feed is up. */
  attack: number
  /** Saved goals conceded per match. Lower is tighter. */
  defense: number
  mark: string
  ink: string
  scorers: [string, string, string]
  /** ESPN team id when the live feed built this club. */
  espnId?: string
  /** ESPN league slug the recent-form feed should use. */
  feedSlug?: string
  /** League the attack and defense rates actually come from. */
  rateLeague?: LeagueId
  /** Optional, source-attributed xG and xGA per match. Never inferred from goals. */
  xgFor?: number
  xgAgainst?: number
  xgSource?: string
}

export type Fixture = {
  id: string
  league: LeagueId
  homeId: string
  awayId: string
  when: string
}

export const SEASON = "2026/27"

export const LEAGUES: { id: LeagueId; name: string; short: string; place: string; cup?: boolean }[] = [
  { id: "eng", name: "Premier League", short: "Premier League", place: "England" },
  { id: "esp", name: "La Liga", short: "La Liga", place: "Spain" },
  { id: "ita", name: "Serie A", short: "Serie A", place: "Italy" },
  { id: "ger", name: "Bundesliga", short: "Bundesliga", place: "Germany" },
  { id: "fra", name: "Ligue 1", short: "Ligue 1", place: "France" },
  { id: "ch", name: "Championship", short: "Championship", place: "England" },
  { id: "ned", name: "Eredivisie", short: "Eredivisie", place: "Netherlands" },
  { id: "por", name: "Liga Portugal", short: "Portugal", place: "Portugal" },
  { id: "tur", name: "Süper Lig", short: "Süper Lig", place: "Turkey" },
  { id: "ksa", name: "Saudi Pro League", short: "Saudi", place: "Saudi Arabia" },
  { id: "mls", name: "MLS", short: "MLS", place: "United States" },
  { id: "bra", name: "Brasileirão Série A", short: "Brasileirão", place: "Brazil" },
  { id: "mx", name: "Liga MX", short: "Liga MX", place: "Mexico" },
  { id: "ucl", name: "Champions League", short: "Champions", place: "Europe", cup: true },
  { id: "uel", name: "Europa League", short: "Europa", place: "Europe", cup: true },
  { id: "uecl", name: "Conference League", short: "Conference", place: "Europe", cup: true },
]

function t(
  id: string,
  name: string,
  short: string,
  league: LeagueId,
  attack: number,
  defense: number,
  mark: string,
  ink: string,
  scorers: [string, string, string],
): Team {
  return { id, name, short, league, attack, defense, mark, ink, scorers }
}

const W = "#f6f4ef"
const N = "#1a1c19"

export const TEAMS: Team[] = [
  t("eng-ars", "Arsenal", "ARS", "eng", 1.5, 0.5, "#e30613", W, ["Saka", "Havertz", "Ødegaard"]),
  t("eng-bha", "Brighton", "BHA", "eng", 2.6, 0.7, "#0057b8", W, ["Groß", "Kostoulas", "Ayari"]),
  t("eng-mci", "Manchester City", "MCI", "eng", 2.1, 1.3, "#6cabdd", N, ["Haaland", "Cherki", "Semenyo"]),
  t("eng-liv", "Liverpool", "LIV", "eng", 1.4, 1.0, "#c8102e", W, ["Isak", "Gakpo", "Wirtz"]),
  t("eng-che", "Chelsea", "CHE", "eng", 1.9, 1.6, "#034694", W, ["João Pedro", "Rogers", "Palmer"]),
  t("eng-eve", "Everton", "EVE", "eng", 1.2, 1.0, "#003399", W, ["Barry", "Dewsbury-Hall", "Beto"]),
  t("eng-bou", "Bournemouth", "BOU", "eng", 1.6, 1.4, "#d4121c", W, ["Evanilson", "Tavernier", "Kluivert"]),
  t("eng-bre", "Brentford", "BRE", "eng", 1.6, 1.1, "#e30613", W, ["Schade", "Thiago", "Lewis-Potter"]),
  t("eng-lee", "Leeds United", "LEE", "eng", 1.0, 0.8, "#ffcd00", N, ["Calvert-Lewin", "Okafor", "James"]),
  t("eng-avl", "Aston Villa", "AVL", "eng", 1.4, 1.7, "#95bfe5", N, ["Jackson", "McGinn", "Tielemans"]),
  t("eng-tot", "Tottenham", "TOT", "eng", 1.0, 1.1, "#132257", W, ["van Hecke", "Solanke", "Marmoush"]),
  t("eng-new", "Newcastle", "NEW", "eng", 1.3, 1.6, "#241f20", W, ["Barnes", "Willock", "Elanga"]),
  t("eng-hul", "Hull City", "HUL", "eng", 1.1, 1.1, "#f5a300", N, ["Belloumi", "McBurnie", "Kamara"]),
  t("eng-ips", "Ipswich Town", "IPS", "eng", 1.5, 2.0, "#0033a0", W, ["Enciso", "Clarke", "Flemming"]),
  t("eng-ful", "Fulham", "FUL", "eng", 1.0, 1.2, "#1a1c19", W, ["King", "Jiménez", "Muniz"]),
  t("eng-nfo", "Nottingham Forest", "NFO", "eng", 0.9, 1.3, "#dd0000", W, ["Delap", "Ndoye", "Gibbs-White"]),
  t("eng-cov", "Coventry City", "COV", "eng", 1.0, 1.9, "#6ec1e4", N, ["Rudoni", "Sakamoto", "Simms"]),
  t("eng-mun", "Manchester United", "MUN", "eng", 1.4, 1.9, "#da291c", W, ["Mbeumo", "Fernandes", "Cunha"]),
  t("eng-sun", "Sunderland", "SUN", "eng", 0.8, 1.7, "#e30613", W, ["Brobbey", "Le Fée", "Isidor"]),
  t("eng-cry", "Crystal Palace", "CRY", "eng", 1.0, 2.4, "#1b458f", W, ["Mateta", "Mitchell", "Sarr"]),

  t("esp-bar", "Barcelona", "BAR", "esp", 4.0, 1.08, "#a50044", W, ["Raphinha", "Yamal", "Fermín"]),
  t("esp-rma", "Real Madrid", "RMA", "esp", 2.58, 0.83, "#0c1c4c", W, ["Mbappé", "Bellingham", "Güler"]),
  t("esp-atm", "Atlético Madrid", "ATM", "esp", 1.92, 0.83, "#c60c30", W, ["Baena", "Simeone", "David"]),
  t("esp-bet", "Real Betis", "BET", "esp", 1.67, 1.25, "#00954c", W, ["Isco", "Ezzalzouli", "Bakambu"]),
  t("esp-rso", "Real Sociedad", "RSO", "esp", 1.75, 1.67, "#0067b1", W, ["Óskarsson", "Sucic", "Oyarzabal"]),
  t("esp-sev", "Sevilla", "SEV", "esp", 1.42, 1.58, "#d0002b", W, ["Romero", "Lukébakio", "Ocampos"]),
  t("esp-ath", "Athletic Club", "ATH", "esp", 1.36, 1.0, "#ee1c25", W, ["Berenguer", "Williams", "Sancet"]),
  t("esp-vil", "Villarreal", "VIL", "esp", 1.42, 1.25, "#ffe200", N, ["Mikautadze", "Pérez", "Comesaña"]),
  t("esp-dep", "Deportivo", "DEP", "esp", 1.25, 1.17, "#004b93", W, ["Aubameyang", "Yeremay", "Mella"]),
  t("esp-rac", "Racing Santander", "RAC", "esp", 1.42, 2.5, "#007a33", W, ["Zabiri", "Vicente", "Arana"]),
  t("esp-cel", "Celta Vigo", "CEL", "esp", 0.83, 0.83, "#8ac3ee", N, ["Swedberg", "Larsen", "Alfon"]),
  t("esp-ala", "Alavés", "ALA", "esp", 1.25, 1.42, "#0055a5", W, ["Boyé", "Mariano", "García"]),
  t("esp-esp", "Espanyol", "ESP", "esp", 1.08, 1.17, "#007fc8", W, ["Roberto", "Puado", "Jofre"]),
  t("esp-ray", "Rayo Vallecano", "RAY", "esp", 1.36, 1.91, "#e30613", W, ["Camello", "García", "De Frutos"]),
  t("esp-get", "Getafe", "GET", "esp", 0.67, 1.5, "#004fa3", W, ["Satriano", "Mayoral", "Mata"]),
  t("esp-osa", "Osasuna", "OSA", "esp", 1.0, 1.92, "#d21034", W, ["Budimir", "Oroz", "Ibáñez"]),
  t("esp-lev", "Levante", "LEV", "esp", 1.33, 1.75, "#0b3d91", W, ["Brugui", "Morales", "Gómez"]),
  t("esp-elc", "Elche", "ELC", "esp", 1.17, 1.67, "#1f7a3a", W, ["Niño", "Josán", "Mourad"]),
  t("esp-val", "Valencia", "VAL", "esp", 0.67, 1.67, "#ee3524", W, ["Pepelu", "Duro", "López"]),
  t("esp-mal", "Málaga", "MAL", "esp", 0.75, 1.92, "#1b4f9c", W, ["Niño", "Loren", "Febas"]),

  t("ita-laz", "Lazio", "LAZ", "ita", 2.27, 0.82, "#87d8f7", N, ["Isaksen", "Noslin", "Frattesi"]),
  t("ita-int", "Inter", "INT", "ita", 2.55, 1.18, "#010e80", W, ["Thuram", "Lautaro", "Esposito"]),
  t("ita-rom", "Roma", "ROM", "ita", 2.82, 0.91, "#8e1f2f", W, ["Malen", "Soulé", "Dybala"]),
  t("ita-mil", "Milan", "MIL", "ita", 2.09, 1.18, "#fb090b", W, ["Cissè", "Rabiot", "Pulisic"]),
  t("ita-com", "Como", "COM", "ita", 1.64, 0.91, "#001f5b", W, ["Douvikas", "Paz", "Belotti"]),
  t("ita-fro", "Frosinone", "FRO", "ita", 2.18, 1.36, "#ffd200", N, ["Raimondo", "Calò", "Caso"]),
  t("ita-juv", "Juventus", "JUV", "ita", 1.36, 1.09, "#1a1c19", W, ["Kolo Muani", "Yıldız", "Conceição"]),
  t("ita-bol", "Bologna", "BOL", "ita", 1.45, 1.27, "#1a2f6b", W, ["Orsolini", "Bernardeschi", "Pobega"]),
  t("ita-cag", "Cagliari", "CAG", "ita", 0.91, 1.36, "#8b1e3f", W, ["Maldini", "Luvumbo", "Zortea"]),
  t("ita-nap", "Napoli", "NAP", "ita", 1.64, 1.27, "#12a0d7", W, ["De Bruyne", "Højlund", "McTominay"]),
  t("ita-tor", "Torino", "TOR", "ita", 1.36, 1.55, "#8b1e3f", W, ["Adams", "Vlašić", "Zapata"]),
  t("ita-ata", "Atalanta", "ATA", "ita", 1.55, 1.82, "#1a1c19", W, ["Krstović", "Lookman", "De Ketelaere"]),
  t("ita-gen", "Genoa", "GEN", "ita", 1.0, 1.45, "#a50034", W, ["Osmajic", "Pinamonti", "Vitinha"]),
  t("ita-lec", "Lecce", "LEC", "ita", 1.09, 2.0, "#ffd100", N, ["Coulibaly", "Maleh", "Siebert"]),
  t("ita-fio", "Fiorentina", "FIO", "ita", 1.55, 2.27, "#582c83", W, ["Pellegrino", "Kean", "Gudmundsson"]),
  t("ita-par", "Parma", "PAR", "ita", 0.82, 1.55, "#1a1c19", "#ffd100", ["Romero", "Bonny", "Man"]),
  t("ita-sas", "Sassuolo", "SAS", "ita", 1.45, 2.64, "#1a6b3c", W, ["Adžić", "Berardi", "Laurienté"]),
  t("ita-mon", "Monza", "MON", "ita", 1.55, 2.27, "#e30613", W, ["Varela", "Colombo", "Djuric"]),
  t("ita-ven", "Venezia", "VEN", "ita", 0.73, 1.91, "#f6891f", N, ["Akor", "Hainaut", "Yeboah"]),
  t("ita-udi", "Udinese", "UDI", "ita", 1.09, 2.27, "#1a1c19", W, ["Ekkelenkamp", "Zaniolo", "Kamara"]),

  t("ger-bay", "Bayern Munich", "BAY", "ger", 3.22, 1.0, "#dc052d", W, ["Kane", "Olise", "Díaz"]),
  t("ger-bvb", "Dortmund", "BVB", "ger", 1.78, 0.78, "#fde100", N, ["Nmecha", "Silva", "Adeyemi"]),
  t("ger-scf", "Freiburg", "SCF", "ger", 2.22, 1.11, "#1a1c19", W, ["Suzuki", "Matanović", "Grifo"]),
  t("ger-rbl", "RB Leipzig", "RBL", "ger", 3.0, 1.44, "#dd0741", W, ["Nkunku", "Nusa", "Rômulo"]),
  t("ger-b04", "Leverkusen", "B04", "ger", 2.22, 1.89, "#e32221", W, ["Schick", "Boniface", "Adli"]),
  t("ger-svw", "Werder Bremen", "SVW", "ger", 1.89, 1.67, "#1d4e3a", W, ["Füllkrug", "Grüll", "Ducksch"]),
  t("ger-elv", "Elversberg", "ELV", "ger", 1.89, 2.0, "#c8102e", W, ["Krattenmacher", "Petkov", "Keidel"]),
  t("ger-vfb", "Stuttgart", "VFB", "ger", 1.67, 1.67, "#e30613", W, ["Demirović", "Undav", "Führich"]),
  t("ger-tsg", "Hoffenheim", "TSG", "ger", 1.78, 1.89, "#1961b3", W, ["Kramarić", "Hložek", "Bischof"]),
  t("ger-sge", "Frankfurt", "SGE", "ger", 1.67, 2.22, "#1a1c19", W, ["Ebnoutalib", "Burkardt", "Knauff"]),
  t("ger-hsv", "Hamburg", "HSV", "ger", 1.11, 2.22, "#005ca9", W, ["Muheim", "Glatzel", "Königsdörffer"]),
  t("ger-m05", "Mainz", "M05", "ger", 2.0, 2.11, "#c3141c", W, ["Tietz", "Amiri", "Lee"]),
  t("ger-scp", "Paderborn", "SCP", "ger", 0.89, 1.22, "#003399", W, ["Tigges", "Pieringer", "Philippe"]),
  t("ger-fca", "Augsburg", "FCA", "ger", 2.22, 2.22, "#ba3733", W, ["Gregoritsch", "Essende", "Vargas"]),
  t("ger-koe", "Köln", "KOE", "ger", 1.11, 1.56, "#ed1c24", W, ["El Mala", "Dallinga", "Ache"]),
  t("ger-fcu", "Union Berlin", "FCU", "ger", 0.78, 2.33, "#e30613", W, ["Haberer", "Skarke", "Latte Lath"]),
  t("ger-s04", "Schalke", "S04", "ger", 0.56, 1.22, "#004b93", W, ["Adamu", "Wöber", "Karaman"]),
  t("ger-bmg", "Gladbach", "BMG", "ger", 1.33, 2.78, "#1a1c19", W, ["Scally", "Machino", "Lidberg"]),

  t("fra-psg", "Paris Saint-Germain", "PSG", "fra", 2.2, 1.0, "#004170", W, ["Torres", "Hakimi", "Dembélé"]),
  t("fra-lil", "Lille", "LIL", "fra", 1.4, 0.7, "#e01a22", W, ["Zhegrova", "Haraldsson", "André"]),
  t("fra-pfc", "Paris FC", "PFC", "fra", 1.7, 1.0, "#1a2744", W, ["Sinayoko", "Gory", "Guilavogui"]),
  t("fra-om", "Marseille", "OM", "fra", 2.2, 1.4, "#2faee0", N, ["Gouiri", "Harit", "Greenwood"]),
  t("fra-ol", "Lyon", "OL", "fra", 1.5, 0.9, "#0033a0", W, ["Nuamah", "Tolisso", "Athekame"]),
  t("fra-nic", "Nice", "NIC", "fra", 1.5, 1.2, "#1a1c19", W, ["Wahi", "Diop", "Hein"]),
  t("fra-asm", "Monaco", "ASM", "fra", 1.3, 1.1, "#e30613", W, ["Brunner", "Golovin", "Embolo"]),
  t("fra-ren", "Rennes", "REN", "fra", 2.1, 2.1, "#e30613", W, ["Lepaul", "Dia", "Szymański"]),
  t("fra-sbr", "Brest", "SBR", "fra", 1.8, 1.2, "#ed1c24", W, ["Ajorque", "Doumbia", "Sima"]),
  t("fra-lor", "Lorient", "LOR", "fra", 0.9, 0.8, "#f36f21", N, ["Katseris", "Kroupi", "Pagis"]),
  t("fra-rcl", "Lens", "RCL", "fra", 1.7, 1.5, "#ffd100", N, ["Thauvin", "Sotoca", "Frankowski"]),
  t("fra-tfc", "Toulouse", "TFC", "fra", 1.5, 1.4, "#5c2d6e", W, ["Tengstedt", "Cásseres", "Magri"]),
  t("fra-rcs", "Strasbourg", "RCS", "fra", 1.8, 2.2, "#009fe3", N, ["Yassine", "Nanasi", "Emegha"]),
  t("fra-aux", "Auxerre", "AUX", "fra", 1.3, 2.4, "#1a1c19", W, ["Archer", "Namaso", "Faivre"]),
  t("fra-lem", "Le Mans", "LEM", "fra", 1.2, 1.9, "#c8102e", W, ["Mafouta", "Bourabaa", "Eyoum"]),
  t("fra-ang", "Angers", "ANG", "fra", 0.9, 1.9, "#1a1c19", W, ["Allevinah", "Niane", "Bahoya"]),
  t("fra-tro", "Troyes", "TRO", "fra", 0.7, 1.7, "#0055a5", W, ["Ripart", "Tormin", "Diakité"]),
  t("fra-hac", "Le Havre", "HAC", "fra", 0.9, 2.2, "#6badd6", N, ["Maja", "Soumaré", "Kechta"]),
  ...(MORE_TEAMS as Team[]),
]

const BY_ID = new Map(TEAMS.map((team) => [team.id, team]))

export function teamById(id: string): Team | undefined {
  return BY_ID.get(id)
}

export function teamsIn(league: LeagueId): Team[] {
  return TEAMS.filter((team) => team.league === league)
}

export function leagueName(id: LeagueId): string {
  return LEAGUES.find((league) => league.id === id)?.name ?? id
}

export function leagueShort(id: LeagueId): string {
  return LEAGUES.find((league) => league.id === id)?.short ?? id
}

export function isCup(id: LeagueId): boolean {
  return Boolean(LEAGUES.find((league) => league.id === id)?.cup)
}

/**
 * Coarse association-level proxy, not calibrated club Elo or club strength.
 * Championship uses a desk estimate; non-UEFA competitions remain neutral.
 * Cross-league predictions are exploratory until validated against historical fixtures.
 */
export const LEAGUE_WEIGHT: Record<LeagueId, number> = {
  eng: 1,
  esp: 86.493 / 107.685,
  ita: 91.732 / 107.685,
  ger: 84.973 / 107.685,
  fra: 72.296 / 107.685,
  ch: 0.6,
  ned: 56.395 / 107.685,
  por: 69.15 / 107.685,
  tur: 53.075 / 107.685,
  ksa: 1,
  mls: 1,
  bra: 1,
  mx: 1,
  ucl: 1,
  uel: 1,
  uecl: 1,
}

export function leagueWeight(id: LeagueId): number {
  return LEAGUE_WEIGHT[id] ?? 1
}

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

let weightTeams: Team[] | null = null
let weightNames: Map<string, LeagueId> | null = null

function domesticNames(teams: Team[]): Map<string, LeagueId> {
  if (weightTeams === teams && weightNames) return weightNames
  const map = new Map<string, LeagueId>()
  for (const team of teams) {
    if (isCup(team.league)) continue
    map.set(foldName(team.name), team.rateLeague ?? team.league)
  }
  weightTeams = teams
  weightNames = map
  return map
}

/** Where a club's goals-per-game number was earned. Cups fall back to a domestic name match. */
export function rateLeagueOf(team: Team, teams: Team[]): LeagueId {
  if (team.rateLeague) return team.rateLeague
  if (!isCup(team.league)) return team.league
  return domesticNames(teams).get(foldName(team.name)) ?? team.league
}

export type RateSample = {
  played: number
  attack: number
  defense: number
  xgAttack?: number
  xgDefense?: number
  xgSource?: string
}

export function formRate(
  games: { gf: number; ga: number; xgf?: number; xga?: number }[] | undefined,
  take: number,
): RateSample | null {
  if (!games?.length || take <= 0) return null
  const slice = games.slice(0, take)
  const played = slice.length
  const halfLife = Math.max(1, take / 2)
  let totalWeight = 0
  let gf = 0
  let ga = 0
  slice.forEach((game, index) => {
    const weight = Math.exp((-Math.LN2 * index) / halfLife)
    totalWeight += weight
    gf += (typeof game.xgf === "number" && Number.isFinite(game.xgf) ? game.xgf : game.gf) * weight
    ga += (typeof game.xga === "number" && Number.isFinite(game.xga) ? game.xga : game.ga) * weight
  })
  return {
    played,
    attack: Math.round((gf / (totalWeight || 1)) * 100) / 100,
    defense: Math.round((ga / (totalWeight || 1)) * 100) / 100,
  }
}

/** Apply recent form, then league scale. Equal weights are skipped so same-league math stays put. */
export function shapePair(
  home: Team,
  away: Team,
  teams: Team[],
  level: boolean,
  homeSample: RateSample | null,
  awaySample: RateSample | null,
): { home: Team; away: Team; homeLeague: LeagueId; awayLeague: LeagueId; homeWeight: number; awayWeight: number; leveled: boolean } {
  const useXgForm = Boolean(homeSample?.xgAttack !== undefined && awaySample?.xgAttack !== undefined && homeSample.xgSource && homeSample.xgSource === awaySample.xgSource)
  let nextHome = homeSample ? {
    ...home,
    attack: useXgForm ? homeSample.xgAttack! : homeSample.attack,
    defense: useXgForm ? homeSample.xgDefense! : homeSample.defense,
    xgFor: useXgForm ? homeSample.xgAttack : undefined,
    xgAgainst: useXgForm ? homeSample.xgDefense : undefined,
    xgSource: useXgForm ? homeSample.xgSource : undefined,
  } : home
  let nextAway = awaySample ? {
    ...away,
    attack: useXgForm ? awaySample.xgAttack! : awaySample.attack,
    defense: useXgForm ? awaySample.xgDefense! : awaySample.defense,
    xgFor: useXgForm ? awaySample.xgAttack : undefined,
    xgAgainst: useXgForm ? awaySample.xgDefense : undefined,
    xgSource: useXgForm ? awaySample.xgSource : undefined,
  } : away
  const homeLeague = rateLeagueOf(home, teams)
  const awayLeague = rateLeagueOf(away, teams)
  const homeWeight = leagueWeight(homeLeague)
  const awayWeight = leagueWeight(awayLeague)
  const leveled = level && homeWeight !== awayWeight
  if (leveled) {
    nextHome = { ...nextHome, attack: nextHome.attack * homeWeight, defense: nextHome.defense / homeWeight }
    nextAway = { ...nextAway, attack: nextAway.attack * awayWeight, defense: nextAway.defense / awayWeight }
  }
  return { home: nextHome, away: nextAway, homeLeague, awayLeague, homeWeight, awayWeight, leveled }
}

export type LeagueFeedStatus = {
  standings: "live" | "snapshot"
  fixtures: "live" | "snapshot"
  teamCount: number
  fixtureCount: number
  updatedAt: string
  fixturesUpdatedAt: string
}

export type Board = {
  season: string
  source: "live" | "snapshot"
  updatedAt: string
  updatedLabel: string
  teams: Team[]
  fixtures: Fixture[]
  weekends: Record<LeagueId, string>
  leagueStatus: Record<LeagueId, LeagueFeedStatus>
}

/** Last confirmed board. Used when the live tables cannot be reached. */
export function snapshotBoard(): Board {
  return {
    season: SEASON,
    source: "snapshot",
    updatedAt: "2026-11-15T18:00:00.000Z",
    updatedLabel: "15 Nov 2026",
    teams: TEAMS,
    fixtures: FIXTURES,
    leagueStatus: Object.fromEntries(
      LEAGUES.map((league) => [
        league.id,
        {
          standings: "snapshot" as const,
          fixtures: "snapshot" as const,
          teamCount: TEAMS.filter((team) => team.league === league.id).length,
          fixtureCount: FIXTURES.filter((fixture) => fixture.league === league.id).length,
          updatedAt: "2026-11-15T18:00:00.000Z",
          fixturesUpdatedAt: "2026-11-15T18:00:00.000Z",
        },
      ]),
    ) as Record<LeagueId, LeagueFeedStatus>,
    weekends: {
      eng: "21–23 Nov",
      esp: "20–23 Nov",
      ita: "21–23 Nov",
      ger: "20–22 Nov",
      fra: "20–22 Nov",
      ch: MORE_WEEKENDS.ch,
      ned: MORE_WEEKENDS.ned,
      por: MORE_WEEKENDS.por,
      tur: MORE_WEEKENDS.tur,
      ksa: MORE_WEEKENDS.ksa,
      mls: MORE_WEEKENDS.mls,
      bra: MORE_WEEKENDS.bra,
      mx: MORE_WEEKENDS.mx,
      ucl: MORE_WEEKENDS.ucl,
      uel: MORE_WEEKENDS.uel,
      uecl: MORE_WEEKENDS.uecl,
    },
  }
}

export const FIXTURES: Fixture[] = [
  { id: "e1", league: "eng", homeId: "eng-mci", awayId: "eng-ful", when: "Sat 21 Nov · 12:30" },
  { id: "e2", league: "eng", homeId: "eng-che", awayId: "eng-lee", when: "Sat 21 Nov · 15:00" },
  { id: "e3", league: "eng", homeId: "eng-avl", awayId: "eng-sun", when: "Sat 21 Nov · 15:00" },
  { id: "e4", league: "eng", homeId: "eng-bou", awayId: "eng-nfo", when: "Sat 21 Nov · 15:00" },
  { id: "e5", league: "eng", homeId: "eng-tot", awayId: "eng-ips", when: "Sat 21 Nov · 15:00" },
  { id: "e6", league: "eng", homeId: "eng-cov", awayId: "eng-cry", when: "Sat 21 Nov · 15:00" },
  { id: "e7", league: "eng", homeId: "eng-new", awayId: "eng-ars", when: "Sat 21 Nov · 17:30" },
  { id: "e8", league: "eng", homeId: "eng-hul", awayId: "eng-bha", when: "Sun 22 Nov · 14:00" },
  { id: "e9", league: "eng", homeId: "eng-liv", awayId: "eng-mun", when: "Sun 22 Nov · 16:30" },
  { id: "e10", league: "eng", homeId: "eng-bre", awayId: "eng-eve", when: "Mon 23 Nov · 20:00" },

  { id: "s1", league: "esp", homeId: "esp-ath", awayId: "esp-esp", when: "Fri 20 Nov · 21:00" },
  { id: "s2", league: "esp", homeId: "esp-ala", awayId: "esp-dep", when: "Sat 21 Nov · 14:00" },
  { id: "s3", league: "esp", homeId: "esp-ray", awayId: "esp-val", when: "Sat 21 Nov · 16:15" },
  { id: "s4", league: "esp", homeId: "esp-sev", awayId: "esp-bet", when: "Sat 21 Nov · 18:30" },
  { id: "s5", league: "esp", homeId: "esp-rma", awayId: "esp-cel", when: "Sat 21 Nov · 21:00" },
  { id: "s6", league: "esp", homeId: "esp-bar", awayId: "esp-vil", when: "Sun 22 Nov · 14:00" },
  { id: "s7", league: "esp", homeId: "esp-rac", awayId: "esp-rso", when: "Sun 22 Nov · 16:15" },
  { id: "s8", league: "esp", homeId: "esp-osa", awayId: "esp-mal", when: "Sun 22 Nov · 18:30" },
  { id: "s9", league: "esp", homeId: "esp-get", awayId: "esp-atm", when: "Sun 22 Nov · 21:00" },
  { id: "s10", league: "esp", homeId: "esp-lev", awayId: "esp-elc", when: "Mon 23 Nov · 21:00" },

  { id: "i1", league: "ita", homeId: "ita-com", awayId: "ita-cag", when: "Sat 21 Nov · 15:00" },
  { id: "i2", league: "ita", homeId: "ita-laz", awayId: "ita-lec", when: "Sat 21 Nov · 15:00" },
  { id: "i3", league: "ita", homeId: "ita-par", awayId: "ita-rom", when: "Sat 21 Nov · 18:00" },
  { id: "i4", league: "ita", homeId: "ita-nap", awayId: "ita-tor", when: "Sat 21 Nov · 20:45" },
  { id: "i5", league: "ita", homeId: "ita-juv", awayId: "ita-ven", when: "Sun 22 Nov · 12:30" },
  { id: "i6", league: "ita", homeId: "ita-sas", awayId: "ita-gen", when: "Sun 22 Nov · 15:00" },
  { id: "i7", league: "ita", homeId: "ita-bol", awayId: "ita-udi", when: "Sun 22 Nov · 15:00" },
  { id: "i8", league: "ita", homeId: "ita-mil", awayId: "ita-fro", when: "Sun 22 Nov · 18:00" },
  { id: "i9", league: "ita", homeId: "ita-ata", awayId: "ita-int", when: "Sun 22 Nov · 20:45" },
  { id: "i10", league: "ita", homeId: "ita-mon", awayId: "ita-fio", when: "Mon 23 Nov · 20:45" },

  { id: "g1", league: "ger", homeId: "ger-bay", awayId: "ger-koe", when: "Fri 20 Nov · 20:30" },
  { id: "g2", league: "ger", homeId: "ger-b04", awayId: "ger-scp", when: "Sat 21 Nov · 15:30" },
  { id: "g3", league: "ger", homeId: "ger-bmg", awayId: "ger-bvb", when: "Sat 21 Nov · 15:30" },
  { id: "g4", league: "ger", homeId: "ger-sge", awayId: "ger-tsg", when: "Sat 21 Nov · 15:30" },
  { id: "g5", league: "ger", homeId: "ger-elv", awayId: "ger-scf", when: "Sat 21 Nov · 15:30" },
  { id: "g6", league: "ger", homeId: "ger-fcu", awayId: "ger-rbl", when: "Sat 21 Nov · 15:30" },
  { id: "g7", league: "ger", homeId: "ger-s04", awayId: "ger-vfb", when: "Sat 21 Nov · 18:30" },
  { id: "g8", league: "ger", homeId: "ger-fca", awayId: "ger-m05", when: "Sun 22 Nov · 15:30" },
  { id: "g9", league: "ger", homeId: "ger-svw", awayId: "ger-hsv", when: "Sun 22 Nov · 17:30" },

  { id: "f1", league: "fra", homeId: "fra-tro", awayId: "fra-hac", when: "Fri 20 Nov · 20:45" },
  { id: "f2", league: "fra", homeId: "fra-nic", awayId: "fra-psg", when: "Sat 21 Nov · 17:15" },
  { id: "f3", league: "fra", homeId: "fra-rcl", awayId: "fra-tfc", when: "Sat 21 Nov · 20:45" },
  { id: "f4", league: "fra", homeId: "fra-lil", awayId: "fra-ol", when: "Sat 21 Nov · 20:45" },
  { id: "f5", league: "fra", homeId: "fra-asm", awayId: "fra-aux", when: "Sat 21 Nov · 20:45" },
  { id: "f6", league: "fra", homeId: "fra-rcs", awayId: "fra-sbr", when: "Sat 21 Nov · 20:45" },
  { id: "f7", league: "fra", homeId: "fra-pfc", awayId: "fra-ang", when: "Sun 22 Nov · 15:00" },
  { id: "f8", league: "fra", homeId: "fra-lor", awayId: "fra-ren", when: "Sun 22 Nov · 17:15" },
  { id: "f9", league: "fra", homeId: "fra-om", awayId: "fra-lem", when: "Sun 22 Nov · 20:45" },
  ...(MORE_FIXTURES as Fixture[]),
]
