import "server-only"

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "pitchline-admin")
  if (existing) return existing
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not configured.")
    // Firebase App Hosting / Cloud Run supplies Application Default Credentials.
    // Vercel can continue to use an explicitly configured server-only service account.
    return initializeApp({ credential: applicationDefault(), projectId }, "pitchline-admin")
  }

  let account: { project_id?: string; client_email?: string; private_key?: string }
  try {
    account = JSON.parse(raw) as typeof account
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid service-account JSON.")
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("Firebase service-account JSON is missing required fields.")
  }

  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, "\n"),
    }),
    projectId: process.env.FIREBASE_PROJECT_ID || account.project_id,
  }, "pitchline-admin")
}

export function getFirebaseAdminAuth() { return getAuth(getAdminApp()) }
export function getFirebaseAdminFirestore() { return getFirestore(getAdminApp()) }
