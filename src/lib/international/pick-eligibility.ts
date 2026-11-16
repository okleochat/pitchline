export const MIN_INTL_HISTORY_FOR_PICKS = 3

/**
 * National-team picks are withheld when either side lacks a small minimum of
 * previous completed matches in the same competition. This avoids presenting
 * neutral fallback rates as evidence-backed high-confidence selections.
 */
export function hasInternationalPickHistory(
  homeMatches: number | undefined,
  awayMatches: number | undefined,
): boolean {
  return (homeMatches ?? 0) >= MIN_INTL_HISTORY_FOR_PICKS &&
    (awayMatches ?? 0) >= MIN_INTL_HISTORY_FOR_PICKS
}
