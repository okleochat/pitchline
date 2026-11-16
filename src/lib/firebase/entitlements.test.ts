import assert from "node:assert/strict"
import test from "node:test"
import { isSubscriptionActive } from "./entitlements.ts"

test("only Pro active or trialing subscriptions with a future expiry grant Pro", () => {
  const now = Date.UTC(2026, 10, 16)
  assert.equal(isSubscriptionActive({ plan: "pro", status: "active", currentPeriodEnd: now + 1000 }, now), true)
  assert.equal(isSubscriptionActive({ plan: "pro", status: "trialing", currentPeriodEnd: now + 1000 }, now), true)
  assert.equal(isSubscriptionActive({ plan: "free", status: "active", currentPeriodEnd: now + 1000 }, now), false)
  assert.equal(isSubscriptionActive({ plan: "pro", status: "past_due", currentPeriodEnd: now + 1000 }, now), false)
  assert.equal(isSubscriptionActive({ plan: "pro", status: "active", currentPeriodEnd: now - 1 }, now), false)
  assert.equal(isSubscriptionActive({ plan: "pro", status: "active" }, now), false)
})

test("Firestore timestamp-like values are supported", () => {
  const now = Date.UTC(2026, 10, 16)
  assert.equal(isSubscriptionActive({
    plan: "pro",
    status: "active",
    currentPeriodEnd: { toMillis: () => now + 5000 },
  }, now), true)
})
