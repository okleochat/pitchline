import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Pitchline } from "@/components/pitchline"
import { getLiveBoard, mergeInternationalFixtures } from "@/lib/live-board.server"
import { getInternationalFixtures } from "@/lib/international/fixtures.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function lagosDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + "-" + values.month + "-" + values.day
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + "T00:00:00Z")
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function shiftDate(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T12:00:00Z"))
}

function displayKickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

export default async function InternationalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const params = await searchParams
  const suppliedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const date = suppliedDate && isValidDate(suppliedDate) ? suppliedDate : lagosDate()

  // Load the shared board first. It refreshes the 14-day national-team
  // window, which getInternationalFixtures can then filter without refetching
  // every competition scoreboard for today's/upcoming dates.
  const baseBoard = await getLiveBoard()
  const fixtureResult = await getInternationalFixtures(date).catch(() => null)

  const now = Date.now()
  const allDateFixtures = fixtureResult?.fixtures ?? []
  const upcomingFixtures = allDateFixtures.filter((fixture) => {
    const kickoff = new Date(fixture.kickoff).getTime()
    return !fixture.completed && fixture.statusState === "pre" && kickoff > now
  })
  const nonUpcomingFixtures = allDateFixtures.filter((fixture) => {
    const kickoff = new Date(fixture.kickoff).getTime()
    return fixture.completed || fixture.statusState === "in" || kickoff <= now
  })

  // Only simulate future fixtures. Historical results are displayed separately;
  // using current team form to simulate a past match would leak future data.
  const board = fixtureResult
    ? await mergeInternationalFixtures(baseBoard, upcomingFixtures)
    : baseBoard

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SiteHeader subtitle="International match simulator" />
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">National teams</p>
            <h1 className="mt-2 font-display text-4xl tracking-tight">International football</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              AFCON, Nations League, World Cup and continental qualifiers, and other major national-team competitions. Upcoming fixtures use the same Pitchline simulator as club matches.
            </p>
          </div>
          <form action="/international" method="get" className="flex items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Match date</span>
              <input type="date" name="date" defaultValue={date} className="h-11 rounded-lg border border-border bg-card px-3 text-base" />
            </label>
            <button type="submit" className="press h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Go</button>
          </form>
        </section>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href={"/international?date=" + shiftDate(date, -1)} className="press inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm">Previous day</Link>
          <p className="text-center text-sm font-medium">{displayDate(date)}</p>
          <Link href={"/international?date=" + shiftDate(date, 1)} className="press inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm">Next day</Link>
        </div>
      </div>

      {fixtureResult === null ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <section className="panel">
            <h2 className="font-display text-2xl">International feed unavailable</h2>
            <p className="mt-2 text-sm text-muted">ESPN's national-team scoreboard could not be reached. The club match desk and Best Picks remain available.</p>
          </section>
        </div>
      ) : null}

      {fixtureResult && upcomingFixtures.length > 0 ? (
        <Pitchline initial={board} initialLeague="int" showHeader={false} />
      ) : null}

      {fixtureResult && upcomingFixtures.length === 0 && nonUpcomingFixtures.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <section className="panel">
            <h2 className="font-display text-2xl">No major international fixtures on this date</h2>
            <p className="mt-2 text-sm text-muted">Try another date. When a national-team fixture is available, Pitchline will load its match simulator here.</p>
          </section>
        </div>
      ) : null}

      {fixtureResult && nonUpcomingFixtures.length > 0 ? (
        <section className="mx-auto mt-6 max-w-6xl px-4 sm:px-6" aria-label="International results">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl tracking-tight">Played / in progress</h2>
            <p className="text-xs text-muted">Results and kick-off times in West Africa Time</p>
          </div>
          <div className="space-y-2">
            {nonUpcomingFixtures.map((fixture) => (
              <article key={fixture.id} className="panel">
                <p className="text-xs text-muted">{fixture.competition} · {fixture.region}</p>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  <p className="truncate text-sm font-medium">{fixture.home.name}</p>
                  <p className="font-display text-lg tabular-nums">
                    {fixture.score.home !== null && fixture.score.away !== null
                      ? fixture.score.home + "–" + fixture.score.away
                      : "vs"}
                  </p>
                  <p className="truncate text-right text-sm font-medium">{fixture.away.name}</p>
                </div>
                <p className="mt-2 text-xs text-muted">{displayKickoff(fixture.kickoff)} · {fixture.status}</p>
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Past matches are shown as results, not simulated with today's ratings. This prevents future match results from leaking into historical predictions.
          </p>
        </section>
      ) : null}

      {fixtureResult?.partial ? (
        <p className="mx-auto mt-5 max-w-6xl px-4 text-xs text-muted sm:px-6">
          Some competition feeds did not respond; the fixtures shown may be incomplete.
        </p>
      ) : null}
    </div>
  )
}
