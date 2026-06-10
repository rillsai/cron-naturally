import { describe, expect, it } from "vitest";
import { describeCron } from "../describe";
import { en } from "../i18n/en";
import { parseNaturalSchedule } from "../parse";

const EXAMPLE_PHRASES = en.messages.examples;

/**
 * The core invariant: every description the package generates re-parses to
 * the exact same cron. This is what makes pre-filling the panel input with
 * the stored schedule's description safe.
 */
const GENERATED_CRONS = [
  "* * * * *",
  "*/15 * * * *",
  "*/15 * * * 1-5",
  "0 * * * *",
  "30 * * * *",
  "0 */2 * * *",
  "15 */2 * * 0,6",
  "0 9 * * *",
  "0 9,17 * * *",
  "0 12 * * 1-5",
  "0 10 * * 0,6",
  "0 21 * * 5",
  "0 9 * * 1,4",
  "0 8 1 * *",
  "0 9 15 * *",
  "0 9 31 * *",
  "30 8 * * 1-5",
  "0 9,17 * * 0,6",
  "0 7 * * 0,1,6",
  "0 9 1,15 * *",
  "0 9 1 * 1",
  "30 4 1,15 * 5",
];

describe("round-trip: describeCron output re-parses to the identical cron", () => {
  it.each(GENERATED_CRONS)("%s", (cron) => {
    const description = describeCron(cron);
    expect(description).not.toBeNull();
    const reparsed = parseNaturalSchedule(description as string);
    expect(reparsed.ok).toEqual(true);
    if (reparsed.ok) expect(reparsed.cron).toEqual(cron);
  });
});

describe("every example phrase parses", () => {
  it.each([...EXAMPLE_PHRASES])("%s", (phrase) => {
    expect(parseNaturalSchedule(phrase).ok).toEqual(true);
  });
});
