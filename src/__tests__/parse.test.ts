import { describe, expect, it } from "vitest";
import { parseNaturalSchedule } from "../parse";

function cronOf(input: string): string | null {
  const result = parseNaturalSchedule(input);
  return result.ok ? result.cron : null;
}

describe("parseNaturalSchedule: grammar table", () => {
  const CASES: Array<[string, string]> = [
    // intervals
    ["every 15 minutes", "*/15 * * * *"],
    ["every 5 mins", "*/5 * * * *"],
    ["every other hour", "0 */2 * * *"],
    ["every 2 hours", "0 */2 * * *"],
    ["every 2 hours at minute 15", "15 */2 * * *"],
    ["every minute", "* * * * *"],
    ["every 15 minutes on weekdays", "*/15 * * * 1-5"],
    ["hourly", "0 * * * *"],
    ["every hour at minute 30", "30 * * * *"],
    // daily
    ["every day at 9am", "0 9 * * *"],
    ["daily at 9:30am", "30 9 * * *"],
    ["everyday at noon", "0 12 * * *"],
    ["at 9am and 5pm", "0 9,17 * * *"],
    ["every day at 9:00 AM and 5:00 PM", "0 9,17 * * *"],
    ["midnight", "0 0 * * *"],
    // days of week
    ["mondays at 9am", "0 9 * * 1"],
    ["every monday at 9am", "0 9 * * 1"],
    ["mondays and thursdays at 9am", "0 9 * * 1,4"],
    ["monday, wednesday and friday at 8am", "0 8 * * 1,3,5"],
    ["weekdays at noon", "0 12 * * 1-5"],
    ["weekends at 10am", "0 10 * * 0,6"],
    ["monday through friday at 8:30am", "30 8 * * 1-5"],
    ["mon-fri at 8am", "0 8 * * 1-5"],
    ["tuesday to thursday at 4pm", "0 16 * * 2,3,4"],
    ["fridays at 21:00", "0 21 * * 5"],
    ["fridays at 2100", "0 21 * * 5"],
    ["saturday through monday at 7am", "0 7 * * 0,1,6"],
    // typos and shortenings
    ["thurs at 4pm", "0 16 * * 4"],
    ["thrs at 4pm", "0 16 * * 4"],
    ["th at 4pm", "0 16 * * 4"],
    ["thurday at 9am", "0 9 * * 4"],
    ["tuseday at 9am", "0 9 * * 2"],
    ["wensday at 9am", "0 9 * * 3"],
    ["evrey 15 minuts", "*/15 * * * *"],
    ["weekdys at noon", "0 12 * * 1-5"],
    // month
    ["first of the month at 8am", "0 8 1 * *"],
    ["beginning of the month at 8am", "0 8 1 * *"],
    ["1st of the month at 8am", "0 8 1 * *"],
    ["monthly on the 15th at 9am", "0 9 15 * *"],
    ["on the 23rd at 5pm", "0 17 23 * *"],
    ["monthly", "0 9 1 * *"],
    ["1st and 15th at 9am", "0 9 1,15 * *"],
    // dom/dow OR: explicit "or" is the only way to set both day fields
    ["1st and 15th of the month, or fridays, at 4:30am", "30 4 1,15 * 5"],
    ["on the 1st or mondays at 9am", "0 9 1 * 1"],
    // bare/assumed
    ["mondays at 9", "0 9 * * 1"],
    ["9am", "0 9 * * *"],
    ["weekly", "0 9 * * 1"],
    // cron passthrough
    ["0 12 * * 1-5", "0 12 * * 1-5"],
    ["@daily", "0 0 * * *"],
  ];

  it.each(CASES)("%s → %s", (input, expected) => {
    expect(cronOf(input)).toEqual(expected);
  });
});

