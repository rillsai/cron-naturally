import { describe, expect, it } from "vitest";
import { getNextRuns, isCronExpression, normalizeCronSpacing, SPECIAL_EQUIVALENTS } from "../cron";

describe("isCronExpression", () => {
  it("accepts 5-field expressions and specials, rejects prose", () => {
    expect(
      ["0 9 * * 1-5", "*/15 * * * *", "0 9,17 * * *", "@daily", "30 6 1 * *"].map(isCronExpression),
    ).toEqual([true, true, true, true, true]);
    expect(
      ["mondays at 9am", "0 9 * *", "not a cron", "", "0 9 * * 1-5 6"].map(isCronExpression),
    ).toEqual([false, false, false, false, false]);
  });
});

describe("normalizeCronSpacing", () => {
  it("collapses whitespace", () => {
    expect(normalizeCronSpacing("  0  9 * *  1-5 ")).toEqual("0 9 * * 1-5");
  });
});

describe("SPECIAL_EQUIVALENTS", () => {
  it("maps all @specials to 5-field forms", () => {
    expect(SPECIAL_EQUIVALENTS).toEqual({
      "@annually": "0 0 1 1 *",
      "@daily": "0 0 * * *",
      "@hourly": "0 * * * *",
      "@midnight": "0 0 * * *",
      "@monthly": "0 0 1 * *",
      "@weekly": "0 0 * * 0",
      "@yearly": "0 0 1 1 *",
    });
  });
});

describe("getNextRuns", () => {
  it("returns the requested count for a valid cron", () => {
    expect(getNextRuns("0 9 * * *", "UTC", 5)).toHaveLength(5);
  });
  it("returns [] for garbage", () => {
    expect(getNextRuns("not a cron", "UTC")).toEqual([]);
  });
  it("returns increasing dates", () => {
    const [a, b] = getNextRuns("0 * * * *", "America/New_York", 2);
    expect(b.getTime()).toBeGreaterThan(a.getTime());
  });
});
