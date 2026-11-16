export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pt-4 pb-16 sm:px-6" aria-busy="true" aria-label="Loading Pitchline">
      <div className="mb-6 border-b border-border pb-4">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-card" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-card" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="panel h-32 animate-pulse bg-card" />
        <div className="panel h-32 animate-pulse bg-card" />
        <div className="panel h-48 animate-pulse bg-card md:col-span-2" />
      </div>
    </main>
  )
}
