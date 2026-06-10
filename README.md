# cron-naturally

[Live demo & docs](https://rillsai.github.io/cron-naturally/) · [npm](https://www.npmjs.com/package/cron-naturally) · [Rills](https://rills.ai)

Two-way translation between plain English and cron expressions.

```ts
parseNaturalSchedule("weekdays at noon");
// → { ok: true, cron: "0 12 * * 1-5", description: "Weekdays at 12:00 PM", assumptions: [] }

describeCron("*/15 9-17 * * 1-5");
// → "Every 15 minutes ..."  (canonical English for any cron)

explainCronFields("0 9 * * 1");
// → field-by-field anatomy, ready to render as a table
```

No equivalent package existed, so this one was built for a natural-language schedule builder in the [Rills](https://rills.ai) automation service. It has zero runtime dependencies, is fully typed, and round-trip tested; every English description it produces parses back to a semantically identical cron.

## Why

Most cron libraries go one direction — cron → English (`cronstrue`) or English → cron (`cron-parser` does neither; `friendly-cron` and friends are partial). `cron-naturally` does both, and adds the parts a real UI needs:

- **Friendly, specific errors** that never blame the user and always suggest a working phrasing.
- **Surfaced assumptions.** When the input is ambiguous ("at 9"), it picks a sane default (9:00 AM) and tells you, ideally with a one-click correction ("Did you mean 9:00 PM?").
- **A canonical grammar.** The set of phrases it teaches is the set it parses — enforced by round-trip tests, so docs never drift from behavior.

## Install

```bash
npm install cron-naturally
```

Requires Node 20+. Ships ESM with type declarations. Zero runtime dependencies — timezone-aware next-run computation uses the platform's built-in `Intl` API.

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
| `1st and 15th at 9am`           | `0 9 1,15 * *`  |
| `1st and 15th, or fridays, at 4:30am` | `30 4 1,15 * 5` |

It is forgiving about phrasing: plurals (`mondays`), abbreviations (`mon`, `wed`), ranges (`mon-fri`, `mon through fri`), `&` / `and`, `everyday`, `military` time (`2100`), and minor typos (`weekdys`, `tuesdy`) are all handled. Single-letter day codes are accepted only where unambiguous (`m`/`w`/`f`); `t` and `s` are deliberately rejected.

Pasted cron expressions (including `@daily`, `@hourly`, etc.) pass straight through and come back with a description, so the same entry point powers both "type a schedule" and "explain this cron" UIs. A cron that is shaped correctly but could never fire (`60 99 * * *`) is rejected with an explanation rather than passed through.

### What it deliberately rejects

The library targets standard 5-field cron and explains *why* when something doesn't fit, rather than emitting a wrong expression:

- `every 3 days` — cron can't count days from an arbitrary start; it suggests specific weekdays instead.
- `last day of the month` — not expressible in standard cron; it suggests a fixed day like the 28th.
- Pairing a day-of-week _and_ a day-of-month with no `or` (e.g. `mondays on the 15th`) — that reads as AND, which cron can't express, so it's rejected. Join them with an explicit `or` (`1st and 15th, or fridays`) to get the cron OR semantics instead.
- An interval with a fixed time of day — produces a clear, actionable error.

## API

### `parseNaturalSchedule(input: string, opts?: LocaleOptions): ParseResult`

English (or a pasted cron) → result. Pass `{ locale }` to parse and answer in another bundled locale (see [Locales](#locales)).

```ts
type ParseResult = ParseOk | ParseError;

interface ParseOk {
  ok: true;
  cron: string;          // 5-field cron expression
  description: string;   // canonical phrasing in the active locale (re-parses to the same cron)
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

### `describeCron(cron: string, opts?: LocaleOptions): string | null`

Cron → canonical phrasing, or `null` when the expression is outside the supported grammar (e.g. month restrictions). Day-of-month lists/ranges (`1,15`, `1-7`) and the dom/dow OR (`30 4 1,15 * 5` → `On the 1st and 15th of the month, or on Friday, at 4:30 AM`) are spelled out explicitly. Guaranteed to round-trip: any non-null result re-parses to a semantically identical cron.

### `explainCronFields(cron: string, opts?: LocaleOptions): CronFieldExplanation[] | null`

Cron → per-field breakdown for an "explain mode" table. `null` for malformed input, or for a shape-valid cron that could never fire (out-of-range field values).

```ts
interface CronFieldExplanation {
  field: string;   // "Minute" | "Hour" | "Day of month" | "Month" | "Day of week"
  value: string;   // raw field value
  meaning: string; // human-readable meaning
}
```

When **both** the day-of-month and day-of-week fields are restricted (neither is `*` or a `*`-prefixed step), cron runs when *either* matches, not both. In that case the breakdown appends a sixth `{ field: "Day rule", value: "either", … }` row spelling out the combined schedule, so the table reflects the [crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html) OR semantics instead of hiding them.

### `getNextRuns(cron: string, timezone: string, count?: number): Date[]`

Next `count` run times (default 3) in the given IANA timezone. Returns `[]` on a parse error or invalid timezone. DST-correct via the platform's `Intl` timezone database — no runtime dependency. Across a fall-back, a repeated wall hour fires at both instants; across a spring-forward, a run whose wall-clock time does not exist (e.g. `30 2` on the transition day) is skipped and resumes at the next valid occurrence.

### `isCronExpression(input: string): boolean`

True for a valid 5-field cron expression or an `@special` form (`@daily`, `@hourly`, …). Useful for deciding whether input is already cron before routing it through `parseNaturalSchedule`.

> **Public API scope.** The surface is kept small and language-agnostic. Language data lives in locale bundles (see below); internal cron patterns and the `@special` map are not part of the public API.

## Locales

Every language-aware entry point (`parseNaturalSchedule`, `describeCron`, `explainCronFields`) takes an optional `{ locale }` and defaults to English, so adding a locale is non-breaking.

```ts
import { parseNaturalSchedule, DEFAULT_LOCALE, LOCALES, type Locale } from "cron-naturally";

DEFAULT_LOCALE.code;           // "en"
Object.keys(LOCALES);          // bundled locales, by code
parseNaturalSchedule("weekdays at noon", { locale: LOCALES.en });
```

A `Locale` bundles everything language-specific, in both directions: the vocabulary the parser reads (keywords, aliases, day names, time words) and every string the library emits (errors, assumptions, descriptions, the explain table). Both halves ship together so the round-trip invariant — every description re-parses to a semantically identical cron — holds per locale.

To add a language, clone the English bundle (`src/i18n/en.ts`) and translate it; the `Locale` type flags anything left untranslated. Parser keywords are locale-independent symbols — a new locale maps its surface words onto them via `aliases` rather than translating them.

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
