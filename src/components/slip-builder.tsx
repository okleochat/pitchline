"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  LoaderCircle,
  Trash2,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { useFirebaseSession } from "@/components/auth/firebase-auth-provider"
import type { SlipLeg } from "@/lib/slip/types"

type BookingResult = {
  shareCode: string
  shareURL: string
  expiresAt: string | null
  combinedOdds: number | null
  bookmakerName?: string
  legs: Array<{
    key: string
    homeTeam: string
    awayTeam: string
    selection: string
    market: string
    odds: number
  }>
}

function money(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value)
}

function messageFor(error: string, fallback: string): string {
  if (error === "selection_unavailable" || error === "SELECTIONS_UNAVAILABLE" || error === "MANAGED_SELECTIONS_UNAVAILABLE") {
    return "At least one selection could not be matched to a current bookmaker market. Review the details below, remove or replace that pick, and try again."
  }
  if (error === "authentication_required") return "Sign in to use My Slip."
  if (error === "pro_required") return "An active Pro subscription is required."
  if (error === "slip_unavailable" || error === "slip_save_failed") return "Pitchline could not save your slip. Please try again."
  if (error === "SPORTYBET_UNAVAILABLE" || error === "SPORTPESA_UNAVAILABLE" ||
      error === "SPORTPESA_BOOKING_FAILED" || error === "SPORTPESA_LOADBACK_FAILED" ||
      error === "SPORTPESA_LOADBACK_PARTIAL" || error === "bookmaker_unavailable") {
    return "The bookmaker service is temporarily unavailable. Your Pitchline slip is still saved."
  }
  return fallback
}

