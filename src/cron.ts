/**
 * 5-field cron validation by regex, plus @special forms.
 * Single source of truth: apps/core's Zod schema imports isCronExpression
 * from here (regex is intentionally permissive and portable; semantic
 * next-run computation lives in getNextRuns below).
 */
const CRON_FIELD = String.raw`(\*|[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*)(\/[0-9]+)?`;
export const CRON_REGEX = new RegExp(`^${CRON_FIELD}( ${CRON_FIELD}){4}$`);
export const CRON_SPECIAL = /^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/;

export function isCronExpression(input: string): boolean {
  const trimmed = input.trim();
  return CRON_REGEX.test(trimmed) || CRON_SPECIAL.test(trimmed);
}

/** Collapse repeated whitespace between fields. */
export function normalizeCronSpacing(cron: string): string {
  return cron.trim().split(/\s+/).join(" ");
}

export const SPECIAL_EQUIVALENTS: Record<string, string> = {
  "@annually": "0 0 1 1 *",
  "@daily": "0 0 * * *",
  "@hourly": "0 * * * *",
  "@midnight": "0 0 * * *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@yearly": "0 0 1 1 *",
};

// --- Field parsing -------------------------------------------------------

/**
 * Expand one cron field into the set of numbers it permits within [min, max].
 * Handles wildcards, single values, ranges, steps (on a wildcard, a range, or
 * a bare start), and comma-separated lists. Out-of-range pieces are dropped
 * silently — the CRON_REGEX gate upstream guarantees the shape.
 */
function expandField(value: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of value.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) continue;
    const [, head, stepStr] = m;

    let lo: number;
    let hi: number;
    if (head === "*") {
      [lo, hi] = [min, max];
    } else if (head.includes("-")) {
      [lo, hi] = head.split("-").map(Number);
    } else {
      lo = Number(head);
      hi = stepStr ? max : lo; // a bare "a/s" runs from a to the field maximum
    }

    const step = stepStr ? Number(stepStr) : 1;
    if (step < 1) continue;
    for (let n = lo; n <= hi; n += step) {
      if (n >= min && n <= max) out.add(n);
    }
  }
  return out;
}

/** Day-of-week field, normalized to 0-6 (cron allows 7 for Sunday). */
function expandDow(value: string): Set<number> {
  const raw = expandField(value, 0, 7);
  if (raw.has(7)) {
    raw.add(0);
    raw.delete(7);
  }
  return raw;
}

/** A field is "restricted" only when it is neither "*" nor a step starting with "*". */
function isRestricted(value: string): boolean {
  return value !== "*" && !value.startsWith("*");
}

interface CronSchedule {
  minutes: number[]; // ascending
  hours: number[]; // ascending
  doms: Set<number>;
  months: Set<number>;
  dows: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

/** Parse a cron expression (or @special) into matchable sets, or null if invalid. */
function parseSchedule(cronExpression: string): CronSchedule | null {
  const resolved =
    SPECIAL_EQUIVALENTS[cronExpression.trim()] ?? normalizeCronSpacing(cronExpression);
  if (!CRON_REGEX.test(resolved)) return null;
  const [minF, hourF, domF, monF, dowF] = resolved.split(" ");

  const ascending = (set: Set<number>) => [...set].sort((a, b) => a - b);
  const minutes = ascending(expandField(minF, 0, 59));
  const hours = ascending(expandField(hourF, 0, 23));
  const doms = expandField(domF, 1, 31);
  const months = expandField(monF, 1, 12);
  const dows = expandDow(dowF);

  // A field can come back empty only from a degenerate step (e.g. "*/0") or an
  // entirely out-of-range value (e.g. day 32) — either makes the cron unrunnable.
  if (!minutes.length || !hours.length || !doms.size || !months.size || !dows.size) return null;

  return {
    minutes,
    hours,
    doms,
    months,
    dows,
    domRestricted: isRestricted(domF),
    dowRestricted: isRestricted(dowF),
  };
}

/**
 * True when the cron (or @special) is semantically runnable: every field
 * expands to at least one in-range value. CRON_REGEX alone is shape-only and
 * accepts e.g. "60 99 * * *", which would never fire.
 */
export function isRunnableCron(cronExpression: string): boolean {
  return parseSchedule(cronExpression) !== null;
}

/**
 * The dom/dow OR trap: when BOTH day fields are restricted, cron fires when
 * EITHER matches; otherwise the restricted one (if any) decides.
 */
function dayMatches(day: number, dow: number, s: CronSchedule): boolean {
  if (s.domRestricted && s.dowRestricted) return s.doms.has(day) || s.dows.has(dow);
  if (s.domRestricted) return s.doms.has(day);
  if (s.dowRestricted) return s.dows.has(dow);
  return true;
}

// --- Timezone math (no runtime deps; backed by the platform's Intl tz db) ---

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Constructing an Intl.DateTimeFormat is expensive; the next-run search calls
// wallParts many times per query, so cache one formatter per zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let dtf = formatterCache.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, dtf);
  }
  return dtf;
}

