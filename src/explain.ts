import { CRON_REGEX, isRunnableCron, SPECIAL_EQUIVALENTS } from "./cron.js";
import { DAY_LABELS } from "./days.js";
import { domPhrase } from "./describe.js";

export interface CronFieldExplanation {
  field: string;
  value: string;
  meaning: string;
}

const FIELD_NAMES = ["Minute", "Hour", "Day of month", "Month", "Day of week"] as const;

const MONTH_LABELS = [
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
];

const EVERY: Record<number, string> = {
  0: "every minute",
  1: "every hour",
  2: "every day of the month",
  3: "every month",
  4: "every day of the week",
};

const STEP_UNITS: Record<number, string> = {
  0: "minutes",
  1: "hours",
  2: "days",
  3: "months",
  4: "days of the week",
};

/** Inclusive upper bound per field — a bare step ("5/15") runs from its start to this. */
const FIELD_MAX = [59, 23, 31, 12, 7] as const;

function label(index: number, n: number): string {
  if (index === 4) return DAY_LABELS[n === 7 ? 0 : n] ?? String(n);
  if (index === 3) return MONTH_LABELS[n - 1] ?? String(n);
  return String(n);
}

/** A field is "restricted" only when it is neither "*" nor a step starting with "*". */
function isRestricted(value: string): boolean {
  return value !== "*" && !value.startsWith("*");
}

function explainField(index: number, value: string): string {
  if (value === "*") return EVERY[index];
  const step = value.match(/^\*\/(\d+)$/);
  if (step) return `every ${step[1]} ${STEP_UNITS[index]}`;
  if (index === 2 && !value.includes("/")) return `on ${domPhrase(value)}`;
  const parts = value.split(",").map((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) return `${label(index, Number(range[1]))} through ${label(index, Number(range[2]))}`;
    const stepped = part.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (stepped) {
      return `every ${stepped[3]} ${STEP_UNITS[index]} from ${label(index, Number(stepped[1]))} through ${label(index, Number(stepped[2]))}`;
    }
    // A bare step ("5/15") runs from its start to the field maximum.
    const bareStep = part.match(/^(\d+)\/(\d+)$/);
    if (bareStep) {
      return `every ${bareStep[2]} ${STEP_UNITS[index]} from ${label(index, Number(bareStep[1]))} through ${label(index, FIELD_MAX[index])}`;
    }
    return label(index, Number(part));
  });
  const joined = parts.join(", ");
  if (index === 4 || index === 3) return joined;
  // A lone step phrase ("every 15 minutes from 5 through 59") already names
  // its unit; prefixing "at minute" would double it up.
  if (value.includes("/") && !value.includes(",")) return joined;
  return `at ${FIELD_NAMES[index].toLowerCase()} ${joined}`;
}

/** Field-by-field anatomy for the explain mode table. Null for invalid crons. */
export function explainCronFields(cron: string): CronFieldExplanation[] | null {
  const resolved = SPECIAL_EQUIVALENTS[cron.trim()] ?? cron.trim();
  if (!CRON_REGEX.test(resolved)) return null;
  if (!isRunnableCron(resolved)) return null; // shape-valid but a field never matches (e.g. "60 99 * * *")
  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) return null;
  const rows: CronFieldExplanation[] = parts.map((value, i) => ({
    field: FIELD_NAMES[i],
    value,
    meaning: explainField(i, value),
  }));

  // The dom/dow OR trap: when both day fields are restricted, cron fires when
  // EITHER matches, not both. Surface it as an explicit extra row so the table
  // reads the way the crontab(5) man page describes the behavior.
  const [, , dom, , dow] = parts;
  if (isRestricted(dom) && isRestricted(dow)) {
    // A stepped dom ("5/10") has no ordinal phrase; reuse its field meaning.
    const domMeaning = dom.includes("/") ? explainField(2, dom) : `on ${domPhrase(dom)}`;
    rows.push({
      field: "Day rule",
      value: "either",
      meaning: `Both day fields are set, so cron runs when either matches: ${domMeaning}, or on ${explainField(4, dow)}.`,
    });
  }

  return rows;
}