export function SlipBuilder() {
  const session = useFirebaseSession()
  const isPro = session.user?.isPro === true
  const [legs, setLegs] = useState<SlipLeg[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string[]>([])
  const [booking, setBooking] = useState<BookingResult | null>(null)
  const [stakeText, setStakeText] = useState("1000")
  const [copied, setCopied] = useState(false)
  const [selectedBookmaker, setSelectedBookmaker] = useState("sportybet")
  const [selectionsCopied, setSelectionsCopied] = useState(false)

  useEffect(() => {
    if (session.loading) return
    if (!isPro || !session.user?.uid) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch("/api/pro/slip", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          legs?: SlipLeg[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error ?? "slip_unavailable")
        setLegs(Array.isArray(payload.legs) ? payload.legs : [])
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(messageFor(cause instanceof Error ? cause.message : "", "Pitchline could not load your saved slip."))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session.loading, session.user?.uid, isPro])

  const selectedProvider = selectedBookmaker === "sportpesa"
    ? { key: "sportpesa", name: "SportPesa" }
    : { key: "sportybet", name: "SportyBet" }

  const currentOdds = useMemo(
    () => new Map((booking?.legs ?? []).map((leg) => [leg.key, leg.odds])),
    [booking],
  )
  const stake = Number(stakeText)
  const validStake = Number.isFinite(stake) && stake >= 10 && stake <= 100_000_000
  const potentialReturn = booking && booking.combinedOdds !== null && validStake
    ? stake * booking.combinedOdds
    : null

  async function save(next: SlipLeg[]) {
    const previous = legs
    setLegs(next)
    setSaving(true)
    setError(null)
    setDetails([])
    setBooking(null)
    try {
      const response = await fetch("/api/pro/slip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: next }),
        cache: "no-store",
        credentials: "same-origin",
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; legs?: SlipLeg[] }
      if (!response.ok) throw new Error(payload.error ?? "slip_save_failed")
      if (Array.isArray(payload.legs)) setLegs(payload.legs)
    } catch (cause) {
      setLegs(previous)
      setError(messageFor(cause instanceof Error ? cause.message : "", "Pitchline could not save your slip."))
    } finally {
      setSaving(false)
    }
  }

  function remove(key: string) {
    if (saving || creating) return
    void save(legs.filter((leg) => leg.key !== key))
  }

  async function generateCode() {
    if (!legs.length || saving || creating) return
    setCreating(true)
    setError(null)
    setDetails([])
    setBooking(null)
    setCopied(false)
    try {
      const response = await fetch(
        selectedBookmaker === "sportpesa"
          ? "/api/pro/slip/sportpesa"
          : "/api/pro/slip/sportybet",
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        },
      )
      const payload = await response.json().catch(() => ({})) as BookingResult & {
        error?: string
        message?: string
        details?: string[]
      }
      if (!response.ok) {
        setDetails(Array.isArray(payload.details) ? payload.details : [])
        throw new Error(payload.error ?? payload.message ?? "bookmaker_unavailable")
      }
      if (!payload.shareCode || !Array.isArray(payload.legs) || typeof payload.combinedOdds !== "number") {
        throw new Error("bookmaker_unavailable")
      }
      setBooking(payload)
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "", "Pitchline could not generate the bookmaker code. Your slip remains saved."))
    } finally {
      setCreating(false)
    }
  }

  async function copyCode() {
    if (!booking?.shareCode) return
    try {
      await navigator.clipboard.writeText(booking.shareCode)
      setCopied(true)
    } catch {
      setError("Clipboard access is unavailable. Select and copy the booking code manually.")
    }
  }

  async function copySelections() {
    if (!legs.length) return
    const text = legs.map((leg, index) =>
      (index + 1) + ". " + leg.homeTeam + " vs " + leg.awayTeam + "\n" +
      leg.competitionName + " · " + leg.when + "\n" +
      leg.label + " · Pitchline confidence " + (leg.probability * 100).toFixed(1) + "%"
    ).join("\n\n")
    try {
      await navigator.clipboard.writeText("Pitchline selections\n\n" + text)
      setSelectionsCopied(true)
    } catch {
      setError("Clipboard access is unavailable. Please copy the selections manually.")
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pt-4 pb-16 sm:px-6">
      <SiteHeader />
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Pro workspace</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight">My Slip</h1>
            <p className="mt-1 text-sm text-muted">Your selected Best Picks, ready to transfer to a bookmaker.</p>
          </div>
          <Link href="/picks" className="press inline-flex h-11 items-center rounded-lg border border-border px-3 text-sm font-medium">
            Back to Best Picks
          </Link>
        </div>

        {session.loading || loading ? (
          <section className="panel flex items-center gap-3" aria-live="polite">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            <p className="text-sm">Loading your slip…</p>
          </section>
        ) : !session.user ? (
          <section className="panel">
            <h2 className="font-display text-xl">Sign in to use My Slip</h2>
            <p className="mt-2 text-sm text-muted">Your selections are saved to your Pitchline account.</p>
            <Link href="/account" className="press mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
              Sign in
            </Link>
          </section>
        ) : !isPro ? (
          <section className="panel">
            <h2 className="font-display text-xl">A Pro feature</h2>
            <p className="mt-2 text-sm text-muted">Slip Builder and bookmaker booking codes are available to active Pro subscribers.</p>
            <Link href="/account" className="press mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
              View account
            </Link>
          </section>
        ) : (
          <>
            <section className="panel mb-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">Accumulator</h2>
                  <p className="mt-1 text-xs text-muted">{legs.length} of 50 selections · one selection per match</p>
                </div>
                {legs.length ? (
                  <button
                    type="button"
                    className="press inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted disabled:opacity-40"
                    onClick={() => void save([])}
                    disabled={saving || creating}
                  >
                    <Trash2 className="size-3.5" /> Clear slip
                  </button>
                ) : null}
              </div>

              {legs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="font-medium">Your slip is empty</p>
                  <p className="mt-2 text-sm text-muted">Go to Best Picks and add the selections you want to combine.</p>
                  <Link href="/picks" className="press mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                    Browse Best Picks
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {legs.map((leg) => {
                    const odds = currentOdds.get(leg.key)
                    return (
                      <article key={leg.key} className="rounded-xl border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{leg.homeTeam} vs {leg.awayTeam}</p>
                            <p className="mt-1 text-xs text-muted">{leg.competitionName} · {leg.when}</p>
                            <p className="mt-2 text-sm">{leg.label}</p>
                            <p className="mt-1 text-xs text-muted tabular-nums">Pitchline confidence {(leg.probability * 100).toFixed(1)}% · fair price {((1 / leg.probability)).toFixed(2)}</p>
                            {odds ? <p className="mt-1 text-xs font-medium tabular-nums">{booking?.bookmakerName ?? "Bookmaker"} price: {odds.toFixed(2)}</p> : null}
                          </div>
                          <button
                            type="button"
                            aria-label={"Remove " + leg.label + " for " + leg.homeTeam + " vs " + leg.awayTeam}
                            className="press inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-40"
                            onClick={() => remove(leg.key)}
                            disabled={saving || creating}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}
              {details.length ? (
                <ul className="mt-3 space-y-1 rounded-lg bg-sunken p-3 text-xs text-muted">
                  {details.map((detail, index) => <li key={index}>{detail}</li>)}
                </ul>
              ) : null}
            </section>

            {legs.length ? (
              <section className="panel mb-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">Booking code</h2>
                    <p className="mt-1 text-xs text-muted">Pitchline checks every match and market before requesting a code.</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">Nigeria</span>
                </div>
                <label htmlFor="slip-bookmaker" className="mb-3 block text-sm font-medium">
                  Bookmaker
                  <select
                    id="slip-bookmaker"
                    value={selectedBookmaker}
                    onChange={(event) => {
                      setSelectedBookmaker(event.target.value)
                      setBooking(null)
                      setError(null)
                      setCopied(false)
                    }}
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
                  >
                    <option value="sportybet">SportyBet</option>
                    <option value="sportpesa">SportPesa</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  onClick={() => void generateCode()}
                  disabled={saving || creating || legs.length === 0}
                >
                  {creating ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {creating ? "Checking markets and generating…" : "Generate " + (selectedProvider?.name ?? "SportyBet") + " code"}
                </button>

                {booking ? (
                  <div className="mt-4 rounded-xl border border-border bg-background p-4">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{booking.bookmakerName ?? selectedProvider?.name ?? "Booking"} code created</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="font-display text-3xl tracking-widest tabular-nums">{booking.shareCode}</p>
                      <button
                        type="button"
                        className="press inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"
                        onClick={() => void copyCode()}
                      >
                        {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                        {copied ? "Copied" : "Copy code"}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      <div>
                        <p className="text-xs text-muted">Combined odds</p>
                        <p className="mt-1 font-display text-2xl tabular-nums">{booking.combinedOdds === null ? "—" : booking.combinedOdds.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Potential return</p>
                        <p className="mt-1 font-display text-2xl tabular-nums">{potentialReturn === null ? "—" : money(potentialReturn)}</p>
                      </div>
                    </div>
                    <label className="mt-4 block text-sm">
                      Stake (NGN)
                      <input
                        value={stakeText}
                        onChange={(event) => setStakeText(event.target.value)}
                        inputMode="decimal"
                        type="number"
                        min="10"
                        max="100000000"
                        className="mt-2 h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
                      />
                    </label>
                    {!validStake ? <p className="mt-2 text-xs text-muted">Enter a stake of at least ₦10.</p> : null}
                    {booking.expiresAt ? <p className="mt-3 text-xs text-muted">Code expiry: {new Date(booking.expiresAt).toLocaleString("en-NG")}</p> : null}
                    <a
                      href={booking.shareURL}
                      target="_blank"
                      rel="noreferrer"
                      className="press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"
                    >
                      Open {booking.bookmakerName ?? selectedProvider?.name ?? "bookmaker"} <ExternalLink className="size-4" />
                    </a>
                    <p className="mt-3 text-xs text-muted">The code only transfers a reserved slip. It does not place a bet. Load it at the bookmaker and confirm all selections, current odds and stake before placing.</p>
                  </div>
                ) : null}
              </section>
            ) : null}
            {legs.length ? (
              <section className="panel mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Manual bookmaker export</h2>
                    <p className="mt-1 text-xs text-muted">The other bookmakers in your list do not yet have a directly verified pre-bet code flow in Pitchline. Copy these selections to rebuild manually.</p>
                    <p className="mt-2 text-xs text-muted">Football.com, 1xBet, 22Bet, Bet9ja, Betway, BetPawa, Paripesa, Afropari, BC.Game and Hollywoodbets.</p>
                  </div>
                  <button
                    type="button"
                    className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium"
                    onClick={() => void copySelections()}
                    disabled={saving || creating}
                  >
                    {selectionsCopied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                    {selectionsCopied ? "Copied" : "Copy selections"}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}

        <p className="mt-5 text-xs text-muted">
          SportyBet and SportPesa use their own website endpoints for pre-bet share codes. These are not public developer APIs and may change; Pitchline will not silently replace a selection or place a wager.
        </p>
      </div>
    </main>
  )
}
