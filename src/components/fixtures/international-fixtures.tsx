"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { InternationalFixture } from "@/lib/international.server"

type FixturePayload = {
  source: string
  updatedAt: string
  range: { start: string; end: string }
  competitions: { slug: string; name: string; region: string; fixtures: number }[]
  fixtures: InternationalFixture[]
}

function kickoffLabel(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return "Time unavailable"
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function InternationalFixtures({ initial }: { initial: FixturePayload }) {
  const [competition, setCompetition] = useState("all")
  const [region, setRegion] = useState("all")
  const [state, setState] = useState<"all" | "upcoming" | "live" | "finished">("all")
  const [query, setQuery] = useState("")

  const visible = useMemo(() => initial.fixtures.filter((fixture) => {
    if (competition !== "all" && fixture.slug !== competition) return false
    if (region !== "all" && fixture.region !== region) return false
    if (state !== "all" && fixture.state !== state) return false
    const needle = query.trim().toLowerCase()
    if (needle && ![fixture.home.name, fixture.away.name, fixture.competition].some((value) => value.toLowerCase().includes(needle))) return false
    return true
  }), [initial.fixtures, competition, region, state, query])

  const liveCount = initial.fixtures.filter((fixture) => fixture.state === "live").length
  const upcomingCount = initial.fixtures.filter((fixture) => fixture.state === "upcoming").length
  const regions = [...new Set(initial.competitions.map((item) => item.region))]

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="font-display text-2xl tracking-tight">Pitchline</Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
          <Link href="/" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Match desk</Link>
          <Link href="/picks" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Best picks</Link>
          <Link href="/data" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Data centre</Link>
          <Link href="/model/backtest" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Model lab</Link>
          <Link href="/account" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Account</Link>
        </nav>
      </header>

      <div className="mb-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">International football</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">National teams & tournaments</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          World Cup tournaments and qualifiers, AFCON, Copa América, the European Championship, Gold Cup, Asian Cup and international friendlies in one fixture view.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <section className="panel">
          <p className="text-xs uppercase tracking-wide text-muted">Matches in range</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{initial.fixtures.length}</p>
        </section>
        <section className="panel">
          <p className="text-xs uppercase tracking-wide text-muted">Upcoming</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{upcomingCount}</p>
        </section>
        <section className="panel">
          <p className="text-xs uppercase tracking-wide text-muted">Live now</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{liveCount}</p>
        </section>
      </div>

      <section className="panel mb-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="block text-sm font-medium">
            Search fixtures
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Team or competition" className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" />
          </label>
          <label className="block text-sm font-medium">
            Competition
            <select value={competition} onChange={(event) => setCompetition(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base">
              <option value="all">All competitions</option>
              {initial.competitions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Region
            <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base">
              <option value="all">All regions</option>
              {regions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Match status
            <select value={state} onChange={(event) => setState(event.target.value as typeof state)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base">
              <option value="all">All matches</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="finished">Finished</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">Source: {initial.source} · Updated {new Date(initial.updatedAt).toLocaleString()} · Date range {initial.range.start}–{initial.range.end}</p>
      </section>

      {visible.length === 0 ? (
        <section className="panel py-12 text-center">
          <h2 className="font-display text-2xl">No fixtures match these filters</h2>
          <p className="mt-2 text-sm text-muted">Try another competition, region or team search. International calendars can have quiet periods between windows.</p>
        </section>
      ) : (
        <section className="space-y-2" aria-label="International fixtures">
          {visible.map((fixture) => (
            <article key={fixture.id} className="panel">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{fixture.competition}</p>
                  <p className="text-xs text-muted">{fixture.region}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{kickoffLabel(fixture.kickoff)}</p>
                  <p className={`mt-1 text-xs font-semibold ${fixture.state === "live" ? "text-primary" : "text-muted"}`}>{fixture.status}</p>
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {fixture.home.logo ? <img src={fixture.home.logo} alt="" className="size-8 shrink-0 object-contain" loading="lazy" /> : null}
                  <span className="truncate text-sm font-medium sm:text-base">{fixture.home.name}</span>
                </div>
                <div className="min-w-12 text-center font-display text-xl tabular-nums">
                  {fixture.home.score !== null && fixture.away.score !== null ? `${fixture.home.score}–${fixture.away.score}` : "—"}
                </div>
                <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                  <span className="truncate text-sm font-medium sm:text-base">{fixture.away.name}</span>
                  {fixture.away.logo ? <img src={fixture.away.logo} alt="" className="size-8 shrink-0 object-contain" loading="lazy" /> : null}
                </div>
              </div>
              {fixture.venue ? <p className="mt-3 text-xs text-muted">{fixture.venue}</p> : null}
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
