import { getApp, getApps, initializeApp } from "firebase/app"
import { FirebaseError } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every((value) => typeof value === "string" && value.length > 0)
let authInstance: Auth | null = null

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured) throw new Error("Firebase web configuration is missing. See docs/FIREBASE_SETUP.md.")
  if (authInstance) return authInstance
  const app = getApps().length ? getApp() : initializeApp(config)
  authInstance = getAuth(app)
  return authInstance
}

export function firebaseErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found": return "Email or password is incorrect."
      case "auth/email-already-in-use": return "An account already exists for that email."
      case "auth/weak-password": return "Choose a stronger password (at least 6 characters)."
      case "auth/popup-closed-by-user": return "The sign-in window was closed before completing."
      case "auth/popup-blocked": return "Your browser blocked the sign-in window."
      default: return "Firebase sign-in failed. Check your project configuration and try again."
    }
  }
  return error instanceof Error ? error.message : "Sign-in failed."
}
