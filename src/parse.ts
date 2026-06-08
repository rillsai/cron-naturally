import { isCronExpression, normalizeCronSpacing, SPECIAL_EQUIVALENTS } from "./cron.js";
import { fuzzyMatch, matchDay } from "./days.js";
import { describeCron } from "./describe.js";
import { EXAMPLE_PHRASES } from "./examples.js";
import { formatTime12, parseTimeToken, type ParsedTime } from "./time.js";
import type { Assumption, ParseError, ParseResult } from "./types.js";

const FILLERS = new Set(["a", "an", "and", "at", "each", "in", "of", "on", "the"]);

const KEYWORDS = [
  "beginning",
  "daily",
  "day",
  "end",
  "every",
  "first",
  "hour",
  "hourly",
  "last",
  "midnight",
  "minute",
  "month",
  "monthly",
  "noon",
  "other",
  "start",
  "through",
  "week",
  "weekday",
  "weekend",
  "weekly",
] as const;

/** Plural/synonym aliases applied before fuzzy matching. */
const ALIASES: Record<string, string> = {
  beginning: "first",
  days: "day",
  hours: "hour",
  hr: "hour",
  hrs: "hour",
  min: "minute",
  mins: "minute",
  minutes: "minute",
  months: "month",
  start: "first",
  to: "through",
  until: "through",
  weekdays: "weekday",
  weekdys: "weekday",
  weekends: "weekend",
  weeks: "week",
};

const KEYWORD_LIST = [...KEYWORDS];
const SUNDAY_FIRST_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const FUZZY_CANDIDATES = [...KEYWORD_LIST, ...SUNDAY_FIRST_DAYS];

function tokenize(input: string): string[] {
  const lowered = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,!?;"'()]/g, " ");
  // "mon-fri" → "mon through fri" (letters only; leaves 21:00 and 9-5 alone)
  const ranged = lowered.replace(/([a-z]+)\s*-\s*([a-z]+)/g, "$1 through $2");
  const tokens = ranged
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => (t === "everyday" ? ["every", "day"] : [t]));
  // merge "<time> am/pm" pairs into one token
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1];
    if ((next === "am" || next === "pm") && /^\d{1,2}(:\d{2})?$/.test(tokens[i])) {
      merged.push(tokens[i] + next);
      i++;
    } else {
      merged.push(tokens[i]);
    }
  }
  return merged;
}

/** Canonical form of a word token: alias → exact keyword/day → fuzzy → original. */
function canonical(token: string): string {
  if (/\d/.test(token)) return token;
  const aliased = ALIASES[token] ?? token;
  if ((KEYWORDS as readonly string[]).includes(aliased)) return aliased;
  if (SUNDAY_FIRST_DAYS.includes(aliased)) return aliased;
  return fuzzyMatch(aliased, FUZZY_CANDIDATES) ?? token;
}

function fail(reason: ParseError["reason"], hint: string, suggestions?: string[]): ParseError {
  return {
    ok: false,
    reason,
    hint,
    suggestions: suggestions ?? [EXAMPLE_PHRASES[1], EXAMPLE_PHRASES[2]],
  };
}

interface TimedToken extends ParsedTime {
  raw: string;
}

