import assert from "node:assert/strict"
import test from "node:test"
import { localFixtureDateKey } from "./fixture-date.ts"

test("local fixture date key uses the viewer's calendar day", () => {
  const localDate = new Date(2026, 10, 19, 23, 45, 0)
  const expected = [
    localDate.getFullYear(),
    String(localDate.getMonth() + 1).padStart(2, "0"),
    String(localDate.getDate()).padStart(2, "0"),
  ].join("-")
  assert.equal(localFixtureDateKey(localDate.toISOString()), expected)
})

test("local fixture date key rejects missing and invalid kickoff timestamps", () => {
  assert.equal(localFixtureDateKey(null), null)
  assert.equal(localFixtureDateKey(undefined), null)
  assert.equal(localFixtureDateKey("not-a-date"), null)
})
