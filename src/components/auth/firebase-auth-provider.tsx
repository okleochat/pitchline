"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { onIdTokenChanged, type User } from "firebase/auth"
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase/client"

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
    const cleared = await fetch("/api/auth/session", {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
    })
    if (!cleared.ok) throw new Error("Could not clear the previous Pitchline session.")
    return null
  }

  const existing = await fetch("/api/me", {
    cache: "no-store",
    credentials: "same-origin",
  })
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
    credentials: "same-origin",
  })
  if (!session.ok) {
    const result = (await session.json().catch(() => ({}))) as { error?: string; stage?: string }
    if (result.error === "recent_sign_in_required") {
      throw new Error("Your Google sign-in is no longer recent enough to create a secure session. Please sign in again.")
    }
    if (result.error === "invalid_origin") {
      throw new Error("Pitchline could not verify this sign-in request. Refresh the page and try again.")
    }
    throw new Error(
      result.stage
        ? "Google verified your account, but Pitchline could not finish its secure session (" + result.stage + ")."
        : "Google verified your account, but Pitchline could not finish its secure session.",
    )
  }

  const response = await fetch("/api/me", {
    cache: "no-store",
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error("Your sign-in succeeded, but Pitchline could not load your account.")
  const result = (await response.json()) as { user?: ClientUser | null }
  if (!result.user || result.user.uid !== user.uid) {
    throw new Error("Your account was verified, but the Pitchline session was not retained. Please sign in again.")
  }
  return result.user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(firebaseConfigured)
  const [user, setUser] = useState<ClientUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false)
      return
    }

    let active = true
    let unsubscribe: (() => void) | undefined
    // Serialize token-state transitions so an older sign-out request cannot
    // finish after a newer sign-in and clear its session cookie.
    let queue: Promise<void> = Promise.resolve()

    try {
      const auth = getFirebaseAuth()
      void auth.authStateReady().then(() => {
        if (!active) return
        unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
          setLoading(true)
          queue = queue.then(async () => {
            if (!active) return
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
        })
      }).catch((cause: unknown) => {
        if (!active) return
        setUser(null)
        setError(cause instanceof Error ? cause.message : "Firebase authentication could not be initialized.")
        setLoading(false)
      })
    } catch (cause) {
      setUser(null)
      setError(cause instanceof Error ? cause.message : "Firebase authentication could not be initialized.")
      setLoading(false)
    }

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const value = useMemo(() => ({ configured: firebaseConfigured, loading, user, error }), [loading, user, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useFirebaseSession() {
  return useContext(AuthContext)
}
