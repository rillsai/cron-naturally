import { DEFAULT_LOCALE } from "./i18n/index.js";
import type { DayLexicon, Lexicon } from "./i18n/types.js";

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

/**
 * Fuzzy match over a surface-word → canonical-symbol map, returning the
 * symbol. Unlike {@link fuzzyMatch}, two surfaces that resolve to the SAME
 * symbol (e.g. "minute" and its alias "minutes") never count as a tie; only
 * genuinely ambiguous matches across different symbols reject.
 */
export function fuzzyCanonicalize(
  token: string,
  surfaceToSymbol: ReadonlyMap<string, string>,
): string | null {
  const allowed = maxDistanceFor(token.length);
  if (allowed === 0) return null;
  let bestSymbol: string | null = null;
  let bestDist = allowed + 1;
  let tie = false;
  for (const [surface, symbol] of surfaceToSymbol) {
    const d = editDistance(token, surface);
    if (d < bestDist) {
      bestDist = d;
      bestSymbol = symbol;
      tie = false;
    } else if (d === bestDist && symbol !== bestSymbol) {
      tie = true;
    }
  }
  return bestDist <= allowed && !tie ? bestSymbol : null;
}

/**
 * Token → day index 0-6 (cron convention, 0=Sunday) within a locale's day
 * vocabulary, or null. Order: exact full name → curated abbreviation →
 * singularized retry → unique fuzzy match against full names. The plural rule is
 * the locale's ({@link Lexicon.singularize}), not assumed to be trailing-"s".
 */
export function findDay(
  token: string,
  days: DayLexicon,
  singularize: Lexicon["singularize"],
): number | null {
  const { fullNames, abbreviations } = days;
  if (token in fullNames) return fullNames[token];
  if (token in abbreviations) return abbreviations[token];
  const fullNameKeys = Object.keys(fullNames);
  const singular = singularize(token);
  if (singular !== null) {
    if (singular in fullNames) return fullNames[singular];
    if (singular in abbreviations) return abbreviations[singular];
    const fuzzySingular = fuzzyMatch(singular, fullNameKeys);
    if (fuzzySingular !== null) return fullNames[fuzzySingular];
  }
  const fuzzy = fuzzyMatch(token, fullNameKeys);
  return fuzzy === null ? null : fullNames[fuzzy];
}

/** Default-locale convenience wrapper around {@link findDay}. */
export function matchDay(token: string): number | null {
  return findDay(token, DEFAULT_LOCALE.days, DEFAULT_LOCALE.lexicon.singularize);
}
