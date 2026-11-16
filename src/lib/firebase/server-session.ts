import "server-only"

import { cookies } from "next/headers"
import type { DecodedIdToken } from "firebase-admin/auth"
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "./admin"
import { isSubscriptionActive } from "./entitlements"

export const SESSION_COOKIE_NAME = "pitchline_session"

export type CurrentUser = {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
  isPro: boolean
}

function serializeUser(decoded: DecodedIdToken, isPro: boolean): CurrentUser {
  return {
    uid: decoded.uid,
    email: typeof decoded.email === "string" ? decoded.email : null,
    name: typeof decoded.name === "string" ? decoded.name : null,
    picture: typeof decoded.picture === "string" ? decoded.picture : null,
    isPro,
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const session = store.get(SESSION_COOKIE_NAME)?.value
  if (!session) return null
  try {
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(session, true)
    const subscription = await getFirebaseAdminFirestore().collection("subscriptions").doc(decoded.uid).get()
    return serializeUser(decoded, isSubscriptionActive(subscription.data(), Date.now()))
  } catch {
    return null
  }
}

export async function requireSignedInUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("AUTH_REQUIRED")
  return user
}

export async function requireProUser(): Promise<CurrentUser> {
  const user = await requireSignedInUser()
  if (!user.isPro) throw new Error("PRO_REQUIRED")
  return user
}
