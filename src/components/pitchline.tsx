"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { useFirebaseSession } from "@/components/auth/firebase-auth-provider"
import { ArrowLeftRight, ChevronDown, Minus, Pause, Play, Plus, RotateCcw, Sparkles } from "lucide-react"
import {
  LEAGUES,
  formRate,
  isCup,
  leagueName,
  leagueShort,
  shapePair,
  type Board,
  type Fixture,
  type LeagueId,
  type RateSample,
  type Team,
} from "@/data/football"
import { loadBoard, loadForm, loadProSimulation, type FormResult } from "@/lib/board"
import { hasInternationalPickHistory } from "@/lib/international/pick-eligibility"
import { PRO_SIM_RUNS } from "@/lib/pro-sim-config"
import type { ProReport } from "@/lib/pro-sim"
import type { ProPlayerData, ProTeamSquad } from "@/lib/pro-player-data"
import {
  DIXON_RHO,
  SIMS,
  analyticalSplit,
  fairDecimal,
  formatLine,
  indexFor,
  marginLabels,
  pctLabel,
  playOne,
  roundHalf,
  shareLabel,
  simulate,
  splitHandicap,
  splitTotal,
  totalLabels,
  type ModelKind,
  type Report,
  type TapeEvent,
} from "@/lib/sim"

const STORAGE_KEY = "pitchline-desk"

type SortKey = "index" | "attack" | "defense" | "name"

type DeskState = {
  league: LeagueId
  homeId: string
  awayId: string
  edgePct: number
  spread: number
  totalLine: number
  view?: "desk" | "picks"
  model?: ModelKind
  form?: "season" | "5" | "10"
  level?: boolean
  engineMode?: "pro" | "classic"
}

type FormWindow = "season" | "5" | "10"
type PriceMarket = "home" | "draw" | "away" | "btts" | "over" | "under"

const PICK_LINE = 0.8
type PickKind = "result" | "goals" | "btts"
type MarketPick = {
  key: string
  fixture: Fixture
  label: string
  kind: PickKind
  share: number
}

function readDesk(): Partial<DeskState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DeskState>
    return parsed
  } catch {
    return null
  }
}

function Crest({ team, large = false }: { team: Team; large?: boolean }) {
  return (
    <span
      className={
        large
          ? "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold tracking-tight"
          : "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tracking-tight"
      }
      style={{ background: team.mark, color: team.ink }}
      aria-hidden
    >
      {team.short}
    </span>
  )
}

function playerImpactText(value: number): string {
  const delta = (value - 1) * 100
  return (delta > 0 ? "+" : "") + delta.toFixed(1) + "%"
}

