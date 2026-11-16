import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
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
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
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

  let result: Awaited<ReturnType<typeof getInternationalFixtures>> | null = null
  let error: string | null = null
  try {
    result = await getInternationalFixtures(date)
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "The international fixture feed is temporarily unavailable."
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      <SiteHeader subtitle="International fixtures" />
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">National teams</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">International fixtures</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Major senior national-team competitions, World Cup and continental qualifiers, and international tournaments.
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

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={"/international?date=" + shiftDate(date, -1)} className="press inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm">Previous day</Link>
        <p className="text-center text-sm font-medium">{displayDate(date)}</p>
        <Link href={"/international?date=" + shiftDate(date, 1)} className="press inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm">Next day</Link>
      </div>

      {error ? (
        <section className="panel">
          <h2 className="font-display text-2xl">International fixture feed unavailable</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-2 text-xs text-muted">This feed uses the same ESPN soccer data source as the club match desk. No separate API key is required.</p>
        </section>
      ) : result && result.fixtures.length === 0 ? (
        <section className="panel">
          <h2 className="font-display text-2xl">No major international fixtures found</h2>
          <p className="mt-2 text-sm text-muted">No matches are scheduled in the selected national-team competitions on this date.</p>
          <p className="mt-2 text-xs text-muted">Coverage includes AFCON, AFCON qualifiers, UEFA Nations League, the World Cup and regional World Cup qualifiers, the Euros, Copa América, the Gold Cup and the Asian Cup.</p>
          {result.partial ? <p className="mt-3 text-xs text-muted">Some competition feeds did not respond, so this date may be incomplete.</p> : null}
        </section>
      ) : result ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{result.fixtures.length} fixtures · {result.source}</p>
            <p className="text-xs text-muted">Kick-off times shown in West Africa Time</p>
          </div>
          {result.partial ? (
            <p className="mb-3 text-xs text-muted">
              Some competition feeds did not respond. Showing fixtures from {result.competitionsChecked} available competition feeds.
            </p>
          ) : null}
          <div className="space-y-2">
            {result.fixtures.map((fixture) => (
              <article key={fixture.id} className="panel flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
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
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <footer className="mt-6 text-xs text-muted">
        This page is a fixtures-and-results view. International team strength ratings and match probabilities will only be added once a separate national-team model has been calibrated.
      </footer>
    </main>
  )
}
