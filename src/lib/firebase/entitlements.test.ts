import assert from "node:assert/strict"
import test from "node:test"
import { isSubscriptionActive } from "./entitlements.ts"

test("only active or trialing subscriptions with a future expiry grant Pro", () => {
  const now = Date.UTC(2026, 10, 16)
  assert.equal(isSubscriptionActive({ status: "active", currentPeriodEnd: now + 1000 }, now), true)
  assert.equal(isSubscriptionActive({ status: "trialing", currentPeriodEnd: now + 1000 }, now), true)
  assert.equal(isSubscriptionActive({ status: "past_due", currentPeriodEnd: now + 1000 }, now), false)
  assert.equal(isSubscriptionActive({ status: "active", currentPeriodEnd: now - 1 }, now), false)
  assert.equal(isSubscriptionActive({ status: "active" }, now), false)
})

test("Firestore timestamp-like values are supported", () => {
  const now = Date.UTC(2026, 10, 16)
  assert.equal(isSubscriptionActive({
    status: "active",
    currentPeriodEnd: { toMillis: () => now + 5000 },
  }, now), true)
})
