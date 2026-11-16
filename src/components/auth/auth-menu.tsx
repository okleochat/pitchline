"use client"

import Link from "next/link"
import { useFirebaseSession } from "./firebase-auth-provider"

export function AuthMenu() {
  const session = useFirebaseSession()
  return (
    <Link href="/account" className="press inline-flex h-10 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium">
      {session.user ? (session.user.isPro ? "Pitchline Pro" : "Account") : "Pro access"}
    </Link>
  )
}
