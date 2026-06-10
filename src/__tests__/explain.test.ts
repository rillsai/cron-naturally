import { describe, expect, it } from "vitest";
import { explainCronFields } from "../explain";

describe("explainCronFields", () => {
  it("explains each of the five fields", () => {
    expect(explainCronFields("0 12 * * 1-5")).toEqual([
      { field: "Minute", value: "0", meaning: "at minute 0" },
      { field: "Hour", value: "12", meaning: "at hour 12" },
      { field: "Day of month", value: "*", meaning: "every day of the month" },
      { field: "Month", value: "*", meaning: "every month" },
      { field: "Day of week", value: "1-5", meaning: "Monday through Friday" },
    ]);
  });

  it("explains steps and lists", () => {
    expect(explainCronFields("*/15 * * * 0,6")).toEqual([
      { field: "Minute", value: "*/15", meaning: "every 15 minutes" },
      { field: "Hour", value: "*", meaning: "every hour" },
      { field: "Day of month", value: "*", meaning: "every day of the month" },
      { field: "Month", value: "*", meaning: "every month" },
      { field: "Day of week", value: "0,6", meaning: "Sunday, Saturday" },
    ]);
  });

  it("resolves @specials and rejects garbage", () => {
    expect(explainCronFields("@hourly")?.[0]).toEqual({
      field: "Minute",
      value: "0",
      meaning: "at minute 0",
    });
    expect(explainCronFields("not a cron")).toEqual(null);
  });

  it("renders day-of-month values and lists in plain English", () => {
    expect(explainCronFields("0 9 15 * *")?.[2]).toEqual({
      field: "Day of month",
      value: "15",
      meaning: "on the 15th of the month",
    });
    const rows = explainCronFields("0 9 1,15 * *");
    expect(rows?.[2]).toEqual({
      field: "Day of month",
      value: "1,15",
      meaning: "on the 1st and 15th of the month",
    });
    expect(rows?.length).toEqual(5);
  });

  it("flags the day-of-month / day-of-week OR when both fields are restricted", () => {
    const rows = explainCronFields("30 4 1,15 * 5");
    expect(rows?.length).toEqual(6);
    expect(rows?.[5]).toEqual({
      field: "Day rule",
      value: "either",
      meaning:
        "Both day fields are set, so cron runs when either matches: on the 1st and 15th of the month, or on Friday.",
    });
  });

  it("does not add the OR row when a day field starts with a step (counts as unrestricted)", () => {
    expect(explainCronFields("0 4 */2 * 5")?.length).toEqual(5);
  });

  it("explains a stepped range within a field", () => {
    expect(explainCronFields("0 8-18/2 * * *")?.[1]).toEqual({
      field: "Hour",
      value: "8-18/2",
      meaning: "every 2 hours from 8 through 18",
    });
  });

  it("explains bare steps from their start to the field maximum", () => {
    expect(explainCronFields("5/15 * * * *")?.[0].meaning).toEqual(
      "every 15 minutes from 5 through 59",
    );
    expect(explainCronFields("0 1,2/3 * * *")?.[1].meaning).toEqual(
      "at hour 1, every 3 hours from 2 through 23",
    );
    expect(explainCronFields("0 0 5/10 * *")?.[2].meaning).toEqual(
      "every 10 days from 5 through 31",
    );
  });

  it("uses the step phrasing for a stepped day-of-month in the Day rule row", () => {
    const rows = explainCronFields("0 4 5/10 * 5");
    expect(rows?.[5]?.meaning).toEqual(
      "Both day fields are set, so cron runs when either matches: every 10 days from 5 through 31, or on Friday.",
    );
  });

  it("labels the day-of-week '7' as Sunday", () => {
    expect(explainCronFields("0 9 * * 7")?.[4]).toEqual({
      field: "Day of week",
      value: "7",
      meaning: "Sunday",
    });
  });

  it("labels a restricted month field by name", () => {
    expect(explainCronFields("0 9 * 6 *")?.[3]).toEqual({
      field: "Month",
      value: "6",
      meaning: "June",
    });
  });

  it("falls back to the raw number for out-of-range values inside a partly valid list", () => {
    // One in-range value keeps the cron runnable; the stray digit has no label.
    expect(explainCronFields("0 9 * * 1,9")?.[4].meaning).toEqual("Monday, 9");
    expect(explainCronFields("0 9 * 1,13 *")?.[3].meaning).toEqual("January, 13");
  });

  it("returns null for shape-valid crons that can never run", () => {
    expect(explainCronFields("0 9 * * 9")).toEqual(null);
    expect(explainCronFields("0 9 * 13 *")).toEqual(null);
    expect(explainCronFields("60 99 * * *")).toEqual(null);
    expect(explainCronFields("*/0 * * * *")).toEqual(null);
  });
});
