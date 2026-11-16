"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth"
import { firebaseConfigured, firebaseErrorMessage, getFirebaseAuth } from "@/lib/firebase/client"
import { useFirebaseSession } from "./firebase-auth-provider"

type Mode = "signin" | "signup"

function serverAuthMessage(message: string | null): string | null {
  if (message === "firebase_admin_not_configured") {
    return "Firebase web settings are present, but the server-only Firebase Admin service account has not been added to Vercel yet."
  }
  if (message === "recent_sign_in_required") {
    return "Please sign in again. A fresh sign-in is required before Pitchline can create a secure server session."
  }
  if (message === "session_creation_failed") {
    return "Pitchline could not verify the Firebase session. Check that Firebase Authentication and the server-side Firestore setup are active."
  }
  return message
}

export function AccountPage() {
  const session = useFirebaseSession()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally {
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
    } finally {
      setBusy(false)
    }
  }

  async function copyUid() {
    if (!session.user) return
    try {
      await navigator.clipboard.writeText(session.user.uid)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setMessage("Could not copy the account ID. You can select and copy it manually.")
    }
  }

  const statusMessage = serverAuthMessage(session.error)

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="font-display text-2xl tracking-tight">Pitchline</Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
          <Link href="/" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Match desk</Link>
          <Link href="/picks" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Best picks</Link>
          <Link href="/fixtures/international" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">International</Link>
          <Link href="/model/backtest" className="rounded-lg px-3 py-2 text-muted hover:bg-card hover:text-foreground">Model lab</Link>
        </nav>
      </header>

      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Workspace settings</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Your account</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Manage your Pitchline identity and check your plan. Your subscription status is verified on the server, never trusted from the browser.
        </p>
      </div>

      {!firebaseConfigured ? (
        <section className="panel max-w-2xl space-y-3">
          <h2 className="font-display text-2xl">Account setup is pending</h2>
          <p className="text-sm leading-relaxed text-muted">The Firebase Web App configuration is not present in this deployment. The simulator remains available without an account.</p>
        </section>
      ) : session.loading ? (
        <section className="panel max-w-2xl" aria-live="polite">
          <p className="text-sm text-muted">Checking your secure session…</p>
        </section>
      ) : session.user ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <section className="panel space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Signed in as</p>
                <h2 className="mt-1 font-display text-2xl">{session.user.name ?? session.user.email ?? "Pitchline member"}</h2>
                <p className="mt-1 text-sm text-muted">{session.user.email ?? "No email address on the Firebase profile"}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${session.user.isPro ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted"}`}>
                {session.user.isPro ? "PRO ACTIVE" : "FREE PLAN"}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Firebase user ID</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <code className="break-all text-sm">{session.user.uid}</code>
                <button type="button" onClick={copyUid} className="press rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
                  {copied ? "Copied" : "Copy ID"}
                </button>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {session.user.isPro
                ? "Your Pro entitlement is active. Pitchline confirmed it against the server-managed subscription record."
                : "You are currently on the Free plan. During testing, an administrator can activate Pro by updating your subscription document in Firestore."}
            </p>
            {statusMessage ? <p className="text-sm text-muted" role="status">{statusMessage}</p> : null}
            <button type="button" disabled={busy} onClick={logout} className="press h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">
              {busy ? "Please wait…" : "Sign out"}
            </button>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Testing and access</p>
              <h2 className="mt-1 font-display text-2xl">Pro entitlement</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              For test accounts, edit the server-owned document at <code>subscriptions/{session.user.uid}</code> in the Firebase Console.
            </p>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Document fields</p>
              <pre className="overflow-x-auto text-xs leading-relaxed">{`{
  "status": "active",
  "plan": "pro",
  "provider": "manual",
  "currentPeriodEnd": <future Firestore Timestamp>
}`}</pre>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Use a future Firestore Timestamp for currentPeriodEnd. The record must be edited in the Firebase Console or by trusted server code; browser clients are deliberately denied write access to subscriptions.
            </p>
            <p className="text-xs leading-relaxed text-muted">
              Checkout and payment webhooks are intentionally not enabled. This manual entitlement is suitable for controlled testing, not public self-service upgrades.
            </p>
          </section>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Secure sign-in</p>
              <h2 className="mt-1 font-display text-2xl">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
              <p className="mt-1 text-sm text-muted">Use your email or Google account to access your Pitchline workspace.</p>
            </div>
            <button type="button" onClick={googleSignIn} disabled={busy} className="press h-11 w-full rounded-lg border border-border bg-card px-4 text-sm font-medium disabled:opacity-50">
              Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-sm font-medium">
                Email
                <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-base" />
              </label>
              {message ? <p className="text-sm text-muted" role="status">{message}</p> : null}
              {statusMessage ? <p className="text-sm text-muted" role="status">{statusMessage}</p> : null}
              <button type="submit" disabled={busy} className="press h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(null) }}>
              {mode === "signin" ? "Create a new account" : "I already have an account"}
            </button>
          </section>

          <section className="panel space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Membership</p>
            <h2 className="font-display text-2xl">Free to start. Pro when you are ready.</h2>
            <p className="text-sm leading-relaxed text-muted">Pitchline keeps the match desk available without sign-in. Account features and future advanced tools can be tied to server-verified membership.</p>
            <ul className="space-y-2 text-sm text-muted">
              <li>• Secure, HTTP-only server sessions</li>
              <li>• Email/password and Google sign-in</li>
              <li>• Server-managed Pro entitlements</li>
              <li>• No browser-side subscription overrides</li>
            </ul>
          </section>
        </div>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted">
        <Link href="/" className="underline underline-offset-4">Back to the match desk</Link>
      </footer>
    </main>
  )
}
