import assert from "node:assert/strict"
import test from "node:test"
import { mapNationalTeamDirectory } from "./national-teams.ts"

test("national-team directory includes Spain and France without requiring fixtures", () => {
  const teams = mapNationalTeamDirectory([
    { team: { id: "164", displayName: "Spain", abbreviation: "ESP", color: "c60b1e", isActive: true } },
    { team: { id: "478", displayName: "France", abbreviation: "FRA", color: "000080", isActive: true } },
  ], new Map([["164", "uefa.nations"], ["478", "uefa.nations"]]))

  assert.deepEqual(teams.map((team) => team.name), ["France", "Spain"])
  assert.equal(teams.find((team) => team.name === "Spain")?.id, "int-164")
  assert.equal(teams.find((team) => team.name === "France")?.id, "int-478")
  assert.equal(teams.find((team) => team.name === "Spain")?.feedSlug, "uefa.nations")
  assert.equal(teams.every((team) => team.league === "int" && team.directoryOnly), true)
})

test("national-team directory rejects invalid and inactive ESPN rows and deduplicates IDs", () => {
  const teams = mapNationalTeamDirectory([
    { team: { id: "164", displayName: "Spain", abbreviation: "ESP", isActive: true } },
    { team: { id: "164", displayName: "Spain National Team", abbreviation: "ESP", isActive: true } },
    { team: { id: "bad", displayName: "Invalid", isActive: true } },
    { team: { id: "999", displayName: "Inactive", isActive: false } },
  ])

  assert.equal(teams.length, 1)
  assert.equal(teams[0].name, "Spain")
  assert.equal(teams[0].id, "int-164")
})
