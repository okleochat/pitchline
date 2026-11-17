import type { Metadata, Viewport } from "next"
import { AuthProvider } from "@/components/auth/firebase-auth-provider"
import { FirebaseAnalytics } from "@/components/firebase-analytics"
import { SiteFooter } from "@/components/site-footer"
import "@/styles.css"

export const metadata: Metadata = {
  title: "Pitchline — football intelligence",
  description: "Matchday insight, football probabilities and clearer decisions.",
  icons: { icon: "/favicon.svg", apple: "/__grok/icon-180.png" },
  manifest: "/manifest.webmanifest",
}
export const viewport: Viewport = { themeColor: "#f2efe8" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&family=Outfit:wght@400;500;600&display=swap" />
      </head>
      <body><AuthProvider><FirebaseAnalytics />{children}<SiteFooter /></AuthProvider></body>
    </html>
  )
}
