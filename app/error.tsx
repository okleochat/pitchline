"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 sm:px-6">
      <section className="panel w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Unexpected error</p>
        <h1 className="mt-2 font-display text-3xl">This page could not be loaded</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Pitchline hit an unexpected problem. Your saved match desk settings remain in your browser; try again or return to the match desk.
        </p>
        {error.digest ? <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="press h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Try again</button>
          <a href="/" className="press inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium">Match desk</a>
        </div>
      </section>
    </main>
  )
}
