export type SubscriptionRecord = {
  plan?: unknown
  status?: unknown
  currentPeriodEnd?: unknown
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number }
    if (typeof timestamp.toMillis === "function") {
      const result = timestamp.toMillis()
      return Number.isFinite(result) ? result : null
    }
    if (typeof timestamp.toDate === "function") {
      const result = timestamp.toDate().getTime()
      return Number.isFinite(result) ? result : null
    }
    if (typeof timestamp.seconds === "number" && Number.isFinite(timestamp.seconds)) return timestamp.seconds * 1000
  }
  return null
}

/** Pro is granted only by a server-managed Pro record with an active status and future expiry. */
export function isSubscriptionActive(record: SubscriptionRecord | undefined, now = Date.now()): boolean {
  if (!record || record.plan !== "pro" || (record.status !== "active" && record.status !== "trialing")) return false
  const end = timestampMillis(record.currentPeriodEnd)
  return end !== null && end > now
}
