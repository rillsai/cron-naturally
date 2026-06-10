import type { Locale } from "./types.js";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function time(hour: number, minute: number): string {
  const meridiem = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/**
 * The English locale — the default bundle, and the reference implementation of
 * the `Locale` contract. Adding a language means cloning this shape; the type
 * checker then flags any piece left untranslated.
 */
export const en = {
  code: "en",

  lexicon: {
    fillers: new Set(["a", "an", "and", "at", "each", "in", "of", "on", "the"]),
    keywords: [
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
    ],
    aliases: {
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
    },
    andWord: "and",
    orWord: "or",
    rangeWord: "through",
    punctuation: /[.,!?;"'()]/g,
    compounds: { everyday: ["every", "day"] },
    singularize: (token) => (token.endsWith("s") ? token.slice(0, -1) : null),
    ordinalDay: (token) => {
      const m = token.match(/^(\d{1,2})(st|nd|rd|th)$/);
      return m ? Number(m[1]) : null;
    },
  },

  days: {
    labels: DAY_LABELS,
    fullNames: {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    },
    // Explicit, curated abbreviations. Single letters appear only where
    // unambiguous: m/w/f map; "t" (Tuesday/Thursday) and "s" (Saturday/Sunday)
    // are deliberately absent.
    abbreviations: {
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
    },
  },

  time: { noon: "noon", midnight: "midnight", am: "am", pm: "pm" },

  format: {
    time,
    ordinal,
    list,
    range: (from, to) => `${from} through ${to}`,
    flipToken: (hour, minute) => {
      const mm = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
      if (hour === 0) return minute > 0 ? `12${mm}am` : "midnight";
      if (hour < 12) return `${hour}${mm}am`;
      if (hour === 12) return minute > 0 ? `12${mm}pm` : "noon";
      return `${hour - 12}${mm}pm`;
    },
  },

  messages: {
    errors: {
      empty: "Describe a schedule, like 'weekdays at noon'.",
      unrecognized: (token) =>
        `Couldn't understand "${token}". Try a day plus a time, like 'fridays at 2pm'.`,
      everyNFromStart: (unit) =>
        `Cron can't express "every N ${unit}s" from an arbitrary start. Use specific days instead, like 'mondays and thursdays'.`,
      minuteOutOfRange: "Minutes run from 0 to 59.",
      domOutOfRange: "Days of the month run from the 1st to the 31st.",
      buildFailed: "Couldn't build that schedule. Try a day plus a time, like 'fridays at 2pm'.",
      lastDayUnsupported:
        "Standard cron can't express the last day of the month. The usual workaround is a fixed day every month has, like the 28th.",
      lastDaySuggestion: "on the 28th at 9am",
      minuteIntervalOutOfRange:
        "Minute intervals must be between 1 and 59. For longer gaps, use hours: 'every 2 hours'.",
      hourIntervalOutOfRange: "Hour intervals must be between 1 and 23.",
      intervalWithTime: (unit) =>
        unit === "minute"
          ? "An interval like 'every 15 minutes' can't also have a time of day. Use one or the other."
          : "An interval like 'every 2 hours' can't also have a time of day. Use 'at minute 30' to pick when within the hour.",
      intervalWithDom: (unit) =>
        unit === "minute"
          ? "Minute intervals can't be limited to a day of the month. Use days of the week instead."
          : "Hour intervals can't be limited to a day of the month. Use days of the week instead.",
      everyMinuteWithExtras: "'Every minute' can't combine with a time of day or day of the month.",
      hourlyWithTime:
        "'Hourly' can't take a time of day. Use 'at minute 30' to pick when within the hour.",
      hourlyWithDom:
        "'Hourly' can't be limited to a day of the month. Use days of the week instead.",
      bothDayFields: "Use either days of the week or a day of the month, not both.",
      cronNeverRuns:
        "That looks like a cron expression, but a field is out of range, so it would never run.",
      minuteOfOutsideHourly:
        "'At minute N' only works with an hourly schedule, like 'hourly at minute 30'. For a time of day, write it directly, like '9:30am'.",
      multipleMinutes:
        "Multiple times must share the same minute (like 9:00 and 17:00) to fit one cron expression.",
      unreadable: "Couldn't read that yet. Try a day plus a time, like 'fridays at 2pm'.",
    },

    assumptions: {
      defaultTime: "No time given, so this defaults to 9:00 AM.",
      defaultDayMonth: "No day given, so this defaults to the 1st of the month.",
      defaultDayWeek: "No day given, so this defaults to Monday.",
      shortMonthSkip: (day) => `Months without a day ${day} are skipped.`,
      assumedMeridiem: (raw, reading) => `Read "${raw}" as ${reading}.`,
      flipLabel: (alternative) => `Did you mean ${alternative}?`,
    },

    describe: {
      everyMinute: (dowSuffix) => `Every minute${dowSuffix}`,
      everyNMinutes: (n, dowSuffix) => `Every ${n} minutes${dowSuffix}`,
      atMinute: (minute) => ` at minute ${minute}`,
      everyHour: (atMinute, dowSuffix) => `Every hour${atMinute}${dowSuffix}`,
      everyNHours: (n, atMinute, dowSuffix) => `Every ${n} hours${atMinute}${dowSuffix}`,
      domOrDow: (domPhrase, dowSuffix, timeList) =>
        `On ${domPhrase}, or${dowSuffix}, at ${timeList}`,
      monthlyOn: (domList, timeList) => `Monthly on ${domList} at ${timeList}`,
      weekdaysAt: (timeList) => `Weekdays at ${timeList}`,
      weekendsAt: (timeList) => `Weekends at ${timeList}`,
      everyDaysAt: (dayList, timeList) => `Every ${dayList} at ${timeList}`,
      everyDayAt: (timeList) => `Every day at ${timeList}`,
      custom: (cron) => `Custom schedule (${cron})`,
      dowWeekdays: " on weekdays",
      dowWeekends: " on weekends",
      dowList: (joinedDays) => ` on ${joinedDays}`,
      domThe: (joined) => `the ${joined}`,
      domOfMonth: (joined) => `the ${joined} of the month`,
    },

    explain: {
      fieldNames: ["Minute", "Hour", "Day of month", "Month", "Day of week"],
      monthLabels: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      every: [
        "every minute",
        "every hour",
        "every day of the month",
        "every month",
        "every day of the week",
      ],
      stepUnits: ["minutes", "hours", "days", "months", "days of the week"],
      everyNUnits: (n, unit) => `every ${n} ${unit}`,
      onDom: (domPhrase) => `on ${domPhrase}`,
      everyNFromThrough: (step, unit, from, to) =>
        `every ${step} ${unit} from ${from} through ${to}`,
      atField: (field, joined) => `at ${field.toLowerCase()} ${joined}`,
      dayRuleField: "Day rule",
      dayRuleValue: "either",
      dayRuleMeaning: (domMeaning, dowMeaning) =>
        `Both day fields are set, so cron runs when either matches: ${domMeaning}, or on ${dowMeaning}.`,
    },

    examples: [
      "every 15 minutes",
      "mondays at 9am",
      "weekdays at noon",
      "1st of the month at 8am",
      "fridays at 21:00",
      "1st and 15th, or fridays, at 4:30am",
    ],
  },
} satisfies Locale;
