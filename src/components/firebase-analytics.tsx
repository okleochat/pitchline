"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { logEvent } from "firebase/analytics"
import { firebaseConfigured, getFirebaseAnalytics } from "@/lib/firebase/client"

export function FirebaseAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    if (!firebaseConfigured) return
    let active = true
    void getFirebaseAnalytics().then((analytics) => {
      if (active && analytics) logEvent(analytics, "page_view", { page_path: pathname })
    })
    return () => { active = false }
  }, [pathname])

  return null
}
