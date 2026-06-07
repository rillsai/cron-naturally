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
});