export function parseNaturalSchedule(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fail("empty", "Describe a schedule, like 'weekdays at noon'.");
  }

  // Pasted cron: pass through (explain mode for consumers).
  if (isCronExpression(trimmed)) {
    const cron = SPECIAL_EQUIVALENTS[trimmed] ?? normalizeCronSpacing(trimmed);
    return {
      ok: true,
      cron,
      description: describeCron(cron) ?? `Custom schedule (${cron})`,
      assumptions: [],
    };
  }

  const tokens = tokenize(trimmed);
  const days = new Set<number>();
  const times: TimedToken[] = [];
  const assumptions: Assumption[] = [];
  const doms: number[] = [];
  let sawOr = false;
  let weekdays = false;
  let weekends = false;
  let freq: "minutely" | "hourly" | "daily" | "weekly" | "monthly" | null = null;
  let intervalUnit: "minute" | "hour" | null = null;
  let intervalN: number | null = null;
  let minuteOf: number | null = null;
  let sawLastOrEnd = false;
  let monthly = false;

  for (let i = 0; i < tokens.length; i++) {
    const word = canonical(tokens[i]);
    // Explicit "or" links a day-of-month clause to a day-of-week clause, the one
    // case where cron legitimately sets both day fields (it fires on EITHER).
    if (tokens[i] === "or") {
      sawOr = true;
      continue;
    }
    if (FILLERS.has(word)) continue;

    if (word === "every") {
      const next = canonical(tokens[i + 1] ?? "");
      if (next === "other") {
        const unit = canonical(tokens[i + 2] ?? "");
        if (unit === "minute" || unit === "hour") {
          intervalUnit = unit;
          intervalN = 2;
          i += 2;
          continue;
        }
      }
      if (/^\d+$/.test(tokens[i + 1] ?? "")) {
        const unit = canonical(tokens[i + 2] ?? "");
        if (unit === "minute" || unit === "hour") {
          intervalUnit = unit;
          intervalN = Number(tokens[i + 1]);
          i += 2;
          continue;
        }
        if (unit === "day" || unit === "week" || unit === "month") {
          return fail(
            "unsupported",
            `Cron can't express "every N ${unit}s" from an arbitrary start. Use specific days instead, like 'mondays and thursdays'.`,
          );
        }
      }
      if (next === "minute") {
        freq = "minutely";
        i += 1;
        continue;
      }
      if (next === "hour") {
        freq = "hourly";
        i += 1;
        continue;
      }
      if (next === "day") {
        freq = "daily";
        i += 1;
        continue;
      }
      if (next === "week") {
        freq = "weekly";
        i += 1;
        continue;
      }
      if (next === "month") {
        freq = "monthly";
        monthly = true;
        i += 1;
        continue;
      }
      continue; // "every monday": day token handled on the next iteration
    }

    if (word === "minute" && /^\d{1,2}$/.test(tokens[i + 1] ?? "")) {
      minuteOf = Number(tokens[i + 1]);
      if (minuteOf > 59) return fail("unsupported", "Minutes run from 0 to 59.");
      i += 1;
      continue;
    }

    if (word === "weekday") {
      weekdays = true;
      continue;
    }
    if (word === "weekend") {
      weekends = true;
      continue;
    }
    if (word === "daily") {
      freq = "daily";
      continue;
    }
    if (word === "hourly") {
      freq = "hourly";
      continue;
    }
    if (word === "weekly") {
      freq = "weekly";
      continue;
    }
    if (word === "monthly") {
      monthly = true;
      continue;
    }
    if (word === "last" || word === "end") {
      sawLastOrEnd = true;
      continue;
    }
    if (word === "first") {
      doms.push(1);
      monthly = true;
      continue;
    }
    if (word === "month") {
      monthly = true;
      continue;
    }
    if (word === "day" || word === "week") {
      continue; // "last day of...", "day of the week" connectors
    }

    const ordinalMatch = tokens[i].match(/^(\d{1,2})(st|nd|rd|th)$/);
    if (ordinalMatch) {
      const d = Number(ordinalMatch[1]);
      if (d < 1 || d > 31) {
        return fail("unsupported", "Days of the month run from the 1st to the 31st.");
      }
      doms.push(d);
      monthly = true;
      continue;
    }

    const day = matchDay(word) ?? matchDay(tokens[i]);
    if (day !== null) {
      days.add(day);
      if (canonical(tokens[i + 1] ?? "") === "through") {
        const endToken = tokens[i + 2] ?? "";
        const endDay = matchDay(canonical(endToken)) ?? matchDay(endToken);
        if (endDay === null) {
          return fail(
            "unrecognized",
            `Couldn't understand "${endToken}". Try a day plus a time, like 'fridays at 2pm'.`,
          );
        }
        for (let d = day; d !== endDay; d = (d + 1) % 7) days.add(d);
        days.add(endDay);
        i += 2;
      }
      continue;
    }

    const time = parseTimeToken(tokens[i]);
    if (time) {
      times.push({ ...time, raw: tokens[i] });
      continue;
    }

    return fail(
      "unrecognized",
      `Couldn't understand "${tokens[i]}". Try a day plus a time, like 'fridays at 2pm'.`,
    );
  }

  if (sawLastOrEnd) {
    return fail(
      "unsupported",
      "Standard cron can't express the last day of the month. The usual workaround is a fixed day every month has, like the 28th.",
      ["on the 28th at 9am"],
    );
  }

  // Day-of-week field — canonical weekday block is "1-5": when the final
  // merged set (named days + weekday/weekend flags) is exactly {1,2,3,4,5},
  // emit "1-5", not "1,2,3,4,5".
  const dowField = ((): string | null => {
    const set = new Set(days);
    if (weekdays) for (const d of [1, 2, 3, 4, 5]) set.add(d);
    if (weekends) {
      set.add(0);
      set.add(6);
    }
    if (set.size === 0) return null;
    if (set.size === 7) return "*";
    const sorted = [...set].sort((a, b) => a - b);
    if (sorted.join(",") === "1,2,3,4,5") return "1-5";
    return sorted.join(",");
  })();

  const okResult = (cron: string): ParseResult => {
    const description = describeCron(cron);
    if (!description) {
      // Should be unreachable: the assembler only emits describable shapes.
      return fail(
        "unrecognized",
        "Couldn't build that schedule. Try a day plus a time, like 'fridays at 2pm'.",
      );
    }
    return { ok: true, cron, description, assumptions };
  };

  type ResolvedTime = { minute: number; hours: number[] };

  const resolveTime = (): ResolvedTime | ParseError => {
    if (times.length === 0) {
      assumptions.push({ text: "No time given, so this defaults to 9:00 AM." });
      return { minute: 0, hours: [9] };
    }
    const minute = times[0].minute;
    if (times.some((t) => t.minute !== minute)) {
      return fail(
        "unsupported",
        "Multiple times must share the same minute (like 9:00 and 17:00) to fit one cron expression.",
      );
    }
    for (const t of times) {
      if (!t.assumedMeridiem) continue;
      const flippedHour = t.hour === 12 ? 0 : t.hour + 12;
      const flippedToken =
        t.hour === 12
          ? "midnight"
          : t.minute > 0
            ? `${t.hour}:${String(t.minute).padStart(2, "0")}pm`
            : `${t.hour}pm`;
      assumptions.push({
        text: `Read "${t.raw}" as ${formatTime12(t.hour, t.minute)}.`,
        alternative: {
          label: `Did you mean ${formatTime12(flippedHour, t.minute)}?`,
          input: trimmed.toLowerCase().replace(new RegExp(`(?<!\\d)${t.raw}(?!\\d)`), flippedToken),
        },
      });
    }
    const hours = [...new Set(times.map((t) => t.hour))].sort((a, b) => a - b);
    return { minute, hours };
  };

  // Assembly, most-specific first
  if (intervalUnit === "minute") {
    if (intervalN === null || intervalN < 1 || intervalN > 59) {
      return fail(
        "unsupported",
        "Minute intervals must be between 1 and 59. For longer gaps, use hours: 'every 2 hours'.",
      );
    }
    if (times.length > 0) {
      return fail(
        "unsupported",
        "An interval like 'every 15 minutes' can't also have a time of day. Use one or the other.",
      );
    }
    if (doms.length > 0 || monthly) {
      return fail(
        "unsupported",
        "Minute intervals can't be limited to a day of the month. Use days of the week instead.",
      );
    }
    return okResult(`*/${intervalN} * * * ${dowField ?? "*"}`);
  }

  if (intervalUnit === "hour") {
    if (intervalN === null || intervalN < 1 || intervalN > 23) {
      return fail("unsupported", "Hour intervals must be between 1 and 23.");
    }
    if (times.length > 0) {
      return fail(
        "unsupported",
        "An interval like 'every 2 hours' can't also have a time of day. Use 'at minute 30' to pick when within the hour.",
      );
    }
    if (doms.length > 0 || monthly) {
      return fail(
        "unsupported",
        "Hour intervals can't be limited to a day of the month. Use days of the week instead.",
      );
    }
    return okResult(`${minuteOf ?? 0} */${intervalN} * * ${dowField ?? "*"}`);
  }

  if (freq === "minutely") {
    if (times.length > 0 || doms.length > 0 || monthly) {
      return fail(
        "unsupported",
        "'Every minute' can't combine with a time of day or day of the month.",
      );
    }
    return okResult(`* * * * ${dowField ?? "*"}`);
  }

  if (freq === "hourly") {
    if (times.length > 0) {
      return fail(
        "unsupported",
        "'Hourly' can't take a time of day. Use 'at minute 30' to pick when within the hour.",
      );
    }
    if (doms.length > 0 || monthly) {
      return fail(
        "unsupported",
        "'Hourly' can't be limited to a day of the month. Use days of the week instead.",
      );
    }
    return okResult(`${minuteOf ?? 0} * * * ${dowField ?? "*"}`);
  }

  if (doms.length > 0 || monthly) {
    // Cron OR-combines the two day fields, so both may be set only when the user
    // explicitly said "or" (e.g. "1st and 15th, or fridays"). An implicit pairing
    // ("mondays on the 15th") means AND, which cron can't express — reject it.
    if (dowField && !sawOr) {
      return fail("unsupported", "Use either days of the week or a day of the month, not both.");
    }
    const days = doms.length > 0 ? doms : [1];
    if (doms.length === 0) {
      assumptions.push({ text: "No day given, so this defaults to the 1st of the month." });
    }
    for (const day of [...new Set(days)].sort((a, b) => a - b)) {
      if (day >= 29) {
        assumptions.push({ text: `Months without a day ${day} are skipped.` });
      }
    }
    const time = resolveTime();
    if ("ok" in time) return time;
    const domField = [...new Set(days)].sort((a, b) => a - b).join(",");
    const dowPart = sawOr && dowField ? dowField : "*";
    return okResult(`${time.minute} ${time.hours.join(",")} ${domField} * ${dowPart}`);
  }

  if (dowField || freq === "daily" || freq === "weekly" || times.length > 0) {
    let field = dowField;
    if (freq === "weekly" && !field) {
      field = "1";
      assumptions.push({ text: "No day given, so this defaults to Monday." });
    }
    const time = resolveTime();
    if ("ok" in time) return time;
    return okResult(`${time.minute} ${time.hours.join(",")} * * ${field ?? "*"}`);
  }

  return fail(
    "unrecognized",
    "Couldn't read that yet. Try a day plus a time, like 'fridays at 2pm'.",
  );
}
