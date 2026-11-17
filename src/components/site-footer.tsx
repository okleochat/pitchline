import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Pitchline. All rights reserved.</p>
        <Link href="/disclaimer" className="w-fit underline-offset-4 hover:text-foreground hover:underline">
          Disclaimer
        </Link>
      </div>
    </footer>
  )
}
