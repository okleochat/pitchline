"use client"

import { useState, type FormEvent } from "react"
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth"
import { firebaseConfigured, firebaseErrorMessage, getFirebaseAuth } from "@/lib/firebase/client"
import { useFirebaseSession } from "./firebase-auth-provider"

export function AuthMenu() {
  const session = useFirebaseSession()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const auth = getFirebaseAuth()
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password)
      else await signInWithEmailAndPassword(auth, email.trim(), password)
      setPassword("")
      setOpen(false)
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally { setBusy(false) }
  }

  async function googleSignIn() {
    setBusy(true)
    setMessage(null)
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
      setOpen(false)
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    setMessage(null)
    try { await signOut(getFirebaseAuth()) } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally { setBusy(false) }
  }

  return (
    <>
      <button type="button" className="press h-10 shrink-0 rounded-lg border border-border bg-card px-3 text-sm font-medium" onClick={() => { setMessage(session.error); setOpen(true) }}>
        {session.user ? (session.user.isPro ? "Pitchline Pro" : "Account") : "Pro access"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section className="panel w-full max-w-md shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="pitchline-account-title">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pitchline account</p>
                <h2 id="pitchline-account-title" className="mt-1 font-display text-2xl">{session.user ? (session.user.isPro ? "Pitchline Pro" : "Your account") : "Unlock your workspace"}</h2>
              </div>
              <button type="button" className="press h-10 rounded-lg px-3 text-sm text-muted" onClick={() => setOpen(false)} aria-label="Close account panel">Close</button>
            </div>
            {!firebaseConfigured ? (
              <div className="space-y-3 text-sm">
                <p>Firebase sign-in is prepared but not activated yet. Add the public Firebase web configuration, enable Email/Password and Google providers, and publish the Firestore rules. Firebase App Hosting uses its server identity (Application Default Credentials); Vercel needs the encrypted server-only FIREBASE_SERVICE_ACCOUNT_JSON variable.</p>
                <p className="text-muted">Setup instructions are in docs/FIREBASE_SETUP.md. The simulator remains available without an account.</p>
              </div>
            ) : session.user ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-medium">{session.user.name ?? session.user.email ?? "Signed-in user"}</p>
                  <p className="mt-1 text-xs text-muted">{session.user.email ?? session.user.uid}</p>
                  <p className="mt-3 text-sm">{session.user.isPro ? "Your Pro entitlement is active." : "You are currently on the Free plan."}</p>
                </div>
                {!session.user.isPro ? <p className="text-sm text-muted">Checkout is not connected yet. Pro access is granted only by a server-managed active subscription record.</p> : null}
                <button type="button" disabled={busy} onClick={logout} className="press h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">{busy ? "Signing out…" : "Sign out"}</button>
              </div>
            ) : (
              <div className="space-y-4">
                <button type="button" onClick={googleSignIn} disabled={busy || session.loading} className="press h-11 w-full rounded-lg border border-border bg-card px-4 text-sm font-medium disabled:opacity-50">Continue with Google</button>
                <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
                <form onSubmit={submit} className="space-y-3">
                  <label className="block text-sm">Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" /></label>
                  <label className="block text-sm">Password<input type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" /></label>
                  {message || session.error ? <p className="text-sm text-muted" role="status">{message ?? session.error}</p> : null}
                  <button type="submit" disabled={busy || session.loading} className="press h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
                </form>
                <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(null) }}>
                  {mode === "signin" ? "Create a new account" : "I already have an account"}
                </button>
              </div>
            )}
            {session.error && firebaseConfigured && !message ? <p className="mt-3 text-sm text-muted" role="status">{session.error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
