import { CRON_REGEX, SPECIAL_EQUIVALENTS } from "./cron";
import { DAY_LABELS } from "./days";

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

function label(index: number, n: number): string {
  if (index === 4) return DAY_LABELS[n === 7 ? 0 : n] ?? String(n);
  if (index === 3) return MONTH_LABELS[n - 1] ?? String(n);
  return String(n);
}

function explainField(index: number, value: string): string {
  if (value === "*") return EVERY[index];
  const step = value.match(/^\*\/(\d+)$/);
  if (step) return `every ${step[1]} ${STEP_UNITS[index]}`;
  const parts = value.split(",").map((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) return `${label(index, Number(range[1]))} through ${label(index, Number(range[2]))}`;
    const stepped = part.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (stepped) {
      return `every ${stepped[3]} ${STEP_UNITS[index]} from ${label(index, Number(stepped[1]))} through ${label(index, Number(stepped[2]))}`;
    }
    return label(index, Number(part));
  });
  const joined = parts.join(", ");
  if (index === 4 || index === 3) return joined;
  return `at ${FIELD_NAMES[index].toLowerCase()} ${joined}`;
}

/** Field-by-field anatomy for the explain mode table. Null for invalid crons. */
export function explainCronFields(cron: string): CronFieldExplanation[] | null {
  const resolved = SPECIAL_EQUIVALENTS[cron.trim()] ?? cron.trim();
  if (!CRON_REGEX.test(resolved)) return null;
  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) return null;
  return parts.map((value, i) => ({
    field: FIELD_NAMES[i],
    value,
    meaning: explainField(i, value),
  }));
}
