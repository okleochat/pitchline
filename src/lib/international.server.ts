import "server-only"

export type InternationalFixture = {
  id: string
  competition: string
  region: string
  slug: string
  kickoff: string
  status: string
  state: "upcoming" | "live" | "finished"
  home: { name: string; shortName: string; logo: string | null; score: string | null }
  away: { name: string; shortName: string; logo: string | null; score: string | null }
  venue: string | null
}

type Competition = { slug: string; name: string; region: string }

const COMPETITIONS: Competition[] = [
  { slug: "fifa.world", name: "FIFA World Cup", region: "Global" },
  { slug: "fifa.worldq", name: "FIFA World Cup Qualifiers", region: "Global" },
  { slug: "fifa.worldq.uefa", name: "World Cup Qualifiers", region: "Europe" },
  { slug: "fifa.worldq.caf", name: "World Cup Qualifiers", region: "Africa" },
  { slug: "caf.nations", name: "Africa Cup of Nations", region: "Africa" },
  { slug: "caf.nations_qual", name: "AFCON Qualifiers", region: "Africa" },
  { slug: "uefa.euro", name: "UEFA European Championship", region: "Europe" },
  { slug: "conmebol.america", name: "Copa América", region: "South America" },
  { slug: "concacaf.gold", name: "CONCACAF Gold Cup", region: "North America" },
  { slug: "afc.asian.cup", name: "AFC Asian Cup", region: "Asia" },
  { slug: "fifa.friendly", name: "Men's International Friendlies", region: "Global" },
  { slug: "fifa.friendly.w", name: "Women's International Friendlies", region: "Global" },
  { slug: "fifa.wwc", name: "FIFA Women's World Cup", region: "Global" },
]

function utcDate(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`
}

function validDate(value: string | null, fallback: string): string {
  return value && /^\d{8}$/.test(value) ? value : fallback
}

function parseScore(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "string") return String(value)
  if (value && typeof value === "object" && "value" in value) {
    const score = (value as { value?: unknown }).value
    if (typeof score === "number" || typeof score === "string") return String(score)
  }
  return null
}

function side(team: Record<string, unknown> | undefined, score: unknown) {
  if (!team) return null
  const name = String(team.displayName ?? team.name ?? "").trim()
  if (!name) return null
  return {
    name,
    shortName: String(team.shortDisplayName ?? team.abbreviation ?? name),
    logo: typeof team.logo === "string" ? team.logo : null,
    score: parseScore(score),
  }
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", "user-agent": "Pitchline/1.0" },
      next: { revalidate: 300 },
    })
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function statusOf(event: Record<string, unknown>): { status: string; state: InternationalFixture["state"] } {
  const competition = (event.competitions as Record<string, unknown>[] | undefined)?.[0]
  const status = (competition?.status ?? event.status) as
    | { type?: { name?: string; state?: string; completed?: boolean }; displayClock?: string; period?: number }
    | undefined
  const type = status?.type
  const name = String(type?.shortDetail ?? type?.name ?? "")
  if (type?.completed || type?.state === "post") return { status: name || "Full time", state: "finished" }
  if (type?.state === "in") return { status: name || status?.displayClock || "In progress", state: "live" }
  return { status: name || "Scheduled", state: "upcoming" }
}

export async function getInternationalFixtures(input?: { start?: string | null; end?: string | null }) {
  const now = new Date()
  const defaultStart = utcDate(new Date(now.getTime() - 7 * 86400_000))
  const defaultEnd = utcDate(new Date(now.getTime() + 45 * 86400_000))
  const start = validDate(input?.start ?? null, defaultStart)
  const end = validDate(input?.end ?? null, defaultEnd)
  if (end < start) throw new Error("End date must be on or after the start date.")
  const span = (Date.UTC(Number(end.slice(0, 4)), Number(end.slice(4, 6)) - 1, Number(end.slice(6, 8))) -
    Date.UTC(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8)))) / 86400_000
  if (span > 62) throw new Error("Choose a range of 62 days or fewer.")

  const results = await Promise.all(COMPETITIONS.map(async (competition) => {
    const json = await getJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.slug}/scoreboard?dates=${start}-${end}&limit=100`,
    )
    const events = (json?.events as Record<string, unknown>[] | undefined) ?? []
    const fixtures: InternationalFixture[] = []
    for (const event of events) {
      const first = (event.competitions as Record<string, unknown>[] | undefined)?.[0]
      const competitors = (first?.competitors as Record<string, unknown>[] | undefined) ?? []
      const homeEntry = competitors.find((item) => item.homeAway === "home")
      const awayEntry = competitors.find((item) => item.homeAway === "away")
      const home = side(homeEntry?.team as Record<string, unknown> | undefined, homeEntry?.score)
      const away = side(awayEntry?.team as Record<string, unknown> | undefined, awayEntry?.score)
      const kickoff = String(event.date ?? "")
      if (!home || !away || !kickoff) continue
      const status = statusOf(event)
      const venue = (first?.venue as { fullName?: string } | undefined)?.fullName
      fixtures.push({
        id: `${competition.slug}:${String(event.id ?? kickoff + home.name + away.name)}`,
        competition: competition.name,
        region: competition.region,
        slug: competition.slug,
        kickoff,
        status: status.status,
        state: status.state,
        home,
        away,
        venue: venue ?? null,
      })
    }
    return fixtures
  }))

  const seen = new Set<string>()
  const fixtures = results.flat().filter((fixture) => {
    if (seen.has(fixture.id)) return false
    seen.add(fixture.id)
    return true
  }).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))

  return {
    source: "ESPN public soccer scoreboard",
    updatedAt: new Date().toISOString(),
    range: { start, end },
    competitions: COMPETITIONS.map((competition) => ({
      ...competition,
      fixtures: fixtures.filter((fixture) => fixture.slug === competition.slug).length,
    })),
    fixtures,
  }
}
