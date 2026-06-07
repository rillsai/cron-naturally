import { describe, expect, it } from "vitest";
import { formatTime12, parseTimeToken } from "../time";

describe("parseTimeToken", () => {
  it("parses named times", () => {
    expect(parseTimeToken("noon")).toEqual({ hour: 12, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("midnight")).toEqual({ hour: 0, minute: 0, assumedMeridiem: false });
  });

  it("parses explicit meridiem forms (pre-merged tokens like 9am)", () => {
    expect(parseTimeToken("9am")).toEqual({ hour: 9, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("9:30pm")).toEqual({ hour: 21, minute: 30, assumedMeridiem: false });
    expect(parseTimeToken("12pm")).toEqual({ hour: 12, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("12am")).toEqual({ hour: 0, minute: 0, assumedMeridiem: false });
  });

  it("parses 24-hour and military forms without assumption", () => {
    expect(parseTimeToken("21:00")).toEqual({ hour: 21, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("2100")).toEqual({ hour: 21, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("900")).toEqual({ hour: 9, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("13")).toEqual({ hour: 13, minute: 0, assumedMeridiem: false });
    expect(parseTimeToken("0")).toEqual({ hour: 0, minute: 0, assumedMeridiem: false });
  });

  it("flags assumed AM on bare ambiguous hours", () => {
    expect(parseTimeToken("9")).toEqual({ hour: 9, minute: 0, assumedMeridiem: true });
    expect(parseTimeToken("9:30")).toEqual({ hour: 9, minute: 30, assumedMeridiem: true });
    expect(parseTimeToken("12")).toEqual({ hour: 12, minute: 0, assumedMeridiem: true });
  });

  it("rejects invalid values", () => {
    expect(["25", "1380", "9:75", "13pm", "0am", "banana"].map(parseTimeToken)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("formatTime12", () => {
  it("formats canonical 12-hour strings", () => {
    expect([
      formatTime12(0, 0),
      formatTime12(9, 5),
      formatTime12(12, 0),
      formatTime12(21, 30),
    ]).toEqual(["12:00 AM", "9:05 AM", "12:00 PM", "9:30 PM"]);
  });
});
