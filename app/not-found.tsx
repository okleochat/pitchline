import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 sm:px-6">
      <section className="panel w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">404 · Not found</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">This page is off the pitch</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">The address may have changed or the page may no longer exist.</p>
        <Link href="/" className="press mt-5 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Back to Pitchline</Link>
      </section>
    </main>
  )
}
