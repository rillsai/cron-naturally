import { describe, expect, it } from "vitest";
import { describeCron } from "../describe";

describe("describeCron", () => {
  it("describes intervals", () => {
    expect(describeCron("* * * * *")).toEqual("Every minute");
    expect(describeCron("*/15 * * * *")).toEqual("Every 15 minutes");
    expect(describeCron("*/15 * * * 1-5")).toEqual("Every 15 minutes on weekdays");
    expect(describeCron("0 * * * *")).toEqual("Every hour");
    expect(describeCron("30 * * * *")).toEqual("Every hour at minute 30");
    expect(describeCron("0 */2 * * *")).toEqual("Every 2 hours");
    expect(describeCron("15 */2 * * 0,6")).toEqual("Every 2 hours at minute 15 on weekends");
  });

  it("describes daily and day-of-week schedules", () => {
    expect(describeCron("0 9 * * *")).toEqual("Every day at 9:00 AM");
    expect(describeCron("0 9,17 * * *")).toEqual("Every day at 9:00 AM and 5:00 PM");
    expect(describeCron("0 12 * * 1-5")).toEqual("Weekdays at 12:00 PM");
    expect(describeCron("0 10 * * 0,6")).toEqual("Weekends at 10:00 AM");
    expect(describeCron("0 21 * * 5")).toEqual("Every Friday at 9:00 PM");
    expect(describeCron("0 9 * * 1,4")).toEqual("Every Monday and Thursday at 9:00 AM");
    expect(describeCron("30 8 * * 2-4")).toEqual(
      "Every Tuesday, Wednesday, and Thursday at 8:30 AM",
    );
  });

  it("describes monthly schedules", () => {
    expect(describeCron("0 8 1 * *")).toEqual("Monthly on the 1st at 8:00 AM");
    expect(describeCron("0 9 15 * *")).toEqual("Monthly on the 15th at 9:00 AM");
    expect(describeCron("0 9 23 * *")).toEqual("Monthly on the 23rd at 9:00 AM");
  });

  it("describes day-of-month lists and ranges", () => {
    expect(describeCron("0 9 1,15 * *")).toEqual("Monthly on the 1st and 15th at 9:00 AM");
    expect(describeCron("0 9 1-7 * *")).toEqual("Monthly on the 1st through 7th at 9:00 AM");
  });

  it("spells out the dom/dow OR when both day fields are restricted", () => {
    expect(describeCron("30 4 1,15 * 5")).toEqual(
      "On the 1st and 15th of the month, or on Friday, at 4:30 AM",
    );
    expect(describeCron("0 9 1 * 1")).toEqual("On the 1st of the month, or on Monday, at 9:00 AM");
    expect(describeCron("0 12 1 * 1-5")).toEqual(
      "On the 1st of the month, or on weekdays, at 12:00 PM",
    );
  });

  it("resolves @specials", () => {
    expect(describeCron("@daily")).toEqual("Every day at 12:00 AM");
    expect(describeCron("@hourly")).toEqual("Every hour");
    expect(describeCron("@weekly")).toEqual("Every Sunday at 12:00 AM");
    expect(describeCron("@monthly")).toEqual("Monthly on the 1st at 12:00 AM");
  });

  it("returns null outside the grammar", () => {
    expect(describeCron("0 9 * 2 *")).toEqual(null); // month restriction
    expect(describeCron("@yearly")).toEqual(null); // month restriction after resolution
    expect(describeCron("garbage")).toEqual(null);
    expect(describeCron("0 9 * * 9")).toEqual(null); // invalid day
    expect(describeCron("0 9 x * *")).toEqual(null); // non-numeric day-of-month field
    expect(describeCron("0 9 * * x")).toEqual(null); // non-numeric day-of-week field
  });

  it("treats 7 as Sunday", () => {
    expect(describeCron("0 9 * * 7")).toEqual("Every Sunday at 9:00 AM");
  });

  it("ordinal: teen days and -nd suffix", () => {
    expect(describeCron("0 9 11 * *")).toEqual("Monthly on the 11th at 9:00 AM");
    expect(describeCron("0 9 22 * *")).toEqual("Monthly on the 22nd at 9:00 AM");
  });

  it("normalizes 7 to Sunday inside a day-of-week range", () => {
    expect(describeCron("0 9 * * 1-7")).toEqual("Every day at 9:00 AM");
  });

  it("returns null for fields that fall outside the grammar", () => {
    for (const cron of [
      "0 9 0 * *", // dom < 1
      "0 9 40 * *", // dom > 31
      "0 9 5-3 * *", // dom range from > to
      "0 9 1-40 * *", // dom range to > 31
      "0 9 0-5 * *", // dom range from < 1
      "x 9 * * *", // non-numeric minute
      "60 9 * * *", // minute > 59
      "0 1-5 * * *", // hour is a range, not a plain list
      "0 25 * * *", // hour > 23
      "0 9 * * 8-9", // dow range from > 7
      "0 9 * * 5-3", // dow range from > to
    ]) {
      expect(describeCron(cron)).toEqual(null);
    }
  });
});
