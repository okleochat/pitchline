import { GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth"

/**
 * Pitchline runs on Firebase App Hosting, not Firebase Hosting. Keep the
 * same-origin popup flow here; redirect sign-in on a separate authDomain can
 * require extra redirect-helper configuration in browsers that partition
 * cross-site storage.
 */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })
  await signInWithPopup(auth, provider)
}
