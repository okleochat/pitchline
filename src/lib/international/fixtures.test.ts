import assert from "node:assert/strict"
import test from "node:test"
import { INTERNATIONAL_COMPETITIONS } from "./competitions.ts"

test("international coverage includes major tournaments and qualifiers", () => {
  const slugs = new Set(INTERNATIONAL_COMPETITIONS.map((item) => item.slug))
  for (const slug of [
    "caf.nations",
    "caf.nations_qual",
    "uefa.nations",
    "fifa.world",
    "fifa.worldq.uefa",
    "fifa.worldq.caf",
    "fifa.worldq.afc",
    "fifa.worldq.concacaf",
    "fifa.worldq.conmebol",
    "fifa.worldq.ofc",
    "uefa.euro",
    "uefa.euroq",
    "conmebol.america",
    "afc.asian.cup",
    "conmebol.america_qual",
    "fifa.wwcq.ply",
    "fifa.wworldq.uefa",
    "concacaf.w.gold",
    "conmebol.america.femenina",
  ]) {
    assert.equal(slugs.has(slug), true, slug + " should be included")
  }
  assert.equal(INTERNATIONAL_COMPETITIONS.length >= 14, true)
})
