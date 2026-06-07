/**
 * Canonical sample phrases. Shared by the schedule panel chips, the
 * marketing tool chips, and error suggestions, so the taught grammar
 * never drifts from the implemented grammar (round-trip tested).
 */
export const EXAMPLE_PHRASES = [
  "every 15 minutes",
  "mondays at 9am",
  "weekdays at noon",
  "1st of the month at 8am",
  "fridays at 21:00",
] as const;
