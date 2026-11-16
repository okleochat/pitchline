import { AccountView } from "@/components/auth/account-view"
import { SiteHeader } from "@/components/site-header"

export const metadata = {
  title: "Account | Pitchline",
  description: "Sign in to manage your Pitchline account and Pro access.",
}

export default function AccountPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      <SiteHeader subtitle="Your Pitchline account" />
      <AccountView />
    </main>
  )
}
