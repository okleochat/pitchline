import { NextResponse } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { MANAGED_BOOKMAKERS, MANUAL_ONLY_BOOKMAKERS } from "@/lib/slip/bookmakers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    if (code === "PRO_REQUIRED") return NextResponse.json({ error: "pro_required" }, { status: 403 })
    return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
  }

  return NextResponse.json({
    providers: [
      { key: "sportybet", name: "SportyBet", integration: "native", requiresApiKey: false },
      ...MANAGED_BOOKMAKERS.map((item) => ({
        key: item.key,
        name: item.name,
        integration: "managed",
        requiresApiKey: true,
      })),
    ],
    manageBetCodesConfigured: Boolean(process.env.MANAGE_BET_CODES_API_KEY?.trim()),
    managedCreditsPerCode: 2,
    apiKeyUrl: "https://managebetcodes.app/dashboard/api",
    docsUrl: "https://managebetcodes.app/docs",
    manualOnly: MANUAL_ONLY_BOOKMAKERS,
  }, { headers: { "Cache-Control": "private, no-store" } })
}
