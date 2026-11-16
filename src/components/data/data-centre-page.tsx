"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type { SportmonksFixture, SportmonksOdd, SportmonksXgMetric } from "@/lib/providers/sportmonks"

type ProviderStatus = {
  provider: string
  configured: boolean
  xgEnabled: boolean
  oddsEnabled: boolean
  features: { fixtures: boolean; teamXg: boolean; prematchOdds: boolean }
}
type FeedResult = {
  fixtures: SportmonksFixture[]
  fetchedAt: string
  xgEnabled: boolean
  oddsEnabled: boolean
}

function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function fixtureXg(fixture: SportmonksFixture) {
  let home: number | null = null
  let away: number | null = null
  for (const metric of (fixture.xgfixture ?? []) as SportmonksXgMetric[]) {
    if (metric.type?.code !== "expected-goals") continue
    const value = Number(metric.data?.value)
    if (!Number.isFinite(value)) continue
    if (metric.location === "home") home = value
    if (metric.location === "away") away = value
  }
  return home === null || away === null ? null : { home, away }
}

function oddsFor(fixture: SportmonksFixture): SportmonksOdd[] {
  return (fixture.odds ?? []).filter((odd) => odd.value && !Number.isNaN(Number(odd.value))).slice(0, 12)
}

export function DataCentrePage() {
  const now = new Date()
  const [start, setStart] = useState(dateInput(new Date(now.getTime() - 7 * 86400_000)))
  const [end, setEnd] = useState(dateInput(new Date(now.getTime() + 14 * 86400_000)))
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [result, setResult] = useState<FeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/football-data", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read provider configuration.")
        return await response.json() as ProviderStatus
      })
      .then((value) => { if (active) setStatus(value) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Provider check failed.") })
    return () => { active = false }
  }, [])

  async function loadFixtures() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch(`/api/football-data?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: "no-store" })
      const body = await response.json() as FeedResult & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not load Sportmonks fixtures.")
      setResult(body)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load provider data.")
    } finally {
      setLoading(false)
    }
  }

  const fixtureCount = result?.fixtures.length ?? 0
  const upcoming = useMemo(() => (result?.fixtures ?? []).filter((fixture) => Date.parse(fixture.starting_at ?? "") >= Date.now()), [result])

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="font-display text-2xl tracking-tight">Pitchline</Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
          <Link href="/" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Match desk</Link>
          <Link href="/picks" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Best picks</Link>
          <Link href="/fixtures/international" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">International</Link>
          <Link href="/model/backtest" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Model lab</Link>
          <Link href="/account" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Account</Link>
        </nav>
      </header>

      <div className="mb-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Data infrastructure</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Football data centre</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Source-aware fixtures, expected goals and bookmaker prices. Missing provider coverage is shown as missing, never filled with estimates.
        </p>
      </div>

      <section className="panel mb-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Primary provider</p>
            <h2 className="mt-1 font-display text-2xl">{status?.provider ?? "Sportmonks Football API v3"}</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status?.configured ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted"}`}>
            {status?.configured ? "TOKEN CONFIGURED" : "AWAITING TOKEN"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted">Fixtures & match metadata</p>
            <p className="mt-1 text-sm font-semibold">{status?.configured ? "Available by plan" : "Not configured"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted">Team xG / xGA</p>
            <p className="mt-1 text-sm font-semibold">{status?.xgEnabled ? "Enabled" : "Add-on not enabled"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted">Pre-match bookmaker odds</p>
            <p className="mt-1 text-sm font-semibold">{status?.oddsEnabled ? "Enabled" : "Add-on not enabled"}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          The ESPN public feed continues to power the competition board and international fixture calendar. Sportmonks is an additional source for fixture-level xG and pre-match odds; those fields are only requested when the corresponding account add-on is enabled.
        </p>
        {!status?.configured ? (
          <p className="text-sm text-muted">Add <code>SPORTMONKS_API_TOKEN</code> as a server-only Vercel secret. Do not prefix it with <code>NEXT_PUBLIC_</code>.</p>
        ) : null}
      </section>

      <section className="panel mb-5">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Fixture explorer</p>
          <h2 className="mt-1 font-display text-2xl">Provider feed preview</h2>
          <p className="mt-1 text-sm text-muted">Select up to a 100-day date range. The API caps this page to the first 200 returned fixtures.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm font-medium">From<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" /></label>
          <label className="block text-sm font-medium">To<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" /></label>
          <button type="button" onClick={loadFixtures} disabled={!status?.configured || loading || !start || !end || end < start} className="press h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? "Loading…" : "Load fixtures"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-muted" role="status">{error}</p> : null}
        {result ? <p className="mt-3 text-xs text-muted">{fixtureCount} fixtures returned · {upcoming.length} upcoming · fetched {new Date(result.fetchedAt).toLocaleString()}</p> : null}
      </section>

      {result ? (
        <section className="space-y-2">
          {result.fixtures.map((fixture) => {
            const xg = fixtureXg(fixture)
            const odds = oddsFor(fixture)
            const sides = fixture.participants ?? []
            const home = sides.find((side) => side.meta?.location === "home")?.name ?? "Home"
            const away = sides.find((side) => side.meta?.location === "away")?.name ?? "Away"
            return (
              <article key={fixture.id} className="panel">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{fixture.league?.name ?? "Competition"}</p>
                    <p className="text-xs text-muted">{fixture.name ?? `${home} vs ${away}`}</p>
                  </div>
                  <p className="text-xs text-muted">{fixture.starting_at ? new Date(fixture.starting_at.replace(" ", "T") + "Z").toLocaleString() : "Kickoff unavailable"}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">{home} <span className="px-2 text-muted">vs</span> {away}</p>
                  {xg ? <p className="text-sm tabular-nums">xG {xg.home.toFixed(2)} – {xg.away.toFixed(2)}</p> : <p className="text-xs text-muted">xG not supplied</p>}
                </div>
                {odds.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {odds.slice(0, 6).map((odd) => (
                      <span key={odd.id ?? `${odd.market_id}-${odd.bookmaker_id}-${odd.label}`} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
                        {odd.market_description ?? odd.market?.name ?? "Market"} · {odd.name ?? odd.label}: <strong>{odd.value}</strong>
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
          {fixtureCount === 0 ? <section className="panel py-10 text-center text-sm text-muted">No fixtures were returned for this date range or your current plan coverage.</section> : null}
        </section>
      ) : null}
    </main>
  )
}
