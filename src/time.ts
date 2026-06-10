import { DEFAULT_LOCALE } from "./i18n/index.js";
import type { TimeLexicon } from "./i18n/types.js";

export interface ParsedTime {
  hour: number; // 0-23
  minute: number; // 0-59
  /** True when AM was assumed on a bare hour ("at 9", "9:30", bare "12" = noon). */
  assumedMeridiem: boolean;
}

/** Escape a locale string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One compiled meridiem pattern per locale time vocabulary.
const meridiemRegexCache = new WeakMap<TimeLexicon, RegExp>();

function meridiemRegexFor(words: TimeLexicon): RegExp {
  let re = meridiemRegexCache.get(words);
  if (!re) {
    re = new RegExp(
      `^(\\d{1,2})(?::(\\d{2}))?(${escapeRegExp(words.am)}|${escapeRegExp(words.pm)})$`,
    );
    meridiemRegexCache.set(words, re);
  }
  return re;
}

/**
 * Parse one (possibly merged) time token in a locale's time vocabulary.
 * Accepted forms: noon, midnight, 9am, 9:30pm, 21:00, 2100/900 (military),
 * bare 0-23. Bare 1-11 assume AM; bare 12 assumes noon; both flagged
 * assumedMeridiem so the caller can surface the assumption with a one-click flip.
 */
export function readTime(token: string, words: TimeLexicon): ParsedTime | null {
  if (token === words.noon) return { hour: 12, minute: 0, assumedMeridiem: false };
  if (token === words.midnight) return { hour: 0, minute: 0, assumedMeridiem: false };

  // Locale clock formats ("9h30", "21h") come first and are explicit.
  const clock = words.readClock?.(token);
  if (clock) {
    if (clock.hour > 23 || clock.minute > 59) return null;
    return { ...clock, assumedMeridiem: false };
  }

  const meridiem = token.match(meridiemRegexFor(words));
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem[3] === words.pm && hour !== 12) hour += 12;
    if (meridiem[3] === words.am && hour === 12) hour = 0;
    return { hour, minute, assumedMeridiem: false };
  }

  const colon = token.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, assumedMeridiem: hour >= 1 && hour <= 12 };
  }

  if (/^\d{3,4}$/.test(token)) {
    const minute = Number(token.slice(-2));
    const hour = Number(token.slice(0, -2));
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, assumedMeridiem: false };
  }

  if (/^\d{1,2}$/.test(token)) {
    const hour = Number(token);
    if (hour > 23) return null;
    if (hour === 0 || hour >= 13) return { hour, minute: 0, assumedMeridiem: false };
    return { hour, minute: 0, assumedMeridiem: true };
  }

  return null;
}

/** Default-locale convenience wrapper around {@link readTime}. */
export function parseTimeToken(token: string): ParsedTime | null {
  return readTime(token, DEFAULT_LOCALE.time);
}

/** Default-locale canonical clock string: "9:05 AM", "12:00 PM". */
export function formatTime12(hour: number, minute: number): string {
  return DEFAULT_LOCALE.format.time(hour, minute);
}
