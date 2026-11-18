import "server-only"

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "pitchline-admin")
  if (existing) return existing

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT

  if (!raw) {
    // Firebase App Hosting supplies Google Application Default Credentials
    // through its runtime identity. Vercel can continue to use the JSON secret.
    return initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    }, "pitchline-admin")
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
    projectId: projectId || account.project_id,
  }, "pitchline-admin")
}

export function firebaseAdminCredentialMode():
  | "service-account-json"
  | "application-default-candidate"
  | "missing" {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return "service-account-json"
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
    return "application-default-candidate"
  }
  return "missing"
}

export function hasFirebaseAdminCredentials(): boolean {
  return firebaseAdminCredentialMode() !== "missing"
}

export function getFirebaseAdminAuth() { return getAuth(getAdminApp()) }
export function getFirebaseAdminFirestore() { return getFirestore(getAdminApp()) }
