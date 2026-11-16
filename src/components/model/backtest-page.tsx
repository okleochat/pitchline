"use client"

import Link from "next/link"
import { useState, type ChangeEvent, type FormEvent } from "react"

type ReliabilityBin = { count: number; meanPredicted: number; observedRate: number }
type BinaryMetrics = { count: number; brierScore: number; logLoss: number; reliability: ReliabilityBin[] }
type MetricBundle = {
  matches: number
  oneX2: {
    count: number
    brierScore: number
    logLoss: number
    accuracy: number
    reliabilityByOutcome: { home: ReliabilityBin[]; draw: ReliabilityBin[]; away: ReliabilityBin[] }
  }
  btts: BinaryMetrics
  over25: BinaryMetrics
}
type BacktestReport = MetricBundle & {
  createdAt: string
  methodology: string
  period: { from: string; to: string }
  chronologicalSplit: null | {
    earlier: MetricBundle
    later: MetricBundle
    splitDate: string
    earlierShare: number
    laterShare: number
  }
  inputs: { featureBasis: "goals" | "xg"; xgSource: string | null }
}

function score(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "—"
}
function percentage(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—"
}

function MetricCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </section>
  )
}

function MetricPanel({ title, metrics }: { title: string; metrics: MetricBundle }) {
  return (
    <section className="panel space-y-4">
      <div>
        <h3 className="font-display text-2xl">{title}</h3>
        <p className="mt-1 text-sm text-muted">{metrics.matches.toLocaleString("en-GB")} matches</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard title="1X2 Brier score" value={score(metrics.oneX2.brierScore)} note="Lower is better · multiclass" />
        <MetricCard title="1X2 log loss" value={score(metrics.oneX2.logLoss)} note="Lower is better · multiclass" />
        <MetricCard title="1X2 accuracy" value={percentage(metrics.oneX2.accuracy)} note="Most likely outcome" />
        <MetricCard title="BTTS Brier" value={score(metrics.btts.brierScore)} note="Lower is better" />
        <MetricCard title="BTTS log loss" value={score(metrics.btts.logLoss)} note="Lower is better" />
        <MetricCard title="Over 2.5 Brier" value={score(metrics.over25.brierScore)} note="Lower is better" />
      </div>
    </section>
  )
}

