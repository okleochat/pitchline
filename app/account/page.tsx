import { AuthMenu } from "@/components/auth/auth-menu"
import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Account & Pro access | Pitchline",
  description: "Manage your Pitchline account and view your Pro access status.",
}

export default function AccountPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      <SiteHeader subtitle="Account and access" />
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your workspace</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Account & access</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Sign in with email or Google, see your current access level and manage your Pitchline session.
        </p>
      </section>
      <section className="panel max-w-2xl">
        <h2 className="mb-4 font-display text-2xl">Pitchline account</h2>
        <AuthMenu />
        <p className="mt-4 text-sm leading-6 text-muted">
          During testing, Pro access can be granted by an administrator through the server-managed Firestore subscription record. Browser clients cannot grant or edit their own subscription.
        </p>
      </section>
    </main>
  )
}