/** Wall-clock parts of an instant in a timezone. */
function wallParts(instantMs: number, tz: string): WallClock {
  const p: Record<string, number> = {};
  for (const { type, value } of formatterFor(tz).formatToParts(instantMs)) {
    if (type !== "literal") p[type] = Number(value);
  }
  if (p.hour === 24) p.hour = 0; // some engines render midnight as hour "24"
  return p as unknown as WallClock;
}

/** Offset (ms) between UTC and the timezone at a given instant. */
function offsetMs(instantMs: number, tz: string): number {
  const p = wallParts(instantMs, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instantMs;
}

const HOUR_MS = 3_600_000;

/** Step a calendar date forward by one day, rolling over months/years. */
function nextDay(year: number, month: number, day: number): [number, number, number] {
  const dt = new Date(Date.UTC(year, month - 1, day + 1));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

/**
 * Every run instant (UTC ms, ascending) for one local calendar day.
 *
 * We sample the UTC offset well before and well after the day. Off a transition
 * (the common case) the offset is constant, so each run is plain arithmetic. On
 * a transition day we build each candidate at BOTH offsets and keep the ones
 * that round-trip to the intended wall time: a fall-back-repeated hour yields
 * two instants (both fire), a spring-forward gap time yields none (it is
 * skipped), and an ordinary run yields exactly one.
 */
function dayInstants(
  year: number,
  month: number,
  day: number,
  s: CronSchedule,
  tz: string,
): number[] {
  const dayUtc = Date.UTC(year, month - 1, day);
  const offBefore = offsetMs(dayUtc - 12 * HOUR_MS, tz);
  const offAfter = offsetMs(dayUtc + 36 * HOUR_MS, tz);
  const wallUtc = (hour: number, minute: number) => Date.UTC(year, month - 1, day, hour, minute);

  if (offBefore === offAfter) {
    const out: number[] = [];
    for (const hour of s.hours) {
      for (const minute of s.minutes) out.push(wallUtc(hour, minute) - offBefore);
    }
    return out; // already ascending: (hour, minute) ascend and the offset is fixed
  }

  const out: number[] = [];
  for (const hour of s.hours) {
    for (const minute of s.minutes) {
      const guess = wallUtc(hour, minute);
      for (const off of [offBefore, offAfter]) {
        const t = guess - off;
        const w = wallParts(t, tz);
        const valid =
          w.year === year &&
          w.month === month &&
          w.day === day &&
          w.hour === hour &&
          w.minute === minute;
        if (valid) out.push(t);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

// ~8 years of days: enough to reach any reachable date (e.g. Feb 29), bounded
// so an impossible spec (Feb 31) terminates with [] instead of spinning.
const MAX_DAYS_AHEAD = 366 * 8;

/**
 * Next N run instants for a cron expression in a timezone. [] on parse error
 * or invalid timezone. Owns the computation via Intl — no runtime deps. DST is
 * handled per day (see dayInstants): fall-back hours fire twice, spring-forward
 * gap times are skipped, ordinary runs fire once.
 */
export function getNextRuns(cronExpression: string, timezone: string, count = 3): Date[] {
  try {
    const schedule = parseSchedule(cronExpression);
    if (!schedule) return [];
    const tz = timezone || "UTC";

    const nowMs = Date.now();
    const today = wallParts(nowMs, tz);
    let [year, month, day] = [today.year, today.month, today.day];

    const runs: Date[] = [];
    for (let i = 0; i < MAX_DAYS_AHEAD && runs.length < count; i++) {
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (schedule.months.has(month) && dayMatches(day, dow, schedule)) {
        for (const t of dayInstants(year, month, day, schedule, tz)) {
          // Strictly future, and strictly after the last run — the latter only
          // matters at the fall-back boundary, where instants could otherwise tie.
          if (t <= nowMs || (runs.length > 0 && t <= runs[runs.length - 1].getTime())) continue;
          runs.push(new Date(t));
          if (runs.length >= count) break;
        }
      }
      [year, month, day] = nextDay(year, month, day);
    }
    return runs;
  } catch {
    return [];
  }
}
