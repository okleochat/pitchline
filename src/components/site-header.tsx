"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Match desk" },
  { href: "/picks", label: "Best picks" },
  { href: "/international", label: "International" },
  { href: "/methodology", label: "Methodology" },
  { href: "/account", label: "Account" },
]

export function SiteHeader({ subtitle = "Football intelligence" }: { subtitle?: string }) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg outline-offset-4" aria-label="Pitchline home">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card font-display text-lg font-semibold">P</span>
            <span className="min-w-0">
              <span className="block font-display text-3xl leading-none tracking-tight">Pitchline</span>
              <span className="mt-1 block truncate text-sm text-muted">{subtitle}</span>
            </span>
          </Link>
          <p className="hidden max-w-xs text-right text-sm text-muted lg:block">
            Evidence-led match probabilities, form and football data.
          </p>
        </div>
        <nav aria-label="Main navigation" className="rail -mx-1 mt-3 flex gap-1 overflow-x-auto pb-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(link.href + "/")
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`press inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-transparent text-muted hover:border-border hover:bg-card hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
