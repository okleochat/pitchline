import type { Metadata, Viewport } from "next"
import "@/styles.css"

export const metadata: Metadata = { title: "Pitchline — football match simulator", description: "Football match simulation and probability analysis." }
export const viewport: Viewport = { themeColor: "#f2efe8" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="en"><body>{children}</body></html>
}
