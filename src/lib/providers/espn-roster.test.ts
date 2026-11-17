import assert from "node:assert/strict"
import test from "node:test"
import { normalizeEspnRoster } from "./espn-roster.ts"

test("normalizes ESPN soccer rosters grouped by position", () => {
  const roster = normalizeEspnRoster({
    athletes: [
      {
        position: "G",
        items: [
          {
            id: "1001",
            displayName: "Goalkeeper One",
            jersey: "1",
            position: { abbreviation: "GK" },
            nationality: { displayName: "Spain" },
          },
        ],
      },
      {
        position: "D",
        items: [
          { id: "1002", firstName: "Defender", lastName: "One", jersey: "4" },
        ],
      },
      {
        position: "M",
        items: [
          { athlete: { id: "1003", fullName: "Midfielder One", position: "CM" } },
        ],
      },
      {
        position: "F",
        items: [
          { id: "1004", displayName: "Forward One", shortName: "F. One" },
        ],
      },
    ],
  })

  assert.equal(roster.length, 4)
  assert.deepEqual(roster.map((item) => item.athlete.id), ["1001", "1002", "1003", "1004"])
  assert.equal(roster[0]?.athlete.position, "GK")
  assert.equal(roster[0]?.athlete.nationality, "Spain")
  assert.equal(roster[1]?.athlete.fullName, "Defender One")
  assert.equal(roster[1]?.athlete.position, "D")
  assert.equal(roster[3]?.athlete.position, "F")
})

test("normalizes flat ESPN roster entries and de-duplicates player IDs", () => {
  const roster = normalizeEspnRoster({
    athletes: [
      { id: "2001", displayName: "Player One", position: { displayName: "Forward", abbreviation: "FW" } },
      { id: "2001", displayName: "Player One duplicate" },
      { player: { id: "2002", firstName: "Player", lastName: "Two" } },
    ],
  })

  assert.equal(roster.length, 2)
  assert.equal(roster[0]?.athlete.fullName, "Player One")
  assert.equal(roster[0]?.athlete.position, "FW")
  assert.equal(roster[1]?.athlete.fullName, "Player Two")
})

test("does not interpret an ESPN error or empty response as an available roster", () => {
  assert.deepEqual(normalizeEspnRoster({ error: { code: 404, message: "Not found" } }), [])
  assert.deepEqual(normalizeEspnRoster({ athletes: [] }), [])
  assert.deepEqual(normalizeEspnRoster(null), [])
})
