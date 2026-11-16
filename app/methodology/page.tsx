import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Model methodology | Pitchline",
  description: "How Pitchline builds football goal distributions, probabilities and historical validation.",
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      <SiteHeader subtitle="Model methodology" />
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">How the numbers are built</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Methodology & model notes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Pitchline turns team scoring and conceding rates into a probability distribution. The model is a research tool, not a guarantee or a betting recommendation.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <h2 className="font-display text-2xl">Goal model</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Expected goals for each side are estimated from that side’s attack rate and the opponent’s goals-conceded rate, scaled to a 1.35 league reference and a user-adjustable home scoring edge. This is a goals-based estimate, not a provider’s shot-level xG metric.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Exact 1X2, both-teams-to-score, clean-sheet and common total-goal probabilities are obtained from a normalized 0–12 Poisson goal grid. The Dixon–Coles option adjusts low scorelines before normalization. A deterministic 1,000-draw simulation powers the scoreline matrix and match tape.
          </p>
        </section>
        <section className="panel">
          <h2 className="font-display text-2xl">Recent form</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Recent form uses completed fixtures ordered newest-first. Last-five and last-ten options weight the most recent result most heavily and decay older matches. When the live form feed is unavailable, the page clearly identifies that the selected window cannot be supplied instead of inventing recent results.
          </p>
        </section>
        <section className="panel">
          <h2 className="font-display text-2xl">xG data</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Provider xG is kept distinct from goals-based expected-goal estimates. Shot-level xG is available only after a match has started or finished, and coverage varies by competition. It must never be used as a pre-match feature for the same match.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Historical StatsBomb open data covers selected competitions and seasons, not all football. Backtests use only the previous completed matches available before the target fixture and exclude same-day matches to avoid time leakage.
          </p>
        </section>
        <section className="panel">
          <h2 className="font-display text-2xl">Calibration & evaluation</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Backtests report Brier score, log loss, accuracy and reliability for 1X2, BTTS and Over 2.5. These metrics assess probability quality. They do not establish profitability, since bookmaker odds, margin, closing prices, stake rules and execution are separate inputs.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Cross-league strength scaling is a coarse proxy, not club Elo. International teams are not assigned club rates. Separate national-team strength and tournament context must be calibrated before international probabilities can be shown.
          </p>
        </section>
      </div>

      <section className="panel mt-4">
        <h2 className="font-display text-2xl">Data provenance</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Domestic and club competition fixtures, standings and recent results currently use ESPN data with a saved fallback. Each competition reports the source and refresh time separately. The optional SportsAPI Pro adapter provides international fixtures and on-demand match xG and odds when configured; no provider values are fabricated when a feed is unavailable.
        </p>
      </section>
    </main>
  )
}
