import { getApp, getApps, initializeApp } from "firebase/app"
import { FirebaseError } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics"

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

export const firebaseConfigured = [config.apiKey, config.authDomain, config.projectId, config.appId].every((value) => typeof value === "string" && value.length > 0)
let authInstance: Auth | null = null
let analyticsPromise: Promise<Analytics | null> | null = null

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured) throw new Error("Firebase web configuration is missing. See docs/FIREBASE_SETUP.md.")
  if (authInstance) return authInstance
  const app = getApps().length ? getApp() : initializeApp(config)
  authInstance = getAuth(app)
  return authInstance
}

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!firebaseConfigured || !config.measurementId || typeof window === "undefined") return Promise.resolve(null)
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) => supported ? getAnalytics(getApps().length ? getApp() : initializeApp(config)) : null).catch(() => null)
  }
  return analyticsPromise
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
