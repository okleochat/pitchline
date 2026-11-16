import assert from "node:assert/strict"
import test from "node:test"
import { isAllowedRequestOrigin } from "./request-origin.ts"

test("accepts the configured public Firebase App Hosting origin behind an internal proxy origin", () => {
  assert.equal(isAllowedRequestOrigin({
    origin: "https://pitchline--pitchline-app.europe-west4.hosted.app",
    appBaseUrl: "https://pitchline--pitchline-app.europe-west4.hosted.app",
    requestOrigin: "http://10.20.0.4:8080",
    forwardedHost: "internal-service.run.app",
    forwardedProto: "https",
  }), true)
})

test("accepts the forwarded public host and protocol", () => {
  assert.equal(isAllowedRequestOrigin({
    origin: "https://pitchline.example.com",
    requestOrigin: "http://internal:8080",
    forwardedHost: "pitchline.example.com",
    forwardedProto: "https",
  }), true)
})

test("rejects an unrelated origin", () => {
  assert.equal(isAllowedRequestOrigin({
    origin: "https://attacker.example",
    appBaseUrl: "https://pitchline.example.com",
    requestOrigin: "https://internal.example",
    forwardedHost: "pitchline.example.com",
    forwardedProto: "https",
  }), false)
})

test("rejects a missing Origin header", () => {
  assert.equal(isAllowedRequestOrigin({
    origin: null,
    appBaseUrl: "https://pitchline.example.com",
    requestOrigin: "https://pitchline.example.com",
  }), false)
})
