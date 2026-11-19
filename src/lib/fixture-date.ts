/**
 * Convert a verified kickoff timestamp to the viewer's local calendar date.
 * Date inputs use the same local timezone the user sees in the browser.
 */
export function localFixtureDateKey(kickoffAt: string | null | undefined): string | null {
  if (!kickoffAt) return null
  const date = new Date(kickoffAt)
  if (!Number.isFinite(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
