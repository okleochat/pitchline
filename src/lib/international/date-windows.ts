/**
 * Return YYYYMM calendar buckets covering an inclusive ISO date range.
 * ESPN's site scoreboard supports month queries; daily requests are avoided
 * without relying on the retired YYYYMMDD-YYYYMMDD form.
 */
export function monthKeysInRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + "T00:00:00Z")
  const end = new Date(endDate + "T00:00:00Z")
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start.toISOString().slice(0, 10) !== startDate ||
    end.toISOString().slice(0, 10) !== endDate ||
    endDate < startDate
  ) {
    throw new Error("A valid inclusive YYYY-MM-DD range is required.")
  }
  const months: string[] = []
  const cursor = new Date(startDate + "T12:00:00Z")
  const rangeEnd = new Date(endDate + "T12:00:00Z")
  while (cursor.getTime() <= rangeEnd.getTime()) {
    const key = cursor.toISOString().slice(0, 7).replace("-", "")
    if (months[months.length - 1] !== key) months.push(key)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return months
}

/** Upcoming-only cache must never replace today's full scoreboard. */
export function canReuseUpcomingCache(requestedDate: string, today: string, endDate: string): boolean {
  return requestedDate > today && requestedDate <= endDate
}
