"use client"

import { useState, type FormEvent } from "react"
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import { firebaseConfigured, firebaseErrorMessage, getFirebaseAuth } from "@/lib/firebase/client"
import { signInWithGoogle } from "@/lib/firebase/google-sign-in"
import { useFirebaseSession } from "./firebase-auth-provider"

export function AccountView() {
  const session = useFirebaseSession()
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
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function googleSignIn() {
    setBusy(true)
    setMessage(null)
    try {
      await signInWithGoogle(getFirebaseAuth())
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setMessage(null)
    try {
      await signOut(getFirebaseAuth())
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
      setBusy(false)
    }
  }

  if (session.loading) {
    return (
      <section className="panel max-w-2xl" aria-live="polite">
        <p className="text-sm text-muted">Checking your Pitchline session…</p>
      </section>
    )
  }

  if (!firebaseConfigured) {
    return (
      <section className="panel max-w-2xl">
        <h2 className="font-display text-2xl">Sign-in is not configured</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Firebase web configuration is missing. The match simulator remains available, but account sign-in cannot start until the Firebase configuration is supplied.
        </p>
      </section>
    )
  }

  if (session.user) {
    return (
      <section className="panel max-w-2xl">
        <div className="flex flex-wrap items-center gap-4">
          {session.user.picture ? (
            <img src={session.user.picture} alt="" className="size-14 rounded-full border border-border object-cover" />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-sunken font-display text-xl">
              {(session.user.name ?? session.user.email ?? "P").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl">Your account</h2>
            <p className="mt-1 truncate text-sm text-muted">{session.user.name ?? session.user.email ?? "Signed-in Pitchline member"}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
            {session.user.isPro ? "Pro" : "Free"}
          </span>
        </div>
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Account email</p>
          <p className="mt-1 break-all text-sm">{session.user.email ?? "No email supplied by this sign-in provider"}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Current plan</p>
          <p className="mt-1 text-sm">{session.user.isPro ? "Your Pitchline Pro entitlement is active." : "You are on the Free plan."}</p>
        </div>
        {!session.user.isPro ? (
          <p className="mt-4 text-sm leading-6 text-muted">
            Pro checkout is not connected yet. Pro access is granted only by a server-managed active subscription record.
          </p>
        ) : null}
        <button type="button" disabled={busy} onClick={logout} className="press mt-5 h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">
          {busy ? "Signing out…" : "Sign out"}
        </button>
        {message ? <p className="mt-3 text-sm text-muted" role="status">{message}</p> : null}
      </section>
    )
  }

  return (
    <section className="panel max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your workspace</p>
      <h2 className="mt-2 font-display text-3xl">Sign in to Pitchline</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Sign in to manage your account and any Pro access attached to it. Your match desk remains available without signing in.
      </p>

      <button
        type="button"
        onClick={googleSignIn}
        disabled={busy}
        className="press mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 text-sm font-medium disabled:opacity-50"
      >
        <span className="grid size-6 place-items-center rounded-full bg-card font-semibold text-[#4285f4]">G</span>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium">
          Email address
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-background px-3 text-base" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-background px-3 text-base" />
        </label>
        {message || session.error ? (
          <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted" role="alert">
            {message ?? session.error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className="press h-12 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 text-sm text-muted underline underline-offset-4"
        onClick={() => {
          setMode((current) => current === "signin" ? "signup" : "signin")
          setMessage(null)
        }}
      >
        {mode === "signin" ? "New to Pitchline? Create an account" : "Already have an account? Sign in"}
      </button>
    </section>
  )
}
