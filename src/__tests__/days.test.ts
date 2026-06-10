import { describe, expect, it } from "vitest";
import { fuzzyMatch, matchDay } from "../days";

describe("matchDay", () => {
  it("matches full names and plurals", () => {
    expect(["monday", "mondays", "saturday", "sundays"].map(matchDay)).toEqual([1, 1, 6, 0]);
  });

  it("matches the curated abbreviation table", () => {
    expect(
      [
        "sun",
        "su",
        "mon",
        "mo",
        "tue",
        "tues",
        "tu",
        "wed",
        "weds",
        "we",
        "thu",
        "thur",
        "thurs",
        "th",
        "fri",
        "fr",
        "sat",
        "sa",
      ].map(matchDay),
    ).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 6]);
  });

  it("matches plurals of curated abbreviations", () => {
    expect(["mons", "fris"].map(matchDay)).toEqual([1, 5]);
  });

  it("allows unambiguous single letters only", () => {
    expect(["m", "w", "f"].map(matchDay)).toEqual([1, 3, 5]);
    // "t" (tue/thu) and "s" (sat/sun) are ambiguous by design
    expect(["t", "s"].map(matchDay)).toEqual([null, null]);
  });

  it("tolerates close typos on full names (unique match required)", () => {
    expect(matchDay("thurday")).toEqual(4); // deletion
    expect(matchDay("thursdy")).toEqual(4);
    expect(matchDay("tuseday")).toEqual(2); // transposition
    expect(matchDay("wensday")).toEqual(3); // two edits, long word
    expect(matchDay("mondey")).toEqual(1);
    expect(matchDay("thurdays")).toEqual(4); // plural + typo
  });

  it("rejects short or ambiguous garbage", () => {
    expect(["xyz", "day", "ton", "frx"].map(matchDay)).toEqual([null, null, null, null]);
  });
});

describe("fuzzyMatch", () => {
  it("maps near-miss keywords uniquely", () => {
    expect(fuzzyMatch("minuts", ["minute", "month", "midnight"])).toEqual("minute");
    expect(fuzzyMatch("evrey", ["every", "other"])).toEqual("every");
  });
  it("returns null on tie or distance overflow", () => {
    expect(fuzzyMatch("xx", ["every", "other"])).toEqual(null);
  });
});
