# cron-naturally

Two-way translation between plain English and cron expressions.

```ts
parseNaturalSchedule("weekdays at noon");
// → { ok: true, cron: "0 12 * * 1-5", description: "Weekdays at 12:00 PM", assumptions: [] }

describeCron("*/15 9-17 * * 1-5");
// → "Every 15 minutes ..."  (canonical English for any cron)

explainCronFields("0 9 * * 1");
// → field-by-field anatomy, ready to render as a table
```

No equivalent package existed, so this one was built for a natural-language schedule builder in the [Rills](https://rills.ai) automation service. It is dependency-light (one runtime dep), fully typed, and round-trip tested; every English description it produces parses back to a semantically identical cron.

## Why

Most cron libraries go one direction — cron → English (`cronstrue`) or English → cron (`cron-parser` does neither; `friendly-cron` and friends are partial). `cron-naturally` does both, and adds the parts a real UI needs:

- **Friendly, specific errors** that never blame the user and always suggest a working phrasing.
- **Surfaced assumptions.** When the input is ambiguous ("at 9"), it picks a sane default (9:00 AM) and tells you, ideally with a one-click correction ("Did you mean 9:00 PM?").
- **A canonical grammar.** The set of phrases it teaches is the set it parses — enforced by round-trip tests, so docs never drift from behavior.

## Install

```bash
npm install cron-naturally
```

Requires Node 18+. Ships ESM with type declarations. The single runtime dependency is [`cron-parser`](https://www.npmjs.com/package/cron-parser) (used only by `getNextRuns`).

## Quick start

```ts
import {
  parseNaturalSchedule,
  describeCron,
  explainCronFields,
  getNextRuns,
} from "cron-naturally";

// English → cron
const result = parseNaturalSchedule("every 15 minutes on weekdays");
if (result.ok) {
  result.cron;        // "*/15 * * * 1-5"
  result.description; // "Every 15 minutes on weekdays"
  result.assumptions; // []
} else {
  result.hint;        // warm, specific guidance
  result.suggestions; // up to two example phrasings to try
}

// cron → English
describeCron("0 9 1 * *"); // "Monthly on the 1st at 9:00 AM"

// cron → field anatomy (for an explain-mode table)
explainCronFields("30 9 * * 1-5");
// [
//   { field: "Minute",       value: "30",  meaning: "at minute 30" },
//   { field: "Hour",         value: "9",   meaning: "at hour 9" },
//   { field: "Day of month", value: "*",   meaning: "every day of the month" },
//   { field: "Month",        value: "*",   meaning: "every month" },
//   { field: "Day of week",  value: "1-5", meaning: "Monday, Tuesday, Wednesday, Thursday, Friday" },
// ]

// next run times (timezone-aware)
getNextRuns("0 9 * * 1-5", "America/New_York", 3); // → [Date, Date, Date]
```

## What it understands

Pass any of these to `parseNaturalSchedule`:

| Phrase                          | Cron            |
| ------------------------------- | --------------- |
| `every minute`                  | `* * * * *`     |
| `every 15 minutes`              | `*/15 * * * *`  |
| `every other hour`              | `0 */2 * * *`   |
| `hourly at minute 30`           | `30 * * * *`    |
| `daily at 9am`                  | `0 9 * * *`     |
| `weekdays at noon`              | `0 12 * * 1-5`  |
| `weekends at 8:30am`            | `30 8 * * 0,6`  |
| `mondays and thursdays at 2pm`  | `0 14 * * 1,4`  |
| `mon-fri at 21:00`              | `0 21 * * 1-5`  |
| `1st of the month at 8am`       | `0 8 1 * *`     |
| `the 15th at midnight`          | `0 0 15 * *`    |

It is forgiving about phrasing: plurals (`mondays`), abbreviations (`mon`, `wed`), ranges (`mon-fri`, `mon through fri`), `&` / `and`, `everyday`, `military` time (`2100`), and minor typos (`weekdys`, `tuesdy`) are all handled. Single-letter day codes are accepted only where unambiguous (`m`/`w`/`f`); `t` and `s` are deliberately rejected.

Pasted cron expressions (including `@daily`, `@hourly`, etc.) pass straight through and come back with a description, so the same entry point powers both "type a schedule" and "explain this cron" UIs.

### What it deliberately rejects

The library targets standard 5-field cron and explains *why* when something doesn't fit, rather than emitting a wrong expression:

- `every 3 days` — cron can't count days from an arbitrary start; it suggests specific weekdays instead.
- `last day of the month` — not expressible in standard cron; it suggests a fixed day like the 28th.
- Mixing day-of-week with day-of-month, or an interval with a fixed time of day — both produce a clear, actionable error.

## API

### `parseNaturalSchedule(input: string): ParseResult`

English (or a pasted cron) → result.

```ts
type ParseResult = ParseOk | ParseError;

interface ParseOk {
  ok: true;
  cron: string;          // 5-field cron expression
  description: string;   // canonical English (re-parses to the same cron)
  assumptions: Assumption[];
}

interface ParseError {
  ok: false;
  reason: "empty" | "unrecognized" | "unsupported";
  hint: string;          // warm, specific, never blames
  suggestions: string[]; // up to two clickable example phrasings
}

interface Assumption {
  text: string;          // e.g. 'Read "9" as 9:00 AM.'
  alternative?: { label: string; input: string }; // one-click correction
}
```

### `describeCron(cron: string): string | null`

Cron → canonical English, or `null` when the expression is outside the supported grammar (e.g. month restrictions). Guaranteed to round-trip: any non-null result re-parses to a semantically identical cron.

### `explainCronFields(cron: string): CronFieldExplanation[] | null`

Cron → per-field breakdown for an "explain mode" table. `null` for malformed input.

```ts
interface CronFieldExplanation {
  field: string;   // "Minute" | "Hour" | "Day of month" | "Month" | "Day of week"
  value: string;   // raw field value
  meaning: string; // human-readable meaning
}
```

### `getNextRuns(cron: string, timezone: string, count?: number): Date[]`

Next `count` run times (default 3) in the given IANA timezone. Returns `[]` on a parse error. Thin wrapper over `cron-parser`.

### `isCronExpression(input: string): boolean`

True for a valid 5-field cron expression or an `@special` form (`@daily`, `@hourly`, …). Useful for deciding whether input is already cron before routing it through `parseNaturalSchedule`.

> **Public API scope.** The surface is kept small and language-agnostic so it can survive future internationalization without a breaking change. English-specific data (day labels, example phrases) and locale formatters (12-hour time, ordinals), plus internal cron patterns and the `@special` map, are not part of the public API.

## Conventions

- **Day-of-week is cron-standard:** `0` = Sunday … `6` = Saturday (and `7` = Sunday on input).
- **Ambiguous times default to AM** on a bare hour, with the assumption surfaced. Bare `12` is treated as noon.
- **Weekday/weekend shorthands** normalize to canonical ranges: weekdays → `1-5`, weekends → `0,6`.

## Development

```bash
npm install
npm test           # vitest
npm run check-types # tsc --noEmit
npm run build       # emit dist/ with declarations
```

## License

MIT © Rills AI, LLC
