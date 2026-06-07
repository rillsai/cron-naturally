export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const FULL_DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Explicit, curated abbreviations. Single letters appear only where
 * unambiguous: m/w/f map; "t" (Tuesday/Thursday) and "s" (Saturday/Sunday)
 * are deliberately absent.
 */
const DAY_ABBREVIATIONS: Record<string, number> = {
  f: 5,
  fr: 5,
  fri: 5,
  m: 1,
  mo: 1,
  mon: 1,
  sa: 6,
  sat: 6,
  su: 0,
  sun: 0,
  th: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thrs: 4,
  tu: 2,
  tue: 2,
  tues: 2,
  w: 3,
  we: 3,
  wed: 3,
  weds: 3,
};

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  return dp[a.length][b.length];
}

/** Tolerance scales with token length; short tokens get no fuzz. */
function maxDistanceFor(len: number): number {
  if (len >= 7) return 2;
  if (len >= 5) return 1;
  return 0;
}

/**
 * Unique fuzzy match of token against candidates within the length-scaled
 * distance budget. Returns null on no match or tie (ambiguity = rejection).
 */
export function fuzzyMatch(token: string, candidates: readonly string[]): string | null {
  const allowed = maxDistanceFor(token.length);
  if (allowed === 0) return null;
  let best: string | null = null;
  let bestDist = allowed + 1;
  let tie = false;
  for (const candidate of candidates) {
    const d = editDistance(token, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
      tie = false;
    } else if (d === bestDist && candidate !== best) {
      tie = true;
    }
  }
  return bestDist <= allowed && !tie ? best : null;
}

const FULL_DAY_NAMES = Object.keys(FULL_DAYS);

/**
 * Token → day index 0-6 (cron convention, 0=Sunday), or null.
 * Order: exact full name → curated abbreviation → plural (trailing s)
 * retry → unique fuzzy match against full names.
 */
export function matchDay(token: string): number | null {
  if (token in FULL_DAYS) return FULL_DAYS[token];
  if (token in DAY_ABBREVIATIONS) return DAY_ABBREVIATIONS[token];
  if (token.endsWith("s")) {
    const singular = token.slice(0, -1);
    if (singular in FULL_DAYS) return FULL_DAYS[singular];
    if (singular in DAY_ABBREVIATIONS) return DAY_ABBREVIATIONS[singular];
    const fuzzySingular = fuzzyMatch(singular, FULL_DAY_NAMES);
    if (fuzzySingular !== null) return FULL_DAYS[fuzzySingular];
  }
  const fuzzy = fuzzyMatch(token, FULL_DAY_NAMES);
  return fuzzy === null ? null : FULL_DAYS[fuzzy];
}