describe("parseNaturalSchedule: assumptions", () => {
  it("surfaces assumed AM with a PM flip", () => {
    const result = parseNaturalSchedule("mondays at 9");
    expect(result.ok).toEqual(true);
    if (!result.ok) return;
    expect(result.assumptions).toEqual([
      {
        text: 'Read "9" as 9:00 AM.',
        alternative: { label: "Did you mean 9:00 PM?", input: "mondays at 9pm" },
      },
    ]);
  });

  it("surfaces the default time", () => {
    const result = parseNaturalSchedule("mondays");
    expect(result.ok).toEqual(true);
    if (!result.ok) return;
    expect(result.cron).toEqual("0 9 * * 1");
    expect(result.assumptions).toEqual([{ text: "No time given, so this defaults to 9:00 AM." }]);
  });

  it("surfaces short-month skipping for day 29-31", () => {
    const result = parseNaturalSchedule("monthly on the 31st at 9am");
    expect(result.ok).toEqual(true);
    if (!result.ok) return;
    expect(result.assumptions).toEqual([{ text: "Months without a day 31 are skipped." }]);
  });

  it("flip alternatives stay valid when the hour digits appear in other tokens", () => {
    for (const input of ["at 19 and 9", "on the 19th at 9"]) {
      const result = parseNaturalSchedule(input);
      expect(result.ok).toEqual(true);
      if (!result.ok) continue;
      for (const assumption of result.assumptions) {
        if (!assumption.alternative) continue;
        expect(parseNaturalSchedule(assumption.alternative.input).ok).toEqual(true);
      }
    }
  });

  it("surfaces default day for bare weekly and monthly", () => {
    const weekly = parseNaturalSchedule("weekly at 9am");
    expect(weekly.ok && weekly.assumptions[0]?.text).toEqual(
      "No day given, so this defaults to Monday.",
    );
    const monthly = parseNaturalSchedule("monthly at 9am");
    expect(monthly.ok && monthly.assumptions[0]?.text).toEqual(
      "No day given, so this defaults to the 1st of the month.",
    );
  });
});

describe("parseNaturalSchedule: errors", () => {
  it("empty input", () => {
    expect(parseNaturalSchedule("  ")).toEqual({
      ok: false,
      reason: "empty",
      hint: "Describe a schedule, like 'weekdays at noon'.",
      suggestions: ["mondays at 9am", "weekdays at noon"],
    });
  });

  it("ambiguous single letters are rejected, not guessed", () => {
    const result = parseNaturalSchedule("t at 4pm");
    expect(result.ok).toEqual(false);
    if (result.ok) return;
    expect(result.reason).toEqual("unrecognized");
    expect(result.hint).toContain('"t"');
  });

  it("last day of month gets the honest unsupported answer", () => {
    const result = parseNaturalSchedule("last day of the month at 9am");
    expect(result).toEqual({
      ok: false,
      reason: "unsupported",
      hint: "Standard cron can't express the last day of the month. The usual workaround is a fixed day every month has, like the 28th.",
      suggestions: ["on the 28th at 9am"],
    });
    expect(parseNaturalSchedule("end of the month").ok).toEqual(false);
  });

  it("rejects impossible combinations with specific hints", () => {
    const mixed = parseNaturalSchedule("mondays on the 15th at 9am");
    expect(!mixed.ok && mixed.reason).toEqual("unsupported");
    const interval = parseNaturalSchedule("every 90 minutes");
    expect(!interval.ok && interval.reason).toEqual("unsupported");
    const minutes = parseNaturalSchedule("at 9:15am and 5:30pm");
    expect(!minutes.ok && minutes.reason).toEqual("unsupported");
    const intervalTime = parseNaturalSchedule("every 15 minutes at 9am");
    expect(!intervalTime.ok && intervalTime.reason).toEqual("unsupported");
  });

  it("unknown words are named in the hint", () => {
    const result = parseNaturalSchedule("lunchtime on mondays");
    expect(result.ok).toEqual(false);
    if (result.ok) return;
    expect(result).toEqual({
      ok: false,
      reason: "unrecognized",
      hint: "Couldn't understand \"lunchtime\". Try a day plus a time, like 'fridays at 2pm'.",
      suggestions: ["mondays at 9am", "weekdays at noon"],
    });
  });
});
