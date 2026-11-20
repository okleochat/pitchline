import type { Team } from "@/data/football"

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Convert ESPN's FIFA international team directory into simulator teams.
 * The stable int-{ESPN id} identity is deliberately independent of whichever
 * competition happened to list that country most recently.
 */
export function mapNationalTeamDirectory(
  rows: readonly unknown[],
  preferredFeedById: ReadonlyMap<string, string> = new Map(),
): Team[] {
  const byId = new Map<string, Team>()

  for (const row of rows) {
    const wrapper = record(row)
    const source = record(wrapper?.team) ?? wrapper
    if (!source || source.isActive === false) continue

    const espnIdValue = source.id
    const espnId = typeof espnIdValue === "string" || typeof espnIdValue === "number"
      ? String(espnIdValue)
      : ""
    if (!/^\d{1,12}$/.test(espnId)) continue

    const name = textValue(source.displayName) ?? textValue(source.name)
    if (!name) continue

    const abbreviation = textValue(source.abbreviation)
    const rawColor = textValue(source.color)?.replace(/^#/, "")
    const color = rawColor && /^[0-9a-fA-F]{6}$/.test(rawColor)
      ? "#" + rawColor.toLowerCase()
      : "#1e3348"

    // Keep the first canonical display name when the same country appears
    // in several ESPN competition directories (for example, "Spain").
    if (byId.has(espnId)) continue

    byId.set(espnId, {
      id: "int-" + espnId,
      name,
      short: (abbreviation ?? name.slice(0, 3)).slice(0, 4).toUpperCase(),
      league: "int",
      // A neutral starting point is replaced with the selected country's
      // recent international form when the simulator opens its form window.
      attack: 1.35,
      defense: 1.35,
      mark: color,
      ink: "#f6f4ef",
      scorers: ["Attacker", "Attacker", "Attacker"],
      espnId,
      feedSlug: preferredFeedById.get(espnId) ?? "fifa.friendly",
      rateLeague: "int",
      formMatches: 0,
      competitionName: "National team",
      ratingSource: "Neutral baseline · recent international form loads on selection",
      directoryOnly: true,
    })
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
