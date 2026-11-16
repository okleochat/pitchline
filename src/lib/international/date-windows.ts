/**
 * Return YYYYMM calendar buckets covering an inclusive ISO date range.
 * ESPN's site scoreboard supports month queries; daily requests are avoided
 * without relying on the retired YYYYMMDD-YYYYMMDD form.
 */
export function monthKeysInRange(startDate: string, endDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    throw new Error("A valid inclusive YYYY-MM-DD range is required.")
  }
  const months: string[] = []
  const cursor = new Date(startDate + "T12:00:00Z")
  const end = new Date(endDate + "T12:00:00Z")
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 7).replace("-", "")
    if (months[months.length - 1] !== key) months.push(key)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return months
}
