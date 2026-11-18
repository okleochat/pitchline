import { NextResponse } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { normalizeSlipLegs } from "@/lib/slip/types"
import { createSportPesaBooking, SportPesaBookingError } from "@/lib/slip/sportpesa.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST() {
  let user
  try {
    user = await requireProUser()
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 })
    if (code === "PRO_REQUIRED") return NextResponse.json({ error: "pro_required" }, { status: 403 })
    return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
  }

  try {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("pitchlineSlips")
      .doc("current")
      .get()
    const legs = normalizeSlipLegs(snapshot.data()?.legs ?? [])
    if (!legs?.length) return NextResponse.json({ error: "empty_slip" }, { status: 400 })
    const result = await createSportPesaBooking(legs)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof SportPesaBookingError) {
      return NextResponse.json({
        error: error.code,
        message: error.message,
        details: error.details,
      }, { status: error.status })
    }
    console.error("[pitchline/slip] SportPesa booking-code generation failed", error)
    return NextResponse.json({ error: "bookmaker_unavailable" }, { status: 502 })
  }
}
