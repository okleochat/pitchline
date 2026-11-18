import { NextResponse, type NextRequest } from "next/server"
import { requireProUser } from "@/lib/firebase/server-session"
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { normalizeSlipLegs } from "@/lib/slip/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authError(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "AUTH_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 })
  if (code === "PRO_REQUIRED") return NextResponse.json({ error: "pro_required" }, { status: 403 })
  return NextResponse.json({ error: "subscription_verification_unavailable" }, { status: 503 })
}

function slipRef(uid: string) {
  return getFirebaseAdminFirestore()
    .collection("users")
    .doc(uid)
    .collection("pitchlineSlips")
    .doc("current")
}

export async function GET() {
  let user
  try {
    user = await requireProUser()
  } catch (error) {
    return authError(error)
  }

  try {
    const snapshot = await slipRef(user.uid).get()
    const data = snapshot.data()
    const legs = normalizeSlipLegs(data?.legs ?? [])
    if (!legs) return NextResponse.json({ legs: [], updatedAt: null })
    return NextResponse.json({
      legs,
      updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : null,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "slip_unavailable" }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  let user
  try {
    user = await requireProUser()
  } catch (error) {
    return authError(error)
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

  const legs = normalizeSlipLegs(body?.legs)
  if (!legs) {
    return NextResponse.json({
      error: "invalid_slip",
      message: "Use up to twelve valid selections, with no more than one selection per match.",
    }, { status: 400 })
  }

  const updatedAt = Date.now()
  try {
    await slipRef(user.uid).set({ schemaVersion: 1, updatedAt, legs })
    return NextResponse.json({ ok: true, legs, updatedAt }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch {
    return NextResponse.json({ error: "slip_save_failed" }, { status: 503 })
  }
}
