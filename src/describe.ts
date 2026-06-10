import { SPECIAL_EQUIVALENTS } from "./cron.js";
import { DEFAULT_LOCALE, type LocaleOptions, resolveLocale } from "./i18n/index.js";
import type { Locale } from "./i18n/types.js";

/** Expand a dom field ("15", "1,15", "1-7") to day numbers; null = invalid/not a plain dom. */
function parseDomField(field: string): number[] | null {
  const out: number[] = [];
  for (const part of field.split(",")) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to > 31 || from > to) return null;
      for (let d = from; d <= to; d++) out.push(d);
    } else if (/^\d+$/.test(part)) {
      const d = Number(part);
      if (d < 1 || d > 31) return null;
      out.push(d);
    } else {
      return null;
    }
  }
  return out;
}

/** Ordinal pieces of a dom field, e.g. "1,15" → ["1st", "15th"], "1-7" → ["1st through 7th"]. */
function domParts(field: string, loc: Locale): string[] {
  return field.split(",").map((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      return loc.format.range(
        loc.format.ordinal(Number(range[1])),
        loc.format.ordinal(Number(range[2])),
      );
    }
    return loc.format.ordinal(Number(part));
  });
}

/** Day-of-month phrase without the trailing unit, e.g. "the 1st and 15th". */
function domListPhrase(field: string, loc: Locale): string {
  return loc.messages.describe.domThe(loc.format.list(domParts(field, loc)));
}

/** Full day-of-month phrase, e.g. "the 1st and 15th of the month". */
export function domPhrase(field: string, loc: Locale = DEFAULT_LOCALE): string {
  return loc.messages.describe.domOfMonth(loc.format.list(domParts(field, loc)));
}

/** Expand a dow field ("1-5", "0,6", "2-4", "7") to sorted day indices; null = invalid. */
function expandDow(field: string): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const range = part.match(/^(\d)-(\d)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > 7 || to > 7 || from > to) return null;
      for (let d = from; d <= to; d++) out.add(d === 7 ? 0 : d);
    } else if (/^\d$/.test(part)) {
      const d = Number(part);
      if (d > 7) return null;
      out.add(d === 7 ? 0 : d);
    } else {
      return null;
    }
  }
  return [...out].sort((a, b) => a - b);
}

function dowSuffix(days: number[] | null, loc: Locale): string {
  const D = loc.messages.describe;
  if (!days || days.length === 0 || days.length === 7) return "";
  if (days.join(",") === "1,2,3,4,5") return D.dowWeekdays;
  if (days.join(",") === "0,6") return D.dowWeekends;
  return D.dowList(loc.format.list(days.map((d) => loc.days.labels[d])));
}

/**
 * Canonical phrasing for a cron expression, or null when outside the grammar.
 * Invariant (enforced by round-trip tests): every string this returns
 * re-parses via parseNaturalSchedule to a semantically identical cron.
 */
export function describeCron(cron: string, opts?: LocaleOptions): string | null {
  const loc = resolveLocale(opts);
  const D = loc.messages.describe;
  const trimmed = cron.trim();
  const resolved = SPECIAL_EQUIVALENTS[trimmed] ?? trimmed;
  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dowField] = parts;
  if (month !== "*") return null; // month restrictions are outside the v1 grammar
  const days = dowField === "*" ? null : expandDow(dowField);
  if (dowField !== "*" && (days === null || days.length === 0)) return null;

  if (min === "*" && hour === "*" && dom === "*") return D.everyMinute(dowSuffix(days, loc));
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === "*" && dom === "*") {
    return D.everyNMinutes(minStep[1], dowSuffix(days, loc));
  }

  if (!/^\d+$/.test(min)) return null;
  const minute = Number(min);
  if (minute > 59) return null;

  if (hour === "*" && dom === "*") {
    const at = minute > 0 ? D.atMinute(minute) : "";
    return D.everyHour(at, dowSuffix(days, loc));
  }
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep && dom === "*") {
    const at = minute > 0 ? D.atMinute(minute) : "";
    return D.everyNHours(hourStep[1], at, dowSuffix(days, loc));
  }

  if (!/^\d+(,\d+)*$/.test(hour)) return null;
  const hours = hour.split(",").map(Number);
  if (hours.some((h) => h > 23)) return null;
  const timeList = loc.format.list(hours.map((h) => loc.format.time(h, minute)));

  const domDays = dom === "*" ? null : parseDomField(dom);
  if (dom !== "*" && domDays === null) return null; // dom step or out-of-range: outside grammar
  const hasDow = days !== null && days.length > 0 && days.length < 7;
  if (domDays) {
    // dom+dow are OR'd by cron: fires when EITHER matches. Spell that out.
    if (hasDow) return D.domOrDow(domPhrase(dom, loc), dowSuffix(days, loc), timeList);
    return D.monthlyOn(domListPhrase(dom, loc), timeList);
  }

  if (days && days.length > 0 && days.length < 7) {
    if (days.join(",") === "1,2,3,4,5") return D.weekdaysAt(timeList);
    if (days.join(",") === "0,6") return D.weekendsAt(timeList);
    return D.everyDaysAt(loc.format.list(days.map((d) => loc.days.labels[d])), timeList);
  }
  return D.everyDayAt(timeList);
}
