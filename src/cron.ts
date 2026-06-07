import { CronExpressionParser } from "cron-parser";

/**
 * 5-field cron validation by regex, plus @special forms.
 * Single source of truth: apps/core's Zod schema imports isCronExpression
 * from here (regex is intentionally permissive and portable; semantic
 * next-run parsing uses cron-parser separately).
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

/**
 * Next N run dates for a cron expression in a timezone. [] on parse error.
 */
export function getNextRuns(cronExpression: string, timezone: string, count = 3): Date[] {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: timezone || "UTC",
    });
    const runs: Date[] = [];
    for (let i = 0; i < count; i++) {
      runs.push(interval.next().toDate());
    }
    return runs;
  } catch {
    return [];
  }
}
