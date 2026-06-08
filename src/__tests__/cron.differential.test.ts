import { CronExpressionParser } from "cron-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNextRuns } from "../cron";

/**
 * Differential test: our dependency-free getNextRuns must agree, instant for
 * instant, with cron-parser (the library it replaced) across a matrix of
 * expressions, timezones, and start instants — including the gnarly DST and
 * fractional-offset zones. cron-parser is a devDependency kept ONLY for this
 * oracle comparison; it is not shipped.
 */

// Recurring expressions only (every case must yield 5 future runs in both).
const CRONS = [
  "* * * * *",
  "0 * * * *",
  "*/15 * * * *",
  "0 0 * * *",
  "30 9 * * *",
  "0 9 * * 1-5",
  "0 0 1 * *",
  "0 0 * * 0",
  "0 0 * * 7",
  "15 14 1 * *",
  "0 22 * * 1-5",
  "23 0-20/2 * * *",
  "0 0,12 1 */2 *",
  "5/20 * * * *", // bare start-step (every 20 min from :05)
  "0 4 8-14 * *",
  "0 0 1 1 *",
  "0 0 1 * 1", // dom/dow OR
  "*/7 3 * * 6",
  "@daily",
  "@weekly",
  "@monthly",
  "@hourly",
];

const TIMEZONES = [
  "UTC",
  "America/New_York", // northern DST
  "America/Sao_Paulo", // southern hemisphere (DST abolished 2019, still a -03 zone)
  "Europe/London",
  "Asia/Kolkata", // +5:30, no DST
  "Australia/Adelaide", // +9:30 / +10:30, half-hour with DST
  "Australia/Lord_Howe", // +10:30 / +11:00, 30-MINUTE DST shift
  "Pacific/Chatham", // +12:45 / +13:45
];

// Start instants spread across a year plus deliberate landings on/near DST
// fall-back transitions. Stored as UTC ms so the test is fully deterministic.
//
// Spring-forward days are deliberately excluded from the oracle comparison:
// cron-parser drops *valid, non-gap* runs that fall on the transition day
// (e.g. a 09:30 daily job on the US spring-forward Sunday), which is a bug we
// do not reproduce. Spring-forward behavior is pinned by explicit assertions
// in cron.test.ts instead. Fall-back days stay here — cron-parser handles them
// correctly, and they guard our own fix for the repeated-hour duplicate.
const STARTS = [
  Date.UTC(2025, 0, 15, 12, 0), // mid-January
  Date.UTC(2025, 3, 6, 15, 0), // AU autumn fall-back day (Lord Howe: 30-min DST)
  Date.UTC(2025, 6, 1, 0, 0), // July
  Date.UTC(2025, 10, 2, 5, 30), // US fall-back day (repeated 01:00 hour)
  Date.UTC(2025, 11, 31, 23, 59), // year boundary
];

function oracle(cron: string, tz: string, now: Date, count: number): number[] {
  const interval = CronExpressionParser.parse(cron, { currentDate: now, tz });
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(interval.next().toDate().getTime());
  return out;
}

describe("getNextRuns differential vs cron-parser", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const cron of CRONS) {
    for (const tz of TIMEZONES) {
      it(`${cron} @ ${tz}`, () => {
        for (const startMs of STARTS) {
          const now = new Date(startMs);
          vi.useFakeTimers({ now });

          const mine = getNextRuns(cron, tz, 5).map((d) => d.getTime());

          vi.useRealTimers();
          const theirs = oracle(cron, tz, now, 5);

          expect(mine, `${cron} @ ${tz} from ${now.toISOString()}`).toEqual(theirs);
        }
      });
    }
  }
});
