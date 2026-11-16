"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { onIdTokenChanged, type User } from "firebase/auth"
import { firebaseConfigured, getFirebaseAnalytics, getFirebaseAuth } from "@/lib/firebase/client"

export type ClientUser = {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
  isPro: boolean
}
type AuthContextValue = { configured: boolean; loading: boolean; user: ClientUser | null; error: string | null }
const AuthContext = createContext<AuthContextValue>({ configured: false, loading: false, user: null, error: null })

async function syncServerSession(user: User | null): Promise<ClientUser | null> {
  if (!user) {
    await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" })
    return null
  }

  // Firebase also emits this callback for routine ID-token refreshes. Reuse
  // a still-valid server session instead of trying to mint a new cookie with
  // an old auth_time (which correctly requires a fresh sign-in).
  const existing = await fetch("/api/me", { cache: "no-store" })
  if (existing.ok) {
    const current = (await existing.json()) as { user?: ClientUser | null }
    if (current.user?.uid === user.uid) return current.user
  }

  const idToken = await user.getIdToken()
  const session = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  })
  if (!session.ok) {
    const result = (await session.json().catch(() => ({}))) as { error?: string }
    throw new Error(result.error ?? "Could not create a secure session.")
  }
  const response = await fetch("/api/me", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not load your Pitchline account.")
  const result = (await response.json()) as { user?: ClientUser | null }
  return result.user ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(firebaseConfigured)
  const [user, setUser] = useState<ClientUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseConfigured) { setLoading(false); return }
    void getFirebaseAnalytics()
    let active = true
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (firebaseUser) => {
      setLoading(true)
      setError(null)
      try {
        const nextUser = await syncServerSession(firebaseUser)
        if (active) setUser(nextUser)
      } catch (cause) {
        if (active) {
          setUser(null)
          setError(cause instanceof Error ? cause.message : "Authentication is unavailable.")
        }
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])

  const value = useMemo(() => ({ configured: firebaseConfigured, loading, user, error }), [loading, user, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useFirebaseSession() {
  return useContext(AuthContext)
}
