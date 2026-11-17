import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Disclaimer | Pitchline",
  description: "Important information about Pitchline's match insights and use of the service.",
}

export default function DisclaimerPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pb-16 sm:px-6">
      <SiteHeader />
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Important information</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Disclaimer</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Please read these notes before relying on information shown on Pitchline.
        </p>
      </section>

      <div className="space-y-5">
        <section className="panel">
          <h2 className="font-display text-2xl">Informational use only</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Pitchline provides football information, estimates and analytical tools for general informational and entertainment purposes. Nothing on the service is financial, investment or betting advice, and no selection is a recommendation to place a wager.
          </p>
        </section>

        <section className="panel">
          <h2 className="font-display text-2xl">No guarantees</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Match probabilities, projected scores and other outputs are estimates, not facts or guarantees. Football is uncertain. Actual results can differ substantially from any estimate, and past performance does not guarantee future results.
          </p>
        </section>

        <section className="panel">
          <h2 className="font-display text-2xl">Data and availability</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Information may be delayed, incomplete, unavailable or corrected without notice. Fixtures, team information and other match details can change. You are responsible for checking important information against official sources before acting on it.
          </p>
        </section>

        <section className="panel">
          <h2 className="font-display text-2xl">Responsible use and local laws</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            You are responsible for complying with the laws and age restrictions that apply where you live. Where betting is legal, never stake money you cannot afford to lose, and consider taking a break or seeking support if betting stops being recreational.
          </p>
        </section>

        <section className="panel">
          <h2 className="font-display text-2xl">Third-party names and marks</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Club names, competition names, badges, trademarks and other third-party marks belong to their respective owners. Their appearance on Pitchline does not imply sponsorship, endorsement or affiliation.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Pitchline is an independent product and is not affiliated with or endorsed by EA SPORTS, ESPN, FIFA, UEFA, CAF or any football club or governing body.
          </p>
        </section>

        <p className="text-xs text-muted">Last updated: 17 November 2026.</p>
      </div>
    </main>
  )
}
