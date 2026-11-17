"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { useFirebaseSession } from "@/components/auth/firebase-auth-provider"

const LINKS = [
  { href: "/", label: "Match desk" },
  { href: "/picks", label: "Best picks" },
  { href: "/international", label: "International" },
  { href: "/disclaimer", label: "Disclaimer" },
]

export function SiteHeader(_props: { subtitle?: string } = {}) {
  const pathname = usePathname()
  const session = useFirebaseSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const accountLabel = session.loading || session.user ? "Account" : "Log in"
  const links = [...LINKS, { href: "/account", label: accountLabel }]

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-offset-4" aria-label="Pitchline home">
            <Image src="/pitchline-mark.svg" width={44} height={44} alt="" priority className="size-10 shrink-0" />
            <span className="min-w-0">
              <span className="block font-display text-[1.8rem] leading-none tracking-tight">Pitchline</span>
              <span className="mt-1 block truncate text-xs text-muted sm:text-sm">See the game before it unfolds.</span>
            </span>
          </Link>

          <p className="hidden max-w-xs text-right text-sm text-muted lg:block">
            Matchday insight, made clearer.
          </p>

          <button
            type="button"
            className="press inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground md:hidden"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="pitchline-mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} strokeWidth={1.8} /> : <Menu size={21} strokeWidth={1.8} />}
          </button>
        </div>

        <nav
          id="pitchline-mobile-navigation"
          aria-label="Main navigation"
          className={(menuOpen ? "block" : "hidden") + " mt-3 border-t border-border pt-3 md:block md:border-0 md:pt-0"}
        >
          <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:gap-1">
            {links.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(link.href + "/")
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={"press flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors md:min-h-10 " + (
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-transparent text-muted hover:border-border hover:bg-card hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </header>
  )
}
