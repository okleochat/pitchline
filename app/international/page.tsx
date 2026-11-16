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

export default async function InternationalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const params = await searchParams
  const suppliedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const date = suppliedDate && isValidDate(suppliedDate) ? suppliedDate : lagosDate()

  const [baseBoard, fixtureResult] = await Promise.all([
    getLiveBoard(),
    getInternationalFixtures(date).catch(() => null),
  ])
  const board = fixtureResult
    ? await mergeInternationalFixtures(baseBoard, fixtureResult.fixtures)
    : baseBoard
  const fixtures = board.fixtures.filter((fixture) => fixture.league === "int")

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SiteHeader subtitle="International match simulator" />
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">National teams</p>
            <h1 className="mt-2 font-display text-4xl tracking-tight">International football</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              AFCON, Nations League, World Cup and continental qualifiers, and other major national-team competitions. Choose a fixture to open the same simulator used for club matches.
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
      ) : fixtures.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <section className="panel">
            <h2 className="font-display text-2xl">No major international fixtures on this date</h2>
            <p className="mt-2 text-sm text-muted">
              Try another date. When a national-team fixture is available, selecting it opens the full Pitchline simulator, including 1X2, goals, BTTS, scoreline distributions and the match tape.
            </p>
            <p className="mt-3 text-xs text-muted">
              National-team ratings use that team's previous completed international competition matches. If ESPN returns no history, the simulator clearly uses a neutral fallback rather than club-team ratings.
            </p>
          </section>
        </div>
      ) : (
        <Pitchline initial={board} initialLeague="int" showHeader={false} />
      )}
    </div>
  )
}
