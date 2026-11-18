"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Pitchline } from "@/components/pitchline"
import type { Board } from "@/data/football"

type InternationalFixture = {
  id: string
  kickoff: string
  competition: string
  region: string
  home: { espnId: string; name: string; abbreviation: string | null; logo: string | null; color: string | null }
  away: { espnId: string; name: string; abbreviation: string | null; logo: string | null; color: string | null }
  competitionSlug: string
  status: string
  statusState: string
  completed: boolean
  score: { home: number | null; away: number | null }
}

type InternationalPayload = {
  board: Board
  fixtureResult: {
    date: string
    source: "ESPN"
    fixtures: InternationalFixture[]
    competitionsChecked: number
    competitionsUnavailable: string[]
    partial: boolean
  }
  upcomingFixtures: InternationalFixture[]
  nonUpcomingFixtures: InternationalFixture[]
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

export function InternationalPageClient({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate)
  const [payload, setPayload] = useState<InternationalPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setPayload(null)

    fetch("/api/international/board?date=" + encodeURIComponent(date), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof body.error === "string"
            ? body.error
            : "International fixtures are temporarily unavailable.")
        }
        return body as InternationalPayload
      })
      .then((result) => {
        if (!controller.signal.aborted) setPayload(result)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "International fixtures are temporarily unavailable.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [date, attempt])

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">National teams</p>
            <h1 className="mt-2 font-display text-4xl tracking-tight">International football</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              International fixtures and match insights.
            </p>
          </div>
          <form action="/international" method="get" className="flex items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Match date</span>
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="h-11 rounded-lg border border-border bg-card px-3 text-base"
              />
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

      {loading ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6" aria-live="polite">
          <section className="panel">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
              <p className="text-sm text-muted">Loading international fixtures…</p>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6" role="alert">
          <section className="panel">
            <h2 className="font-display text-2xl">International fixtures are temporarily unavailable</h2>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="press mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </section>
        </div>
      ) : null}

      {!loading && payload && payload.upcomingFixtures.length > 0 ? (
        <Pitchline initial={payload.board} initialLeague="int" showHeader={false} />
      ) : null}

      {!loading && payload && payload.upcomingFixtures.length === 0 && payload.nonUpcomingFixtures.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <section className="panel">
            <h2 className="font-display text-2xl">No major international fixtures on this date</h2>
            <p className="mt-2 text-sm text-muted">Try another date.</p>
          </section>
        </div>
      ) : null}

      {!loading && payload && payload.nonUpcomingFixtures.length > 0 ? (
        <section className="mx-auto mt-6 max-w-6xl px-4 sm:px-6" aria-label="International results">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl tracking-tight">Played / in progress</h2>
            <p className="text-xs text-muted">West Africa Time</p>
          </div>
          <div className="space-y-2">
            {payload.nonUpcomingFixtures.map((fixture) => (
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
        </section>
      ) : null}

      {!loading && payload?.fixtureResult.partial ? (
        <p className="mx-auto mt-5 max-w-6xl px-4 text-xs text-muted sm:px-6">Fixture coverage may vary.</p>
      ) : null}
    </div>
  )
}