function ProSquadSummary({ squad }: { squad: ProTeamSquad }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-semibold">{squad.teamName}</p>
      <p className="mt-1 text-xs text-muted">
        EA attribute matches · {squad.ratedPlayerCount}/{squad.squadCount} ESPN roster players · {(squad.factors.coverage * 100).toFixed(0)}%
      </p>
      {squad.topPlayers.length ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {squad.topPlayers.map((player) => (
            <span key={player.id} className="text-xs text-muted">
              {player.name} · {player.position} · {player.overall.toFixed(0)} OVR
            </span>
          ))}
        </div>
      ) : null}
      {squad.dataUpdatedAt ? (
        <p className="mt-2 text-xs text-muted">
          EA ratings snapshot · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(squad.dataUpdatedAt))}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Attack index</p>
          <p className="mt-1 font-display text-xl tabular-nums">{squad.attackIndex.toFixed(1)}</p>
          <p className="text-xs text-muted">Impact {playerImpactText(squad.factors.attackMultiplier)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Creativity index</p>
          <p className="mt-1 font-display text-xl tabular-nums">{squad.creativityIndex.toFixed(1)}</p>
          <p className="text-xs text-muted">Impact {playerImpactText(squad.factors.creativityMultiplier)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Defence index</p>
          <p className="mt-1 font-display text-xl tabular-nums">{squad.defenceIndex.toFixed(1)}</p>
          <p className="text-xs text-muted">Conceding {playerImpactText(squad.factors.defenceMultiplier)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Squad depth</p>
          <p className="mt-1 font-display text-xl tabular-nums">{squad.factors.squadDepth.toFixed(1)}</p>
          <p className="text-xs text-muted">Rotation quality</p>
        </div>
      </div>
    </div>
  )
}

function ProPlayerDataPanel({ data }: { data: ProPlayerData }) {
  const statusLabel: Record<ProPlayerData["status"], string> = {
    available: "EA rating adjustments applied",
    partial: "EA player coverage is insufficient",
    team_not_found: "ESPN team mapping unavailable",
    roster_unavailable: "ESPN current roster unavailable",
    provider_error: "ESPN / EA player data temporarily unavailable",
  }
  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Player and squad intelligence">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl">Player & squad intelligence</h3>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
          {statusLabel[data.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{data.note}</p>
      <p className="mt-1 text-xs text-muted">Sources: ESPN current rosters + {data.provider} · Position-aware indices use EA overall ratings and individual attributes. These are base player-quality estimates, not live form, confirmed lineups, injuries or real-world match statistics.</p>
      {data.home || data.away ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {data.home ? <ProSquadSummary squad={data.home} /> : null}
          {data.away ? <ProSquadSummary squad={data.away} /> : null}
        </div>
      ) : null}
      {data.adjustmentsApplied ? (
        <p className="mt-3 text-xs text-muted">
          Both clubs' EA player-quality indices are incorporated into the Pro match simulation. Pitchline calculates the indices from EA attributes; the adjustment is not an EA prediction or match-engine output.
        </p>
      ) : null}
    </section>
  )
}

function barWidth(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

function exactPct(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

function feedTimestamp(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return "timestamp unavailable"
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date)
}

function edgeCopy(pct: number): string {
  const delta = pct - 100
  if (delta === 0) return "Even pitch"
  const sign = delta > 0 ? "+" : "−"
  return `${sign}${Math.abs(delta)}% home scoring`
}

function TeamSelect({
  id,
  label,
  value,
  blockedId,
  teams,
  onChange,
}: {
  id: string
  label: string
  value: string
  blockedId: string
  teams: Team[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = teams.find((team) => team.id === value)
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: Team[] = []
    for (const league of LEAGUES) {
      const rows = teams
        .filter((team) => team.league === league.id)
        .filter((team) => {
          if (!q) return true
          return (
            team.name.toLowerCase().includes(q) ||
            team.short.toLowerCase().includes(q) ||
            (team.competitionName ?? "").toLowerCase().includes(q) ||
            league.name.toLowerCase().includes(q) ||
            league.short.toLowerCase().includes(q)
          )
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      list.push(...rows)
    }
    return list
  }, [teams, query])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selectedIndex = options.findIndex((team) => team.id === value)
    setCursor(query.trim() ? 0 : Math.max(0, selectedIndex))
  }, [open, query, options, value])

  useEffect(() => {
    if (!open) return
    const node = rootRef.current?.querySelector<HTMLElement>("[data-cursor='true']")
    node?.scrollIntoView({ block: "nearest" })
  }, [cursor, open])

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <span className="mb-2 block text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        className="press flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-base"
        onClick={() => {
          setOpen((current) => !current)
          setQuery("")
        }}
      >
        <span className="min-w-0 truncate">{selected?.name ?? "Choose a team"}</span>
      {selected?.competitionName ? <span className="max-w-28 shrink-0 truncate text-xs text-muted">{selected.competitionName}</span> : null}
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card">
          <label className="sr-only" htmlFor={`${id}-search`}>
            Search teams
          </label>
          <input
            id={`${id}-search`}
            autoFocus
            value={query}
            placeholder="Search teams"
            className="h-11 w-full border-b border-border bg-card px-3 text-base outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setCursor((current) => Math.min(options.length - 1, current + 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setCursor((current) => Math.max(0, current - 1))
              } else if (event.key === "Enter") {
                event.preventDefault()
                const team = options[cursor]
                if (team && team.id !== blockedId) choose(team.id)
              } else if (event.key === "Escape") {
                setOpen(false)
              }
            }}
          />
          <div role="listbox" aria-labelledby={`${id}-label`} className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">No teams match.</p>
            ) : (
              options.map((team, index) => {
                const blocked = team.id === blockedId
                const active = index === cursor
                return (
                  <button
                    key={team.id}
                    type="button"
                    role="option"
                    data-cursor={active ? "true" : "false"}
                    aria-selected={team.id === value}
                    disabled={blocked}
                    className={`flex h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm ${
                      active ? "bg-sunken" : ""
                    } disabled:opacity-40`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(team.id)}
                  >
                    <span className="truncate">{team.name}</span>
                    <span className="max-w-32 shrink-0 truncate text-xs text-muted">{team.competitionName ?? leagueShort(team.league)}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Hist({
  labels,
  values,
  total,
  toneAt,
}: {
  labels: string[]
  values: number[]
  total: number
  toneAt: (index: number) => "home" | "away" | "draw" | "neutral"
}) {
  const max = Math.max(...values, 1)
  const toneClass = {
    home: "bg-primary",
    away: "bg-foreground",
    draw: "bg-draw",
    neutral: "bg-primary",
  }
  return (
    <div className="flex h-48 items-end gap-1">
      {labels.map((label, index) => {
        const value = values[index] ?? 0
        const height = Math.max(value === 0 ? 0 : 4, (value / max) * 100)
        return (
          <div key={label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="flex h-36 items-end">
              <div
                className={`w-full rounded-sm ${toneClass[toneAt(index)]}`}
                style={{ height: `${height}%` }}
                title={`${label}: ${pctLabel(value, total)} · ${value} matches`}
              />
            </div>
            <span className="truncate text-center text-xs text-muted tabular-nums">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function ScoreMatrix({ report }: { report: Report }) {
  const max = Math.max(...report.matrix.flat(), 1)
  const headers = ["0", "1", "2", "3", "4", "5+"]
  return (
    <div>
      <div className="matrix mb-1">
        <span />
        {headers.map((header) => (
          <span key={header} className="text-center text-xs text-muted tabular-nums">
            {header}
          </span>
        ))}
      </div>
      <div className="matrix" role="table" aria-label="Scoreline frequency, home goals across and away goals down">
        {headers.map((awayGoals, awayIndex) => (
          <div key={awayGoals} className="contents">
            <span className="flex items-center text-xs text-muted tabular-nums">{awayGoals}</span>
            {headers.map((homeGoals, homeIndex) => {
              const count = report.matrix[homeIndex]?.[awayIndex] ?? 0
              const intensity = count / max
              const hot = intensity > 0.55
              const isMode = report.mode.h === homeIndex && report.mode.a === awayIndex && homeIndex < 5 && awayIndex < 5
              const modeOverflow =
                report.mode.h >= 5 && report.mode.a >= 5 && homeIndex === 5 && awayIndex === 5
              return (
                <div
                  key={`${homeGoals}-${awayGoals}`}
                  className={`flex h-10 items-center justify-center rounded-sm text-xs tabular-nums sm:h-11 ${
                    isMode || modeOverflow ? "ring-2 ring-primary" : ""
                  }`}
                  style={{
                    background: `color-mix(in oklab, var(--color-primary) ${Math.round(intensity * 88)}%, var(--color-sunken))`,
                    color: hot ? "var(--color-primary-foreground)" : "var(--color-foreground)",
                  }}
                  title={`Home ${homeGoals}, away ${awayGoals}: ${pctLabel(count, report.n)}`}
                >
                  {count === 0 ? "" : (count / report.n * 100).toFixed(1)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Home goals across. Away goals down. Cells are percent of 1,000.</p>
    </div>
  )
}

function minuteLabel(event: TapeEvent): string {
  if (event.kind === "half") return "HT"
  if (event.kind === "full") return "FT"
  return `${event.min}'`
}

function MatchTape({
  home,
  away,
  edge,
  roll,
  model,
}: {
  home: Team
  away: Team
  edge: number
  roll: number
  model: ModelKind
}) {
  const events = useMemo(() => playOne(home, away, edge, roll, model), [home, away, edge, roll, model])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const current = events[Math.min(index, events.length - 1)]

  useEffect(() => {
    setIndex(0)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setPlaying(!reduce)
    if (reduce) setIndex(events.length - 1)
  }, [events])

  useEffect(() => {
    if (!playing) return
    if (index >= events.length - 1) return
    const timer = window.setInterval(() => {
      setIndex((value) => Math.min(events.length - 1, value + 1))
    }, 700)
    return () => window.clearInterval(timer)
  }, [playing, index, events.length])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>("[data-current='true']")
    node?.scrollIntoView({ block: "nearest" })
  }, [index])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">One simulated 90 minutes</p>
          <p className="score-figure mt-2">
            {current.score[0]}
            <span className="px-2 text-muted">–</span>
            {current.score[1]}
          </p>
          <p className="mt-2 text-sm tabular-nums">
            {minuteLabel(current)} · {home.short} {current.score[0]}–{current.score[1]} {away.short}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="press inline-flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            onClick={() => {
              if (index >= events.length - 1) {
                setIndex(0)
                setPlaying(true)
                return
              }
              setPlaying((value) => !value)
            }}
            aria-label={playing && index < events.length - 1 ? "Pause match" : "Play match"}
          >
            {playing && index < events.length - 1 ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button"
            className="press inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"
            onClick={() => {
              setPlaying(false)
              setIndex(events.length - 1)
            }}
          >
            Full time
          </button>
        </div>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Scrub the match</span>
        <input
          className="edge"
          type="range"
          min={0}
          max={events.length - 1}
          value={index}
          suppressHydrationWarning
          onChange={(event) => {
            setPlaying(false)
            setIndex(Number(event.target.value))
          }}
        />
      </label>
      <div ref={listRef} className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1" aria-live="polite">
        {events.slice(0, index + 1).map((event, eventIndex) => {
          const active = eventIndex === index
          return (
            <div
              key={`${event.kind}-${event.min}-${eventIndex}`}
              data-current={active ? "true" : "false"}
              className={`grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 rounded-lg px-2 py-2 ${
                active ? "bg-sunken" : ""
              }`}
            >
              <span className="text-xs text-muted tabular-nums">{minuteLabel(event)}</span>
              <span className={event.kind === "goal" ? "font-medium" : "text-foreground"}>
                <span className="mr-2 text-xs tracking-wide text-muted uppercase">
                  {event.kind === "goal" ? "Goal" : event.kind === "chance" ? "Chance" : event.kind === "card" ? "Card" : ""}
                </span>
                {event.text}
              </span>
              <span className="text-xs tabular-nums text-muted">
                {event.score[0]}–{event.score[1]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function weightLabel(league: LeagueId, weight: number): string {
  const body = weight.toFixed(2)
  return league === "ch" ? `${body} estimate` : body
}

function formSide(name: string, sample: RateSample | null, take: number): string {
  if (!sample) return `${name} stays on the season rate`
  const count = sample.played < take ? `${sample.played} on the feed` : `${sample.played} matches`
  return `${name} ${sample.attack.toFixed(2)} scored and ${sample.defense.toFixed(2)} conceded (${count})`
}

function priceGap(share: number, text: string): string | null {
  const price = Number(text.trim().replace(",", "."))
  if (!text.trim() || !Number.isFinite(price) || price < 1.01) return null
  const implied = 1 / price
  const gap = (share - implied) * 100
  const relation = gap > 0.05 ? "above" : gap < -0.05 ? "below" : "level with"
  const points = Math.abs(gap) < 0.05 ? "0.0" : Math.abs(gap).toFixed(1)
  const ev = (share * price - 1) * 100
  const evText = (ev > 0 ? "+" : "") + ev.toFixed(1) + "%"
  return `Fair ${fairDecimal(share)} from ${exactPct(share)}. Your ${price.toFixed(2)} implies ${(implied * 100).toFixed(1)}%. Model probability is ${points} points ${relation} the market price. Expected return: ${evText} per unit staked, before model error and bookmaker limits.`
}

function ModelBar({
  model,
  formWindow,
  level,
  international = false,
  onModel,
  onForm,
  onLevel,
}: {
  model: ModelKind
  formWindow: FormWindow
  level: boolean
  international?: boolean
  onModel: (model: ModelKind) => void
  onForm: (form: FormWindow) => void
  onLevel: (level: boolean) => void
}) {
  const groups: { label: string; value: string; options: { id: string; label: string }[]; onPick: (id: string) => void }[] = [
    {
      label: "Rates",
      value: formWindow,
      options: [
        { id: "season", label: international ? "Competition base" : "Season" },
        { id: "5", label: "Last 5" },
        { id: "10", label: "Last 10" },
      ],
      onPick: (id) => onForm(id as FormWindow),
    },
    {
      label: "Draws",
      value: model,
      options: [
        { id: "plain", label: "Independent" },
        { id: "dixon", label: "Dixon–Coles" },
      ],
      onPick: (id) => onModel(id as ModelKind),
    },
    {
      label: "Leagues",
      value: level ? "on" : "off",
      options: [
        { id: "off", label: "Raw" },
        { id: "on", label: "UEFA scale" },
      ],
      onPick: (id) => onLevel(id === "on"),
    },
  ]
  const visibleGroups = international ? groups.filter((group) => group.label !== "Leagues") : groups
  return (
    <div className={international ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-3"}>
      {visibleGroups.map((group) => (
        <div key={group.label} className="min-w-0">
          <p className="mb-2 text-sm font-medium">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const pressed = group.value === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => group.onPick(option.id)}
                  className={`press h-11 rounded-lg px-3 text-sm font-medium ${
                    pressed ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function marketsFor(home: Team, away: Team, edge: number, fixture: Fixture, model: ModelKind): MarketPick[] {
  const probabilities = simulate(home, away, edge, 0, model).probabilities
  const rows: { kind: PickKind; label: string; share: number }[] = [
    { kind: "result", label: `${home.name} to win`, share: probabilities.home },
    { kind: "result", label: "Draw", share: probabilities.draw },
    { kind: "result", label: `${away.name} to win`, share: probabilities.away },
    { kind: "goals", label: "Over 2.5 goals", share: probabilities.over25 },
    { kind: "goals", label: "Under 2.5 goals", share: probabilities.under25 },
    { kind: "goals", label: "Over 3.5 goals", share: probabilities.over35 },
    { kind: "goals", label: "Under 1.5 goals", share: probabilities.under15 },
    { kind: "btts", label: "Both teams to score", share: probabilities.btts },
    { kind: "btts", label: "Not both to score", share: 1 - probabilities.btts },
  ]
  return rows.map((row) => ({ key: `${fixture.id}:${row.label}`, fixture, label: row.label, kind: row.kind, share: row.share }))
}

export function Pitchline({
  initial,
  initialView = "desk",
  initialLeague = "eng",
  showHeader = true,
}: {
  initial: Board
  initialView?: "desk" | "picks"
  initialLeague?: LeagueId
  showHeader?: boolean
}) {
  const session = useFirebaseSession()
  const isPro = session.user?.isPro === true
  const firstInitialFixture = initial.fixtures.find((fixture) => fixture.league === initialLeague)
  const firstInitialTeam = initial.teams.find((team) => team.league === initialLeague)
  const [board, setBoard] = useState(initial)
  const [league, setLeague] = useState<LeagueId>(initialLeague)
  const [homeId, setHomeId] = useState(firstInitialFixture?.homeId ?? firstInitialTeam?.id ?? "eng-ars")
  const [awayId, setAwayId] = useState(firstInitialFixture?.awayId ?? initial.teams.find((team) => team.league === initialLeague && team.id !== firstInitialTeam?.id)?.id ?? "eng-liv")
  const [edgePct, setEdgePct] = useState(initialLeague === "int" ? 100 : 118)
  const [roll, setRoll] = useState(0)
  const [spread, setSpread] = useState(-0.5)
  const [totalLine, setTotalLine] = useState(2.5)
  const [running, setRunning] = useState(false)
  const [watching, setWatching] = useState(false)
  const [tapeRoll, setTapeRoll] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>("index")
  const [sortAsc, setSortAsc] = useState(false)
  const [ready, setReady] = useState(false)
  const [engineMode, setEngineMode] = useState<"pro" | "classic">("classic")
  const [proReport, setProReport] = useState<ProReport | null>(null)
  const [proLoading, setProLoading] = useState(false)
  const [proError, setProError] = useState<string | null>(null)
  const view = initialView
  const [pickKind, setPickKind] = useState<PickKind | "all">("all")
  const [pickLeague, setPickLeague] = useState<LeagueId | "all">("all")
  const [model, setModel] = useState<ModelKind>("plain")
  const [formWindow, setFormWindow] = useState<FormWindow>("season")
  const [level, setLevel] = useState(false)
  const [formPair, setFormPair] = useState<FormResult | null>(null)
  const [formNote, setFormNote] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle")
  const [priceMarket, setPriceMarket] = useState<PriceMarket>("home")
  const deskRef = useRef<HTMLElement>(null)
  const [priceText, setPriceText] = useState("")
  const tapeRef = useRef<HTMLElement>(null)
  const runTimer = useRef<number | null>(null)

  useEffect(() => {
    setBoard(initial)
  }, [initial])

  useEffect(() => {
    if (session.loading) return
    const saved = readDesk()
    setEngineMode(isPro && saved?.engineMode === "classic" ? "classic" : isPro ? "pro" : "classic")
  }, [session.loading, session.user?.uid, isPro])

  useEffect(() => {
    // The international route is date-scoped by its server page. Do not replace
    // that selected date with the generic upcoming board on a background refresh.
    if (initialLeague === "int") return
    let stop = false
    const pull = () => {
      loadBoard()
        .then((next) => {
          if (!stop) setBoard(next)
        })
        .catch(() => {})
    }
    const timer = window.setInterval(pull, 15 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - new Date(board.updatedAt).getTime() > 15 * 60 * 1000) pull()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stop = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [board.updatedAt, initialLeague])

  useEffect(() => {
    const saved = readDesk()
    const known = (id?: string) => Boolean(id && initial.teams.some((team) => team.id === id))
    if (initialLeague === "int") {
      setLeague("int")
      const fixture = initial.fixtures.find((item) => item.league === "int")
      const firstTeam = initial.teams.find((team) => team.league === "int")
      if (fixture) {
        setHomeId(fixture.homeId)
        setAwayId(fixture.awayId)
      } else if (firstTeam) {
        setHomeId(firstTeam.id)
        setAwayId(initial.teams.find((team) => team.league === "int" && team.id !== firstTeam.id)?.id ?? firstTeam.id)
      }
    } else if (saved) {
      if (saved.league && LEAGUES.some((item) => item.id === saved.league)) setLeague(saved.league)
      if (known(saved.homeId)) setHomeId(saved.homeId!)
      if (known(saved.awayId)) setAwayId(saved.awayId!)
      if (typeof saved.edgePct === "number") setEdgePct(Math.min(140, Math.max(85, Math.round(saved.edgePct))))
      if (typeof saved.spread === "number") setSpread(roundHalf(saved.spread))
      if (typeof saved.totalLine === "number") setTotalLine(roundHalf(saved.totalLine))
      if (saved.model === "plain" || saved.model === "dixon") setModel(saved.model)
      if (saved.form === "season" || saved.form === "5" || saved.form === "10") setFormWindow(saved.form)
      if (typeof saved.level === "boolean") setLevel(saved.level)
    }
    setReady(true)
    return () => {
      if (runTimer.current) window.clearTimeout(runTimer.current)
    }
  }, [initial.teams, initial.fixtures, initialLeague])

  useEffect(() => {
    if (!ready) return
    const known = (id: string) => board.teams.some((team) => team.id === id)
    let homeNext = homeId
    let awayNext = awayId
    if (!known(homeNext)) {
      homeNext = board.teams.find((team) => team.league === league)?.id ?? board.teams[0]?.id ?? homeNext
    }
    if (!known(awayNext) || awayNext === homeNext) {
      awayNext =
        board.teams.find((team) => team.league === league && team.id !== homeNext)?.id ??
        board.teams.find((team) => team.id !== homeNext)?.id ??
        awayNext
    }
    if (homeNext !== homeId) setHomeId(homeNext)
    if (awayNext !== awayId) setAwayId(awayNext)
  }, [ready, board.teams, homeId, awayId, league])

  useEffect(() => {
    if (!ready) return
    if (session.loading) return
    const payload: DeskState = { league, homeId, awayId, edgePct, spread, totalLine, model, form: formWindow, level, engineMode: isPro ? engineMode : undefined }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [ready, session.loading, league, homeId, awayId, edgePct, spread, totalLine, model, formWindow, level, engineMode])

  const teamBy = (id: string) => board.teams.find((team) => team.id === id)
  const home = teamBy(homeId) ?? board.teams.find((team) => team.league === league) ?? board.teams[0]
  const away = teamBy(awayId) ?? board.teams.find((team) => team.league === league && team.id !== home.id) ?? board.teams.find((team) => team.id !== home.id) ?? board.teams[0]
  const edge = edgePct / 100
  const same = home.id === away.id
  const selectedFixture = board.fixtures.find((fixture) => fixture.homeId === home.id && fixture.awayId === away.id)

  useEffect(() => {
    if (formWindow === "season") {
      setFormPair(null)
      setFormNote("idle")
      return
    }
    const homeEspn = home.espnId ?? ""
    const awayEspn = away.espnId ?? ""
    if (!homeEspn && !awayEspn) {
      setFormPair(null)
      setFormNote("missing")
      return
    }
    let stop = false
    setFormPair(null)
    setFormNote("loading")
    loadForm({
      data: {
        homeSlug: home.feedSlug ?? "",
        homeEspn,
        awaySlug: away.feedSlug ?? "",
        awayEspn,
      },
    })
      .then((result) => {
        if (stop) return
        setFormPair(result)
        setFormNote("ready")
      })
      .catch(() => {
        if (stop) return
        setFormPair(null)
        setFormNote("error")
      })
    return () => {
      stop = true
    }
  }, [formWindow, home.id, away.id, home.espnId, home.feedSlug, away.espnId, away.feedSlug])

  const take = formWindow === "5" ? 5 : 10
  const desk = useMemo(() => {
    const homeSample = formWindow === "season" || formNote !== "ready" ? null : formRate(formPair?.home?.games, take)
    const awaySample = formWindow === "season" || formNote !== "ready" ? null : formRate(formPair?.away?.games, take)
    return { ...shapePair(home, away, board.teams, level, homeSample, awaySample), homeSample, awaySample }
  }, [home, away, board.teams, level, formWindow, formNote, formPair, take])

  const classicReport = useMemo(
    () => (same ? null : simulate(desk.home, desk.away, edge, roll, model)),
    [same, desk.home, desk.away, edge, roll, model],
  )

  useEffect(() => {
    if (!isPro || engineMode !== "pro" || view !== "desk" || same) {
      setProReport(null)
      setProLoading(false)
      setProError(null)
      return
    }

    const controller = new AbortController()
    setProReport(null)
    setProLoading(true)
    setProError(null)
    loadProSimulation({
      data: {
        home: { ...desk.home, espnId: home.espnId, feedSlug: home.feedSlug },
        away: { ...desk.away, espnId: away.espnId, feedSlug: away.feedSlug },
        edge,
        roll,
      },
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        setProReport(result)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProError(error instanceof Error ? error.message : "The Pro simulation could not be completed.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setProLoading(false)
      })

    return () => controller.abort()
  }, [isPro, engineMode, view, same, desk.home, desk.away, edge, roll])

  const report = isPro && engineMode === "pro" && view === "desk" ? proReport : classicReport

  const handicap = report ? splitHandicap(report.scores, spread) : null
  const totals = report ? splitTotal(report.scores, totalLine) : null

  const table = useMemo(() => {
    const peers = board.teams.filter((team) => team.league === league)
    const rows = peers.map((team) => ({
      team,
      net: team.attack - team.defense,
      index: indexFor(team, peers),
    }))
    const dir = sortAsc ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === "name") return a.team.name.localeCompare(b.team.name) * dir
      if (sortKey === "attack") return (a.team.attack - b.team.attack) * dir
      if (sortKey === "defense") return (a.team.defense - b.team.defense) * dir
      return (a.index - b.index) * dir
    })
    return rows
  }, [league, sortKey, sortAsc, board.teams])

  const fixtures = board.fixtures.filter((fixture) => fixture.league === league)
  const leagueStatus = board.leagueStatus[league]

  const picks = useMemo(() => {
    if (view !== "picks") return []
    const byId = new Map(board.teams.map((team) => [team.id, team]))
    const ranked: MarketPick[] = []
    for (const fixture of board.fixtures) {
      const homeTeam = byId.get(fixture.homeId)
      const awayTeam = byId.get(fixture.awayId)
      if (!homeTeam || !awayTeam || homeTeam.id === awayTeam.id) continue
      // Do not surface probabilities based on the neutral placeholder ratings.
      // International Best Picks require at least three prior games per team.
      if (fixture.league === "int" &&
        !hasInternationalPickHistory(homeTeam.formMatches, awayTeam.formMatches)) continue
      const shapedFixture = shapePair(homeTeam, awayTeam, board.teams, level, null, null)
      const fixtureEdge = fixture.league === "int" ? 1 : edge
      ranked.push(...marketsFor(shapedFixture.home, shapedFixture.away, fixtureEdge, fixture, model))
    }
    ranked.sort((a, b) => b.share - a.share || a.label.localeCompare(b.label))
    return ranked
  }, [view, board.fixtures, board.teams, edge, model, level])

  const visiblePicks = picks.filter((pick) => {
    if (pickKind !== "all" && pick.kind !== pickKind) return false
    if (pickLeague !== "all" && pick.fixture.league !== pickLeague) return false
    return true
  })
  const hotPicks = visiblePicks.filter((pick) => pick.share >= PICK_LINE)
  const shownPicks = hotPicks.length ? hotPicks : visiblePicks.slice(0, 5)

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortAsc((value) => !value)
      return
    }
    setSortKey(next)
    setSortAsc(next === "defense" || next === "name")
  }

  function loadFixture(homeNext: string, awayNext: string, leagueNext: LeagueId) {
    setLeague(leagueNext)
    setHomeId(homeNext)
    setAwayId(awayNext)
  }

  function openPick(pick: MarketPick) {
    // Persist the selected fixture before navigating to the dedicated match desk page.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      league: pick.fixture.league,
      homeId: pick.fixture.homeId,
      awayId: pick.fixture.awayId,
      edgePct,
      spread,
      totalLine,
      model,
      form: formWindow,
      level,
      engineMode: isPro ? engineMode : undefined,
    } satisfies DeskState))
    window.location.assign("/")
  }

  function rerun() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setRoll((value) => value + 1)
      return
    }
    setRunning(true)
    if (runTimer.current) window.clearTimeout(runTimer.current)
    runTimer.current = window.setTimeout(() => {
      setRoll((value) => value + 1)
      setRunning(false)
    }, 280)
  }

  function openTape() {
    setWatching(true)
    setTapeRoll((value) => value + 1)
    window.setTimeout(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      tapeRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    }, 30)
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pt-4 pb-16 sm:px-6">
      {showHeader ? <SiteHeader subtitle={league === "int" ? "International match simulator" : `Football match simulator · ${board.season}`} /> : null}

      {view === "picks" ? (
        <section className="mb-6" aria-label="Best picks">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl tracking-tight">Best upcoming picks</h2>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Markets with model-assigned probability of at least 80%. Club picks use season rates; national-team picks require at least three previous matches in that competition and use neutral home edge. International ratings are still exploratory, not independently calibrated.
              </p>
            </div>
            <p className="text-sm text-muted tabular-nums">
              {hotPicks.length ? `${hotPicks.length} clear 80%` : "None at 80%"}
            </p>
          </div>

          <div className="panel mb-4">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="picks-edge" className="text-sm font-medium">
                Home edge
              </label>
              <span className="font-display text-xl tabular-nums">{edgeCopy(edgePct)}</span>
            </div>
            <input
              id="picks-edge"
              className="edge mt-2"
              type="range"
              min={85}
              max={140}
              step={1}
              value={edgePct}
              suppressHydrationWarning
              onChange={(event) => setEdgePct(Number(event.target.value))}
            />
            <div className="mt-5">
              <ModelBar
                model={model}
                formWindow={formWindow}
                level={level}
                onModel={setModel}
                onForm={setFormWindow}
                onLevel={setLevel}
              />
              <p className="mt-3 text-xs text-muted">
                Last 5 and last 10 use recency-weighted completed matches on the open match only. Dixon–Coles (ρ = {DIXON_RHO.toFixed(2)}) applies to both. The UEFA association proxy is for cross-league club comparisons, not national teams.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["result", "Result"],
                  ["goals", "Goals"],
                  ["btts", "Both score"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={pickKind === id}
                  onClick={() => setPickKind(id)}
                  className={`press h-11 rounded-lg px-3 text-sm font-medium ${
                    pickKind === id ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm font-medium" htmlFor="picks-league">
              Competition
              <span className="relative mt-2 block">
                <select
                  id="picks-league"
                  value={pickLeague}
                  onChange={(event) => setPickLeague(event.target.value as LeagueId | "all")}
                  className="h-11 w-full appearance-none rounded-lg border border-border bg-card pr-10 pl-3 text-base"
                >
                  <option value="all">All competitions</option>
                  {LEAGUES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
              </span>
            </label>
          </div>

          {shownPicks.length === 0 ? (
            <section className="panel">
              <p className="text-sm">
                No picks currently qualify for this selection. International matches without at least three previous results per team are deliberately withheld from Best Picks.
              </p>
            </section>
          ) : (
            <div className="space-y-2">
              {!hotPicks.length ? (
                <p className="mb-2 text-sm text-muted">Nothing clears 80% here. Closest calls:</p>
              ) : null}
              {shownPicks.map((pick) => {
                const homeTeam = teamBy(pick.fixture.homeId)
                const awayTeam = teamBy(pick.fixture.awayId)
                if (!homeTeam || !awayTeam) return null
                return (
                  <button
                    key={pick.key}
                    type="button"
                    onClick={() => openPick(pick)}
                    className="press flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left"
                  >
                    <span className="w-16 shrink-0">
                      <span className="block font-display text-2xl tabular-nums">{(pick.share * 100).toFixed(1)}%</span>
                      <span className="block text-xs text-muted tabular-nums">{fairDecimal(pick.share)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{pick.label}</span>
                      <span className="mt-1 block truncate text-sm text-muted">
                        {pick.fixture.competitionName ?? leagueShort(pick.fixture.league)} · {pick.fixture.when}
                      </span>
                      <span className="mt-1 block truncate text-sm">
                        {awayTeam.name} at {homeTeam.name}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <>
      <div className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="League">
        {LEAGUES.map((item) => {
          const selected = item.id === league
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setLeague(item.id)}
              className={`press h-11 shrink-0 rounded-lg px-4 text-sm font-medium ${
                selected ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"
              }`}
            >
              {item.short}
            </button>
          )
        })}
      </div>

      <section className="mb-6" aria-label="Matchweek">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl tracking-tight">Up next</h2>
          <p className="text-sm text-muted">{board.weekends[league]} · refreshes on its own</p>
        </div>
        <div className="rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {fixtures.length === 0 ? (
            <p className="text-sm text-muted">No fixtures in this window. The board below is still live.</p>
          ) : null}
          {fixtures.map((fixture) => {
            const homeTeam = teamBy(fixture.homeId)
            const awayTeam = teamBy(fixture.awayId)
            if (!homeTeam || !awayTeam) return null
            const shapedFixture = shapePair(homeTeam, awayTeam, board.teams, level, null, null)
            const split = analyticalSplit(shapedFixture.home, shapedFixture.away, edge, model)
            const active = homeTeam.id === home.id && awayTeam.id === away.id
            return (
              <button
                key={fixture.id}
                type="button"
                data-active={active ? "true" : "false"}
                onClick={() => loadFixture(homeTeam.id, awayTeam.id, fixture.league)}
                className="fixture w-60 shrink-0 snap-start rounded-3xl border border-border bg-card p-4 text-left"
              >
                <p className="text-xs text-muted">{fixture.competitionName ? fixture.competitionName + " · " : ""}{fixture.when}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Crest team={homeTeam} />
                  <span className="truncate text-sm font-medium">{homeTeam.name}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Crest team={awayTeam} />
                  <span className="truncate text-sm font-medium">{awayTeam.name}</span>
                </div>
                <p className="mt-3 font-display text-xl tabular-nums">
                  {split.homeXg.toFixed(2)}
                  <span className="px-1 text-muted">–</span>
                  {split.awayXg.toFixed(2)}
                </p>
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sunken">
                  <span className="bg-primary" style={{ width: barWidth(split.home) }} />
                  <span className="bg-draw" style={{ width: barWidth(split.draw) }} />
                  <span className="bg-foreground" style={{ width: barWidth(split.away) }} />
                </div>
                <p className="mt-2 text-xs text-muted tabular-nums">
                  {shareLabel(split.home)} · {shareLabel(split.draw)} · {shareLabel(split.away)}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel mb-4" id="match-desk" ref={deskRef}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-tight">Predict the match</h2>
            <p className="mt-1 text-sm text-muted">Home and away can come from any league.</p>
          </div>
        </div>

        {isPro ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Simulation engine</p>
                <p className="mt-1 text-xs text-muted">Pro Engine is your default. You can switch to the classic model whenever you prefer.</p>
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">Pro access</span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose simulation engine">
              <button
                type="button"
                aria-pressed={engineMode === "pro"}
                onClick={() => setEngineMode("pro")}
                className={`press flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium ${engineMode === "pro" ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}
              >
                <Sparkles className="size-4" />
                Pro Engine
              </button>
              <button
                type="button"
                aria-pressed={engineMode === "classic"}
                onClick={() => setEngineMode("classic")}
                className={`press min-h-11 rounded-lg px-3 text-sm font-medium ${engineMode === "classic" ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}
              >
                Classic Monte Carlo
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <TeamSelect
            id="home-club"
            label="Home"
            value={home.id}
            blockedId={away.id}
            teams={board.teams}
            onChange={setHomeId}
          />
          <button
            type="button"
            className="press inline-flex size-11 items-center justify-center rounded-lg border border-border"
            aria-label="Swap home and away"
            onClick={() => {
              setHomeId(away.id)
              setAwayId(home.id)
            }}
          >
            <ArrowLeftRight className="size-4" />
          </button>
          <TeamSelect
            id="away-club"
            label="Away"
            value={away.id}
            blockedId={home.id}
            teams={board.teams}
            onChange={setAwayId}
          />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="home-edge" className="text-sm font-medium">
              Home edge
            </label>
            <span className="font-display text-xl tabular-nums">{edgeCopy(edgePct)}</span>
          </div>
          <input
            id="home-edge"
            className="edge mt-2"
            type="range"
            min={85}
            max={140}
            step={1}
            value={edgePct}
            suppressHydrationWarning
            onChange={(event) => setEdgePct(Number(event.target.value))}
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>Away favored</span>
            <span>Even</span>
            <span>Home favored</span>
          </div>
        </div>

        {isPro && engineMode === "pro" ? (
          <div className="mt-5 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="text-sm font-semibold">Phase-of-play simulation · 2,500 matches</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              Possessions move through build-up, progression, chance creation and finishing. The model adjusts for the score, late-game urgency and fatigue.
            </p>
            <p className="mt-2 text-xs text-muted">
              Team-level rates remain the baseline. ESPN supplies the current roster; Pitchline matches those players to EA FC 27 base attributes. Adjustments require at least 12 matched players and 60% roster coverage for both teams. EA ratings do not establish current form or matchday availability.
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <ModelBar
              model={model}
              formWindow={formWindow}
              level={level}
              international={league === "int"}
              onModel={setModel}
              onForm={setFormWindow}
              onLevel={setLevel}
            />
            <p className="mt-3 text-xs text-muted">
              Independent Poisson is the default. Dixon–Coles (ρ = {DIXON_RHO.toFixed(2)}) lifts 0–0 and 1–1.{" "}
              {league === "int"
                ? "National-team scoring and conceding rates come from each team's previous completed fixtures in the same international competition. Teams without returned history use a neutral fallback."
                : "The UEFA scale is a coarse association-level proxy for cross-league club comparisons, not a calibrated national-team strength measure."}
            </p>
          </div>
        )}

        {formWindow !== "season" ? (
          <p className="mt-3 text-sm text-muted">
            {formNote === "loading"
              ? "Reading recent matches…"
              : formNote === "missing"
                ? league === "int"
                  ? "No completed history returned for one or both teams. Competition-base rates stay on."
                  : "Recent form needs the live tables. Season rates stay on."
                : formNote === "error"
                  ? league === "int"
                    ? "International match history did not load. Competition-base rates stay on."
                    : "Recent matches did not load. Season rates stay on."
                  : `Last ${take}: ${formSide(home.short, desk.homeSample, take)}. ${formSide(away.short, desk.awaySample, take)}.`}
          </p>
        ) : null}


        {league === "int" && home.competitionName !== away.competitionName ? (
          <p className="mt-3 text-sm text-muted">
            These teams' ratings come from different competition schedules ({home.competitionName} and {away.competitionName}). The simulator uses raw goals-for/goals-against rates without cross-competition calibration, so treat this comparison as exploratory.
          </p>
        ) : null}

        {desk.homeLeague !== desk.awayLeague ? (
          <p className="mt-3 text-sm text-muted">
            {!level
              ? `${leagueName(desk.homeLeague)} against ${leagueName(desk.awayLeague)}. League scale is off, so a goal a game counts the same in both.`
              : desk.leveled
                ? `${leagueName(desk.homeLeague)} ${weightLabel(desk.homeLeague, desk.homeWeight)} against ${leagueName(desk.awayLeague)} ${weightLabel(desk.awayLeague, desk.awayWeight)}. Attack is multiplied by that weight. Defense is divided by it.`
                : `${leagueName(desk.homeLeague)} and ${leagueName(desk.awayLeague)} both sit at ${desk.homeWeight.toFixed(2)}, so the scale cancels.`}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="press inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
            onClick={rerun}
            disabled={same || running}
          >
            <RotateCcw className="size-4" />
            {running ? "Simulating…" : isPro && engineMode === "pro" ? `Run ${PRO_SIM_RUNS.toLocaleString("en-GB")} again` : `Run ${SIMS.toLocaleString("en-GB")} again`}
          </button>
          {!(isPro && engineMode === "pro") ? (
            <button
              type="button"
              className="press inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-40"
              onClick={openTape}
              disabled={same}
            >
              <Play className="size-4" />
              Play one match
            </button>
          ) : null}
        </div>
      </section>

      {same ? (
        <section className="panel mb-4">
          <p className="text-sm">Pick two different teams.</p>
        </section>
      ) : isPro && engineMode === "pro" && proLoading ? (
        <section className="panel mb-4" aria-live="polite">
          <p className="text-sm font-medium">Running the Pro phase-of-play simulation…</p>
          <p className="mt-1 text-sm text-muted">Simulating 2,500 matches as possession sequences.</p>
        </section>
      ) : isPro && engineMode === "pro" && proError ? (
        <section className="panel mb-4" role="alert">
          <p className="text-sm font-medium">Pro simulation unavailable</p>
          <p className="mt-1 text-sm text-muted">{proError}</p>
          <button
            type="button"
            className="press mt-3 h-11 rounded-lg border border-border px-4 text-sm font-medium"
            onClick={() => setEngineMode("classic")}
          >
            Switch to Classic Monte Carlo
          </button>
        </section>
      ) : !report ? (
        <section className="panel mb-4">
          <p className="text-sm">The simulation is unavailable. Try running it again.</p>
        </section>
      ) : (
        <div className={running ? "opacity-60" : undefined} aria-busy={running}>
          <section className="panel mb-4">
            <div className="grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="text-sm text-muted">Expected goals</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crest team={home} large />
                    <span className="truncate text-sm font-medium sm:text-base">{home.name}</span>
                  </div>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <span className="truncate text-sm font-medium sm:text-base">{away.name}</span>
                    <Crest team={away} large />
                  </div>
                </div>
                <p className="score-figure mt-4 text-center">
                  {report.homeXg.toFixed(2)}
                  <span className="px-2 text-muted">–</span>
                  {report.awayXg.toFixed(2)}
                </p>
                <p className="mt-3 text-center text-sm text-muted tabular-nums">
                  Sim mean {report.meanHome.toFixed(2)}–{report.meanAway.toFixed(2)} · most likely {report.mode.h}–
                  {report.mode.a} ({pctLabel(report.mode.n, report.n)})
                </p>
              </div>
              <div>
                <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className="bg-primary" style={{ width: barWidth(report.probabilities.home) }} />
                  <span className="bg-draw" style={{ width: barWidth(report.probabilities.draw) }} />
                  <span className="bg-foreground" style={{ width: barWidth(report.probabilities.away) }} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-xs text-muted">Home</dt>
                    <dd className="font-display text-2xl tabular-nums">{exactPct(report.probabilities.home)}</dd>
                    <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.home)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Draw</dt>
                    <dd className="font-display text-2xl tabular-nums">{exactPct(report.probabilities.draw)}</dd>
                    <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.draw)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Away</dt>
                    <dd className="font-display text-2xl tabular-nums">{exactPct(report.probabilities.away)}</dd>
                    <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.away)}</dd>
                  </div>
                </dl>
              </div>
            </div>
            {isPro && engineMode === "pro" && proReport ? (
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Possession</dt>
                    <dd className="mt-1 font-medium tabular-nums">{home.short} {proReport.details.possessionHomePct.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Average shots</dt>
                    <dd className="mt-1 font-medium tabular-nums">{proReport.details.shotsHome.toFixed(1)}–{proReport.details.shotsAway.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Shots on target</dt>
                    <dd className="mt-1 font-medium tabular-nums">{proReport.details.shotsOnTargetHome.toFixed(1)}–{proReport.details.shotsOnTargetAway.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Build-up success</dt>
                    <dd className="mt-1 font-medium tabular-nums">{proReport.details.buildUpSuccessHomePct.toFixed(1)}%–{proReport.details.buildUpSuccessAwayPct.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Progression success</dt>
                    <dd className="mt-1 font-medium tabular-nums">{proReport.details.progressionSuccessHomePct.toFixed(1)}%–{proReport.details.progressionSuccessAwayPct.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Chance creation</dt>
                    <dd className="mt-1 font-medium tabular-nums">{proReport.details.chanceCreationHomePct.toFixed(1)}%–{proReport.details.chanceCreationAwayPct.toFixed(1)}%</dd>
                  </div>
              </dl>
            ) : null}
            {isPro && engineMode === "pro" && proReport?.playerData ? <ProPlayerDataPanel data={proReport.playerData} /> : null}
            <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div>
                <dt className="text-xs text-muted">Both score</dt>
                <dd className="text-lg font-medium tabular-nums">{exactPct(report.probabilities.btts)}</dd>
                <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.btts)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Over 2.5</dt>
                <dd className="text-lg font-medium tabular-nums">{exactPct(report.probabilities.over25)}</dd>
                <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.over25)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{home.short} clean sheet</dt>
                <dd className="text-lg font-medium tabular-nums">{exactPct(report.probabilities.homeClean)}</dd>
                <dd className="text-xs text-muted tabular-nums">{fairDecimal(report.probabilities.homeClean)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Small figures are fair decimal odds from the count. Not a price.</p>
          </section>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="panel">
              <h2 className="font-display text-2xl tracking-tight">Scorelines</h2>
              <p className="mt-1 mb-4 text-sm text-muted">Share of the {report.n.toLocaleString("en-GB")} simulated matches. The ring marks the mode inside 0–4.</p>
              <ScoreMatrix report={report} />
              <ol className="mt-4 space-y-1">
                {report.top.map((line) => (
                  <li key={`${line.h}-${line.a}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="tabular-nums">
                      {home.short} {line.h}–{line.a} {away.short}
                    </span>
                    <span className="text-muted tabular-nums">{pctLabel(line.n, report.n)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid gap-4">
              <section className="panel">
                <h2 className="font-display text-2xl tracking-tight">Margin</h2>
                <p className="mt-1 mb-4 text-sm text-muted">
                  Home goals minus away goals. The dark bars are away wins.
                </p>
                <Hist
                  labels={marginLabels()}
                  values={report.margins}
                  total={report.n}
                  toneAt={(index) => (index < 4 ? "away" : index === 4 ? "draw" : "home")}
                />
              </section>
              <section className="panel">
                <h2 className="font-display text-2xl tracking-tight">Total goals</h2>
                <p className="mt-1 mb-4 text-sm text-muted">Both teams combined. The last bar is 7 or more.</p>
                <Hist
                  labels={totalLabels()}
                  values={report.totals}
                  total={report.n}
                  toneAt={() => "neutral"}
                />
              </section>
            </div>
          </div>

          <section className="panel mb-4">
            <h2 className="font-display text-2xl tracking-tight">Your lines</h2>
            <p className="mt-1 mb-5 text-sm text-muted">
              A price you saw, a home handicap, or a goals total. Whole numbers can push. Still a count, not a tip.
            </p>
            <div className="mb-6">
              <p className="text-sm font-medium">A price you saw</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
                <label className="block min-w-0 text-sm" htmlFor="price-market">
                  <span className="sr-only">Market</span>
                  <span className="relative block">
                    <select
                      id="price-market"
                      value={priceMarket}
                      onChange={(event) => setPriceMarket(event.target.value as PriceMarket)}
                      className="h-11 w-full appearance-none rounded-lg border border-border bg-card pr-10 pl-3 text-base"
                    >
                      <option value="home">{home.name} to win</option>
                      <option value="draw">Draw</option>
                      <option value="away">{away.name} to win</option>
                      <option value="btts">Both teams to score</option>
                      <option value="over">Over 2.5 goals</option>
                      <option value="under">Under 2.5 goals</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
                  </span>
                </label>
                <label className="block text-sm" htmlFor="price-decimal">
                  <span className="sr-only">Decimal price</span>
                  <input
                    id="price-decimal"
                    inputMode="decimal"
                    placeholder="1.80"
                    value={priceText}
                    onChange={(event) => setPriceText(event.target.value)}
                    className="h-11 w-full rounded-lg border border-border bg-card px-3 text-base tabular-nums"
                  />
                </label>
              </div>
              <p className="mt-3 text-sm text-muted">
                {priceGap(
                  priceMarket === "home"
                    ? report.probabilities.home
                    : priceMarket === "draw"
                      ? report.probabilities.draw
                      : priceMarket === "away"
                        ? report.probabilities.away
                        : priceMarket === "btts"
                          ? report.probabilities.btts
                          : priceMarket === "over"
                            ? report.probabilities.over25
                            : report.probabilities.under25,
                  priceText,
                ) ?? "Type a decimal above 1.01 to compare it with the fair price."}
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">Home handicap</p>
                  <p className="font-display text-2xl tabular-nums">{formatLine(spread)}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="press inline-flex size-11 items-center justify-center rounded-lg border border-border"
                    aria-label="Decrease home handicap"
                    onClick={() => setSpread((value) => roundHalf(Math.max(-3.5, value - 0.5)))}
                    disabled={spread <= -3.5}
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    className="edge"
                    type="range"
                    min={-3.5}
                    max={3.5}
                    step={0.5}
                    value={spread}
                    aria-label="Home handicap"
                    suppressHydrationWarning
                    onChange={(event) => setSpread(roundHalf(Number(event.target.value)))}
                  />
                  <button
                    type="button"
                    className="press inline-flex size-11 items-center justify-center rounded-lg border border-border"
                    aria-label="Increase home handicap"
                    onClick={() => setSpread((value) => roundHalf(Math.min(3.5, value + 0.5)))}
                    disabled={spread >= 3.5}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {handicap ? (
                  <p className="mt-3 text-sm">
                    {home.short} {formatLine(spread)} covers in{" "}
                    <span className="font-medium tabular-nums">{pctLabel(handicap.win, report.n)}</span>
                    {handicap.push > 0 ? (
                      <>
                        {" "}
                        · push <span className="tabular-nums">{pctLabel(handicap.push, report.n)}</span>
                      </>
                    ) : null}
                    {" "}
                    · fails <span className="tabular-nums">{pctLabel(handicap.lose, report.n)}</span>
                  </p>
                ) : null}
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">Total goals</p>
                  <p className="font-display text-2xl tabular-nums">{formatLine(totalLine)}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="press inline-flex size-11 items-center justify-center rounded-lg border border-border"
                    aria-label="Decrease total"
                    onClick={() => setTotalLine((value) => roundHalf(Math.max(0.5, value - 0.5)))}
                    disabled={totalLine <= 0.5}
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    className="edge"
                    type="range"
                    min={0.5}
                    max={6.5}
                    step={0.5}
                    value={totalLine}
                    aria-label="Total goals line"
                    suppressHydrationWarning
                    onChange={(event) => setTotalLine(roundHalf(Number(event.target.value)))}
                  />
                  <button
                    type="button"
                    className="press inline-flex size-11 items-center justify-center rounded-lg border border-border"
                    aria-label="Increase total"
                    onClick={() => setTotalLine((value) => roundHalf(Math.min(6.5, value + 0.5)))}
                    disabled={totalLine >= 6.5}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {totals ? (
                  <p className="mt-3 text-sm">
                    Over <span className="font-medium tabular-nums">{pctLabel(totals.over, report.n)}</span>
                    {totals.push > 0 ? (
                      <>
                        {" "}
                        · push <span className="tabular-nums">{pctLabel(totals.push, report.n)}</span>
                      </>
                    ) : null}
                    {" "}
                    · under <span className="tabular-nums">{pctLabel(totals.under, report.n)}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      )}

      {watching && !same && !(isPro && engineMode === "pro") ? (
        <section className="panel mb-4" ref={tapeRef}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl tracking-tight">Match tape</h2>
            <button
              type="button"
              className="press h-11 rounded-lg px-3 text-sm font-medium text-muted"
              onClick={() => setWatching(false)}
            >
              Close
            </button>
          </div>
          <MatchTape home={desk.home} away={desk.away} edge={edge} roll={tapeRoll} model={model} />
        </section>
      ) : null}

      <section className="panel mb-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-tight">{leagueName(league)} board</h2>
            <p className="mt-1 text-sm text-muted">
              {isCup(league)
                ? "European clubs take their domestic scoring into the tie. Sides from leagues we don't carry are rated on their European games, pulled toward average when the sample is short. Index ranks net goals inside this competition. "
                : "Attack is goals scored per match this season, defense is goals conceded. Lower defense is tighter. Index ranks net goals inside this league. "}
              {leagueStatus.standings === "live"
                ? `Standings: live (${leagueStatus.teamCount} clubs), refreshed ${feedTimestamp(leagueStatus.updatedAt)}.`
                : `Standings: saved snapshot from ${feedTimestamp(leagueStatus.updatedAt)}; live feed unavailable for this competition.`}
              {leagueStatus.fixtures === "snapshot"
                ? ` Fixtures are using saved fallback data from ${feedTimestamp(leagueStatus.fixturesUpdatedAt)}.`
                : ` Fixtures are from the live feed, refreshed ${feedTimestamp(leagueStatus.fixturesUpdatedAt)}.`}
            </p>
          </div>
          <p className="text-sm text-muted">Tap a club for home. Away sets the other side.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">
                  <button type="button" className="h-11" onClick={() => toggleSort("name")}>
                    Club
                  </button>
                </th>
                <th className="py-2 pr-2 text-right font-medium">
                  <button type="button" className="h-11" onClick={() => toggleSort("attack")}>
                    Att
                  </button>
                </th>
                <th className="py-2 pr-2 text-right font-medium">
                  <button type="button" className="h-11" onClick={() => toggleSort("defense")}>
                    Def
                  </button>
                </th>
                <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">Net</th>
                <th className="py-2 pr-2 text-right font-medium">
                  <button type="button" className="h-11" onClick={() => toggleSort("index")}>
                    Index
                  </button>
                </th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Set away</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, index) => {
                const selected = row.team.id === home.id || row.team.id === away.id
                return (
                  <tr key={row.team.id} className={selected ? "bg-sunken" : undefined}>
                    <td className="py-1 pr-2 text-muted tabular-nums">{index + 1}</td>
                    <td className="py-1 pr-2">
                      <button
                        type="button"
                        className="inline-flex h-11 max-w-48 items-center gap-2 text-left font-medium disabled:opacity-40"
                        disabled={row.team.id === away.id}
                        onClick={() => setHomeId(row.team.id)}
                      >
                        <Crest team={row.team} />
                        <span className="min-w-0 truncate">
                          <span className="block truncate">{row.team.name}</span>
                          {league === "int" ? (
                            <span className="block truncate text-xs font-normal text-muted" title={row.team.ratingSource}>
                              {row.team.competitionName} · {(row.team.formMatches ?? 0) > 0
                                ? row.team.formMatches + " previous matches"
                                : "No history · neutral rates"}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{row.team.attack.toFixed(2)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{row.team.defense.toFixed(2)}</td>
                    <td className="hidden py-1 pr-2 text-right tabular-nums sm:table-cell">
                      {row.net > 0 ? "+" : ""}
                      {row.net.toFixed(2)}
                    </td>
                    <td className="py-1 pr-2 text-right font-medium tabular-nums">{row.index}</td>
                    <td className="py-1 text-right">
                      {row.team.id === away.id ? (
                        <span className="text-xs text-muted">Away</span>
                      ) : (
                        <button
                          type="button"
                          className="h-11 px-2 text-sm text-muted disabled:opacity-40"
                          disabled={row.team.id === home.id}
                          onClick={() => setAwayId(row.team.id)}
                        >
                          {row.team.id === home.id ? "Home" : "Away"}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      <footer className="px-1 text-sm text-muted">
        <p>
          {isPro && engineMode === "pro" ? (
            "The Pro phase-of-play engine simulates build-up, progression, chance creation and finishing across 2,500 possession-sequence matches. It incorporates score-state urgency and fatigue. Where approved player data covers both current squads, derived squad-wide indices adjust attacking, creativity, defensive and late-game depth effects; otherwise it uses team-level inputs. It does not require matchday lineups. Treat it as experimental until historical out-of-sample testing confirms an improvement."
          ) : (
            <>
              Expected goals equal a side’s attack times the opponent’s defense, scaled to a league average of 1.35, then
              moved by the home edge.{" "}
              {model === "dixon"
                ? `Dixon–Coles (ρ = ${DIXON_RHO.toFixed(2)}) ties the low scorelines, then each of the ${SIMS.toLocaleString("en-GB")} matches is drawn from that table.`
                : `Each of the ${SIMS.toLocaleString("en-GB")} matches draws the two goal totals independently from those rates.`}{" "}
              {formWindow !== "season"
                ? league === "int"
                  ? "Last 5 and last 10 reweight completed matches from the same international competition on the open match only. "
                  : "Last 5 and last 10 replace the season rates on the open match only. "
                : ""}
              {level ? "The UEFA scale is on for clubs rated from different leagues. " : ""}
              {league === "int"
                ? `National-team ratings use previous completed matches from the same competition schedule. Team rows show the number of historical matches returned. Teams without history use a neutral 1.35 goals-for and 1.35 goals-against fallback; those fallback-only teams are excluded from international Best Picks. Refreshed ${feedTimestamp(leagueStatus.updatedAt)}.`
                : leagueStatus.standings === "live"
                  ? `Ratings are this season’s scoring, refreshed from this competition’s table (${feedTimestamp(leagueStatus.updatedAt)}), not a betting line.`
                  : `This competition is using saved ratings from ${feedTimestamp(leagueStatus.updatedAt)}. Not a betting line.`}
            </>
          )}
        </p>
      </footer>
    </main>
  )
}
