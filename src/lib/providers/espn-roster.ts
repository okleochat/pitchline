type Dict = Record<string, unknown>

export type NormalizedEspnRosterEntry = {
  athlete: {
    id: string
    fullName: string
    firstName: string
    lastName: string
    position: string | null
    nationality: string | null
    jersey: unknown
  }
}

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Dict
    : null
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && /^\d{1,12}$/.test(value.trim())) return value.trim()
  return null
}

function athleteRecord(value: unknown): Dict | null {
  const item = record(value)
  if (!item) return null
  return record(item.athlete) ?? record(item.player) ?? item
}

function athleteId(value: unknown): string | null {
  const athlete = athleteRecord(value)
  return numericId(athlete?.id ?? athlete?.athleteId ?? athlete?.athlete_id)
}

function athleteName(value: unknown): string | null {
  const athlete = athleteRecord(value)
  if (!athlete) return null
  const direct = stringValue(
    athlete.fullName ?? athlete.displayName ?? athlete.name ??
    athlete.display_name ?? athlete.shortName ?? athlete.short_name,
  )
  if (direct) return direct
  const first = stringValue(athlete.firstName ?? athlete.first_name)
  const last = stringValue(athlete.lastName ?? athlete.last_name)
  return [first, last].filter(Boolean).join(" ") || null
}

function positionLabel(value: unknown): string | null {
  const position = record(value)
  return stringValue(
    position?.abbreviation ?? position?.shortDisplayName ??
    position?.displayName ?? position?.name ?? value,
  )
}

function nationalityLabel(value: unknown): string | null {
  const nationality = record(value)
  return stringValue(
    nationality?.displayName ?? nationality?.name ??
    nationality?.abbreviation ?? value,
  )
}

/**
 * ESPN soccer rosters commonly group athletes by position:
 * { athletes: [{ position: "G", items: [{ id, displayName, ... }] }] }.
 * This parser preserves the parent group position when a child omits it.
 */
export function normalizeEspnRoster(payload: unknown): NormalizedEspnRosterEntry[] {
  const root = record(payload)
  if (!root) return []

  const result: NormalizedEspnRosterEntry[] = []
  const seen = new Set<string>()

  const visit = (value: unknown, depth: number, inheritedPosition: string | null) => {
    if (depth > 8 || value === null || value === undefined) return

    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1, inheritedPosition)
      return
    }

    const item = record(value)
    if (!item) return

    const athlete = athleteRecord(item)
    const id = athleteId(item)
    const name = athleteName(item)

    if (athlete && id && name) {
      if (seen.has(id)) return
      seen.add(id)

      const rawPosition = athlete.position ?? item.position ?? inheritedPosition
      const rawNationality = athlete.nationality ?? athlete.citizenship ?? item.nationality
      const position = positionLabel(rawPosition)
      const nationality = nationalityLabel(rawNationality)

      result.push({
        athlete: {
          id,
          fullName: name,
          firstName: stringValue(athlete.firstName ?? athlete.first_name) ?? "",
          lastName: stringValue(athlete.lastName ?? athlete.last_name) ?? "",
          position,
          nationality,
          jersey: athlete.jersey ?? athlete.number ?? athlete.jerseyNumber ??
            athlete.jersey_number ?? item.jersey ?? item.number ?? null,
        },
      })
      return
    }

    const nextPosition = positionLabel(item.position) ?? inheritedPosition
    for (const key of ["athletes", "players", "items", "roster", "entries", "groups"]) {
      if (item[key] !== undefined) visit(item[key], depth + 1, nextPosition)
    }
  }

  visit(root.athletes ?? root.players ?? root.roster ?? root, 0, null)
  return result
}