function ReliabilityTable({ title, bins }: { title: string; bins: ReliabilityBin[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {bins.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[390px] text-left text-xs">
            <thead className="border-b border-border text-muted">
              <tr><th className="py-2 pr-3 font-medium">Predicted</th><th className="py-2 pr-3 font-medium">Observed</th><th className="py-2 pr-3 font-medium">Matches</th></tr>
            </thead>
            <tbody>
              {bins.map((bin, index) => (
                <tr key={index} className="border-b border-border/60">
                  <td className="py-2 pr-3 tabular-nums">{percentage(bin.meanPredicted)}</td>
                  <td className="py-2 pr-3 tabular-nums">{percentage(bin.observedRate)}</td>
                  <td className="py-2 pr-3 tabular-nums">{bin.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs text-muted">No observations in these bins.</p>}
    </div>
  )
}

type PreparedBacktestResponse = { sourceFixtures: number; preparedFixtures: number; rollingWindow: number; report: BacktestReport; prematchCsv: string }

export function BacktestPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [rollingWindow, setRollingWindow] = useState<"5" | "10">("5")
  const [preparedCsv, setPreparedCsv] = useState<string | null>(null)
  const [preparedSummary, setPreparedSummary] = useState<{ sourceFixtures: number; preparedFixtures: number; rollingWindow: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [report, setReport] = useState<BacktestReport | null>(null)

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setMessage(null)
    setReport(null)
    setPreparedCsv(null)
    setPreparedSummary(null)
  }

  async function prepareRaw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rawFile) { setMessage("Choose a raw historical fixture archive first."); return }
    setBusy(true)
    setMessage(null)
    setReport(null)
    setPreparedCsv(null)
    setPreparedSummary(null)
    try {
      const form = new FormData()
      form.set("file", rawFile)
      form.set("window", rollingWindow)
      const response = await fetch("/api/backtest/prepare", { method: "POST", body: form, cache: "no-store" })
      const body = await response.json() as PreparedBacktestResponse & { error?: string; detail?: string }
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sign in to a Pitchline account before preparing a backtest.")
        if (response.status === 403) throw new Error("Historical model validation is a Pro testing feature. Activate your test account in the subscriptions collection.")
        throw new Error(body.detail ?? body.error ?? "Could not prepare this raw archive.")
      }
      setReport(body.report)
      setPreparedCsv(body.prematchCsv)
      setPreparedSummary({ sourceFixtures: body.sourceFixtures, preparedFixtures: body.preparedFixtures, rollingWindow: body.rollingWindow })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not prepare the historical archive.")
    } finally {
      setBusy(false)
    }
  }

  function downloadPreparedCsv() {
    if (!preparedCsv) return
    const blob = new Blob([preparedCsv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "pitchline-prematch-rates.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setMessage("Choose a historical CSV file first.")
      return
    }
    setBusy(true)
    setMessage(null)
    setReport(null)
    try {
      const form = new FormData()
      form.set("file", file)
      const response = await fetch("/api/backtest", { method: "POST", body: form, cache: "no-store" })
      const body = await response.json() as BacktestReport & { error?: string; detail?: string }
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sign in to a Pitchline account before running a backtest.")
        if (response.status === 403) throw new Error("Historical model validation is a Pro testing feature. Activate your test account in the subscriptions collection.")
        throw new Error(body.detail ?? body.error ?? "Backtest failed.")
      }
      setReport(body)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not complete the backtest.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="font-display text-2xl tracking-tight">Pitchline</Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
          <Link href="/" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Match desk</Link>
          <Link href="/picks" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Best picks</Link>
          <Link href="/fixtures/international" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">International</Link>
          <Link href="/data" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Data centre</Link>
          <Link href="/account" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Account</Link>
        </nav>
      </header>

      <div className="mb-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Model validation lab</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Historical backtesting</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Evaluate probability quality against completed fixtures using only pre-kickoff features. This is a calibration test, not a promise of betting profit.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]">
        <section className="panel space-y-4">
          <div>
            <h2 className="font-display text-2xl">Upload a historical dataset</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">CSV files are processed in memory and are not saved to Pitchline.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium">
              Prematch fixtures CSV
              <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 block w-full rounded-lg border border-border bg-card p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
            </label>
            {file ? <p className="text-xs text-muted">{file.name} · {(file.size / 1024).toFixed(1)} KB</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!file || busy} className="press h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "Evaluating…" : "Run backtest"}
              </button>
              <a href="/templates/pitchline-backtest-template.csv" download className="text-sm font-medium text-muted underline underline-offset-4">
                Download CSV template
              </a>
            </div>
            {message ? <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted" role="status">{message} <Link href="/account" className="underline underline-offset-4">Account settings</Link></p> : null}
          </form>
        </section>

        <section className="panel space-y-3">
          <h2 className="font-display text-2xl">Input rules</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-muted">
            <li>• <code>features_as_of</code> must be a real timestamp before kickoff.</li>
            <li>• Team attack and defence values must be calculated only from earlier completed matches.</li>
            <li>• Use a rolling previous-five or previous-ten window; never use current season tables for old fixtures.</li>
            <li>• xG is optional, but all four team xG/xGA values and an <code>xg_source</code> must be supplied together.</li>
            <li>• At least 34 fixtures are needed for the report to include its 70/30 chronological holdout.</li>
          </ul>
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted">
            One backtest is limited to 20,000 rows and 5 MB. Brier and log loss measure probability quality; neither indicates profitability on its own.
          </p>
        </section>
      </div>

      <section className="panel mt-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recommended workflow</p>
            <h2 className="mt-1 font-display text-2xl">Build prematch features from raw results</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
              Upload completed fixtures with stable team IDs and actual completion timestamps. Pitchline calculates each target's rolling history using only matches that had finished before that kickoff, then runs the backtest automatically.
            </p>
          </div>
          <a href="/templates/pitchline-historical-fixtures-template.csv" download className="text-sm font-medium text-muted underline underline-offset-4">Raw archive template</a>
        </div>
        <form onSubmit={prepareRaw} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <label className="block text-sm font-medium">
            Completed fixture archive CSV
            <input type="file" accept=".csv,text/csv" onChange={(event) => { setRawFile(event.target.files?.[0] ?? null); setPreparedCsv(null); setPreparedSummary(null) }} className="mt-2 block w-full rounded-lg border border-border bg-card p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
          </label>
          <label className="block text-sm font-medium">
            Rolling history
            <select value={rollingWindow} onChange={(event) => setRollingWindow(event.target.value as "5" | "10")} className="mt-2 h-11 w-full rounded-lg border border-border bg-card px-3 text-base">
              <option value="5">Previous 5 matches</option>
              <option value="10">Previous 10 matches</option>
            </select>
          </label>
          <button type="submit" disabled={!rawFile || busy} className="press h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Preparing…" : "Prepare + backtest"}
          </button>
        </form>
        {rawFile ? <p className="text-xs text-muted">{rawFile.name} · {(rawFile.size / 1024).toFixed(1)} KB</p> : null}
        {preparedSummary ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-sm text-muted">Prepared {preparedSummary.preparedFixtures.toLocaleString("en-GB")} prematch rows from {preparedSummary.sourceFixtures.toLocaleString("en-GB")} raw matches using the previous {preparedSummary.rollingWindow} completed fixtures.</p>
            <button type="button" onClick={downloadPreparedCsv} className="press h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium">Download prepared CSV</button>
          </div>
        ) : null}
        <p className="text-xs leading-relaxed text-muted">
          The builder requires kickoff, completed_at, stable home/away team IDs, scores and team names. xG is included only when both teams have complete previous-window values from the same source; otherwise the full export uses goals-based features.
        </p>
      </section>

      {report ? (
        <div className="mt-5 space-y-4">
          <section className="panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evaluation result</p>
                <h2 className="mt-1 font-display text-2xl">{report.matches.toLocaleString("en-GB")} fixtures evaluated</h2>
                <p className="mt-1 text-sm text-muted">{new Date(report.period.from).toLocaleDateString()} – {new Date(report.period.to).toLocaleDateString()}</p>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">{report.inputs.featureBasis.toUpperCase()} features</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{report.methodology}</p>
            {report.inputs.xgSource ? <p className="mt-2 text-xs text-muted">xG source: {report.inputs.xgSource}</p> : null}
          </section>
          <MetricPanel title="All fixtures" metrics={report} />
          {report.chronologicalSplit ? (
            <>
              <MetricPanel title={`Earlier 70% · through ${new Date(report.chronologicalSplit.splitDate).toLocaleDateString()}`} metrics={report.chronologicalSplit.earlier} />
              <MetricPanel title="Later 30% · chronological holdout" metrics={report.chronologicalSplit.later} />
              <section className="panel space-y-4">
                <h3 className="font-display text-2xl">Reliability / calibration</h3>
                <p className="text-sm text-muted">Predicted probabilities should align with observed frequencies within each bin. Small bins are noisy.</p>
                <div className="grid gap-5 md:grid-cols-3">
                  <ReliabilityTable title="Home win" bins={report.oneX2.reliabilityByOutcome.home} />
                  <ReliabilityTable title="Draw" bins={report.oneX2.reliabilityByOutcome.draw} />
                  <ReliabilityTable title="Away win" bins={report.oneX2.reliabilityByOutcome.away} />
                </div>
              </section>
            </>
          ) : (
            <section className="panel text-sm text-muted">
              The sample is too small for a robust chronological holdout. Aim for at least 34 matches, preferably hundreds across multiple seasons.
            </section>
          )}
        </div>
      ) : null}
    </main>
  )
}
