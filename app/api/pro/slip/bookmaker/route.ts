import { NextResponse, type NextRequest } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { normalizeSlipLegs } from "@/lib/slip/types"
import { createManagedBookmakerBooking, ManagedBookmakerError } from "@/lib/slip/manage-bet-codes.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    if (code === "PRO_REQUIRED") return NextResponse.json({ error: "pro_required" }, { status: 403 })
    return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
  }

  let body: Record<string, unknown> | null = null
  try {
    const value: unknown = await request.json()
    if (value && typeof value === "object" && !Array.isArray(value)) {
      body = value as Record<string, unknown>
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const bookmaker = typeof body?.bookmaker === "string" ? body.bookmaker.trim() : ""
  try {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("pitchlineSlips")
      .doc("current")
      .get()
    const legs = normalizeSlipLegs(snapshot.data()?.legs ?? [])
    if (!legs?.length) return NextResponse.json({ error: "empty_slip" }, { status: 400 })

    const booking = await createManagedBookmakerBooking(legs, bookmaker)
    return NextResponse.json(booking, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof ManagedBookmakerError) {
      return NextResponse.json({
        error: error.code,
        message: error.message,
        details: error.details,
      }, { status: error.status })
    }
    console.error("[pitchline/slip] Managed bookmaker booking failed", error)
    return NextResponse.json({ error: "bookmaker_unavailable" }, { status: 502 })
  }
}
