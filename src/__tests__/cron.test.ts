import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("returns [] for an unreachable date", () => {
    expect(getNextRuns("0 0 31 2 *", "UTC")).toEqual([]);
  });
  it("lands on Feb 29 only in leap years", () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2025, 0, 1)) });
    const runs = getNextRuns("0 12 29 2 *", "UTC", 2);
    vi.useRealTimers();
    expect(runs.map((r) => r.toISOString())).toEqual([
      "2028-02-29T12:00:00.000Z",
      "2032-02-29T12:00:00.000Z",
    ]);
  });
  it("returns [] for an invalid timezone", () => {
    expect(getNextRuns("0 9 * * *", "Not/AZone")).toEqual([]);
  });
  it("resolves @special forms", () => {
    const runs = getNextRuns("@daily", "UTC", 2);
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.getUTCHours()).toBe(0);
      expect(r.getUTCMinutes()).toBe(0);
    }
  });
  it("fires the wall-clock hour through a DST spring-forward", () => {
    // US clocks jump 02:00 -> 03:00 on 2025-03-09. A 9am daily job must still
    // fire at 09:00 local on both sides of the transition (13:00Z then 14:00Z).
    const runs = getNextRuns("0 9 * * *", "America/New_York", 90);
    for (const r of runs) {
      const local = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour12: false,
          hour: "2-digit",
        })
          .format(r)
          .replace("24", "0"),
      );
      expect(local).toBe(9);
    }
  });
  it("honors step and range fields", () => {
    const runs = getNextRuns("*/15 9 * * *", "UTC", 4);
    expect(runs.map((r) => r.getUTCMinutes())).toEqual([0, 15, 30, 45]);
  });
  it("honors a bare start-step (a/s runs from a to the field max)", () => {
    const runs = getNextRuns("5/20 9 * * *", "UTC", 3);
    expect(runs.map((r) => r.getUTCMinutes())).toEqual([5, 25, 45]);
  });
  it("returns [] when a field is entirely out of range", () => {
    expect(getNextRuns("0 0 32 * *", "UTC")).toEqual([]);
  });
  it("returns [] for a zero step", () => {
    expect(getNextRuns("*/0 * * * *", "UTC")).toEqual([]);
  });
  it("treats an empty timezone as UTC", () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2025, 5, 1, 0, 0)) });
    const blank = getNextRuns("30 14 * * *", "", 2);
    const utc = getNextRuns("30 14 * * *", "UTC", 2);
    vi.useRealTimers();
    expect(blank).toEqual(utc);
    expect(blank[0]?.toISOString()).toBe("2025-06-01T14:30:00.000Z");
  });
  it("applies dom/dow OR semantics when both are restricted", () => {
    // Fires on the 1st of the month OR any Monday.
    const runs = getNextRuns("0 0 1 * 1", "UTC", 20);
    for (const r of runs) {
      const isMonday = r.getUTCDay() === 1;
      const isFirst = r.getUTCDate() === 1;
      expect(isMonday || isFirst).toBe(true);
    }
  });

  // Spring-forward (US: 2025-03-09, 02:00 -> 03:00). These pin behavior the
  // replaced cron-parser got wrong (it dropped valid non-gap runs that day), so
  // they are asserted directly rather than via the differential oracle.
  describe("DST spring-forward", () => {
    const tz = "America/New_York";
    // 2025-03-09T06:30:00Z = 01:30 EST, just before the 02:00 transition.
    beforeEach(() => vi.useFakeTimers({ now: new Date(Date.UTC(2025, 2, 9, 6, 30)) }));
    afterEach(() => vi.useRealTimers());
    const hourMin = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(d)
        .replace("24:", "00:");

    it("fires a non-gap daily run on the transition day", () => {
      // 09:30 is well outside the 02:00-03:00 gap and must still fire on 03-09.
      const runs = getNextRuns("30 9 * * *", tz, 3);
      expect(runs.map(hourMin)).toEqual(["03/09, 09:30", "03/10, 09:30", "03/11, 09:30"]);
    });

    it("skips a run whose wall-clock time falls in the gap", () => {
      // 02:30 does not exist on 03-09; the next run is 02:30 on 03-10.
      const runs = getNextRuns("30 2 * * *", tz, 2);
      // 03-09 02:30 is absent (it never occurs); the series resumes on 03-10.
      expect(runs.map(hourMin)).toEqual(["03/10, 02:30", "03/11, 02:30"]);
    });
  });
});
