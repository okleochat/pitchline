import { NextRequest, NextResponse } from "next/server"
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase/admin"
import { FieldValue } from "firebase-admin/firestore"
import { SESSION_COOKIE_NAME } from "@/lib/firebase/server-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000
const RECENT_SIGN_IN_SECONDS = 5 * 60

function normalizedOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}

/**
 * Firebase App Hosting terminates TLS in front of the Next.js container.
 * request.nextUrl.origin can reflect an internal origin, while the browser
 * sends the public *.hosted.app origin. Check the explicit public origin and
 * the reverse-proxy host/protocol before rejecting the session exchange.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = normalizedOrigin(request.headers.get("origin"))
  if (!origin) return false

  const configuredOrigin = normalizedOrigin(process.env.APP_BASE_URL)
  if (configuredOrigin && origin === configuredOrigin) return true

  const requestOrigin = normalizedOrigin(request.nextUrl.origin)
  if (requestOrigin && origin === requestOrigin) return true

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim()
  const protocol = forwardedProto
    ? forwardedProto.replace(/:$/, "") + ":"
    : request.nextUrl.protocol

  return Boolean(host && normalizedOrigin(protocol + "//" + host) === origin)
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 })

  let stage = "verify_id_token"
  try {
    const body = (await request.json()) as { idToken?: unknown }
    if (typeof body.idToken !== "string" || body.idToken.length > 12_000) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 })
    }

    const auth = getFirebaseAdminAuth()
    const decoded = await auth.verifyIdToken(body.idToken, true)
    const authTime = Number(decoded.auth_time ?? 0)
    const age = Math.floor(Date.now() / 1000) - authTime
    if (!authTime || age < 0 || age > RECENT_SIGN_IN_SECONDS) {
      return NextResponse.json({ error: "recent_sign_in_required" }, { status: 401 })
    }

    stage = "create_session_cookie"
    const session = await auth.createSessionCookie(body.idToken, { expiresIn: SESSION_DURATION_MS })

    // Profile persistence is useful, but it is not an authentication prerequisite.
    try {
      const profileRef = getFirebaseAdminFirestore().collection("users").doc(decoded.uid)
      const profile = await profileRef.get()
      const profileData = {
        displayName: typeof decoded.name === "string" ? decoded.name : null,
        photoURL: typeof decoded.picture === "string" ? decoded.picture : null,
        updatedAt: FieldValue.serverTimestamp(),
        ...(!profile.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      }
      await profileRef.set(profileData, { merge: true })
    } catch (error) {
      console.warn("[pitchline/auth] Session created, but profile sync failed.", {
        code: typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "unknown",
      })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    })
    return response
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : error instanceof Error ? error.name : "unknown"
    console.error("[pitchline/auth] Session creation failed.", { stage, code })
    return NextResponse.json({ error: "session_creation_failed", stage }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
