import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from "firebase/auth"

/** Mobile browsers use a top-level redirect; desktop keeps the popup flow. */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })

  const isMobile =
    typeof window !== "undefined" &&
    (window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(pointer: coarse)").matches)

  if (isMobile) {
    await signInWithRedirect(auth, provider)
    return
  }

  await signInWithPopup(auth, provider)
}
