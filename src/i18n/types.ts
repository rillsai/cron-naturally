/**
 * The localization contract.
 *
 * A `Locale` bundles EVERYTHING language-specific the library needs, in both
 * directions:
 *   - `lexicon` / `days` / `time` — the vocabulary the parser reads (input)
 *   - `messages` — every user-facing string the library emits (output)
 *   - `format` — locale formatters (12-hour time, ordinals, list joining)
 *
 * Both halves ship together on purpose. The round-trip invariant
 * (`describeCron(loc)` must re-parse via `parseNaturalSchedule(loc)`) only holds
 * when a locale's output templates and its parse vocabulary stay consistent, so
 * keeping them in one object means they can't drift. The invariant is enforced
 * per-locale by the round-trip tests.
 *
 * Parser branch keywords (the strings in `lexicon.keywords`, e.g. "minute",
 * "every") double as locale-independent *symbols*: `parse.ts` switches on them,
 * they are never printed. A non-English locale maps its surface words onto these
 * same symbols via `lexicon.aliases`; the symbols themselves do not translate.
 */
export interface Locale {
  /** BCP-47-ish code, e.g. "en". */
  code: string;
  lexicon: Lexicon;
  days: DayLexicon;
  time: TimeLexicon;
  messages: Messages;
  format: Formatters;
}

/** Parse-side vocabulary. All tokens lowercase; matched after tokenization. */
export interface Lexicon {
  /** Connective words skipped during parsing ("a", "the", "at", …). */
  fillers: ReadonlySet<string>;
  /** Canonical keyword symbols the grammar recognizes (identity-mapped for en). */
  keywords: readonly string[];
  /** Surface word → canonical keyword symbol, applied before fuzzy matching. */
  aliases: Readonly<Record<string, string>>;
  /** Word joining `&` during tokenization ("and"). */
  andWord: string;
  /** Connector that OR-links a day-of-month clause to a day-of-week clause ("or"). */
  orWord: string;
  /**
   * Range word: "mon-fri" tokenizes to "mon <rangeWord> fri" ("through").
   * Detection is positional (only right after a day name), so this word MAY
   * also appear in {@link fillers} when the language reuses it (Spanish "a"
   * is both: "lunes a viernes" and "a las 9").
   */
  rangeWord: string;
  /**
   * Global-flag pattern of punctuation stripped to spaces before tokenizing.
   * Exclude any character your vocabulary needs to survive: German ordinals
   * ("1.") must keep the dot out of this set and handle it in
   * {@link ordinalDay} instead.
   */
  punctuation: RegExp;
  /**
   * Day-of-month number named by an ordinal token ("1st" → 1, "1er" → 1,
   * "1." → 1), or null when the token is not an ordinal. Return the raw
   * number; the parser does the 1-31 range check.
   */
  ordinalDay(token: string): number | null;
  /** Single tokens expanded during tokenization, e.g. { everyday: ["every", "day"] }. */
  compounds: Readonly<Record<string, string[]>>;
  /**
   * Reduce a token to the singular form to also try, or null if it does not
   * look inflected. Lets day matching accept "mondays"/"mons" without listing
   * every plural. English strips a trailing "s"; a language without trailing-s
   * plurals returns null (or applies its own rule). Keyword plurals are handled
   * separately via {@link Lexicon.aliases}, not here.
   */
  singularize(token: string): string | null;
}

/** Day-of-week vocabulary and labels. Index 0 = Sunday … 6 = Saturday (cron order). */
export interface DayLexicon {
  /** Output labels by index, e.g. ["Sunday", …, "Saturday"]. */
  labels: readonly [string, string, string, string, string, string, string];
  /** Lowercase full name → index 0-6. */
  fullNames: Readonly<Record<string, number>>;
  /** Curated unambiguous abbreviations → index 0-6. */
  abbreviations: Readonly<Record<string, number>>;
}

/** Time-of-day words the parser reads and the meridiem-flip helper re-emits. */
export interface TimeLexicon {
  noon: string;
  midnight: string;
  /** Ante-meridiem marker ("am"). */
  am: string;
  /** Post-meridiem marker ("pm"). */
  pm: string;
  /**
   * Locale-specific clock token formats beyond the built-ins (colon, military,
   * meridiem suffix, bare hour) — e.g. French "9h30"/"21h". Tried first;
   * return null to fall through to the built-in forms. A clock read here is
   * treated as explicit (no assumed meridiem).
   */
  readClock?(token: string): { hour: number; minute: number } | null;
}

/** Locale formatters — pure, parameterized, no app state. */
export interface Formatters {
  /** Canonical clock string, e.g. "9:05 AM", "12:00 PM". */
  time(hour: number, minute: number): string;
  /** Ordinal, e.g. 1 → "1st", 22 → "22nd". */
  ordinal(n: number): string;
  /** Natural list, e.g. ["a","b","c"] → "a, b, and c". */
  list(items: string[]): string;
  /** Range joiner, e.g. ("1st","5th") → "1st through 5th". */
  range(from: string, to: string): string;
  /**
   * Input token for the flipped reading of an ambiguous time ("9" read as
   * 9:00 AM flips via flipToken(21, 0) → "9pm"). Must re-parse to exactly
   * (hour, minute). Return null when the language has no such phrasing
   * (24-hour-only locales); the assumption is then surfaced without the
   * one-click alternative.
   */
  flipToken(hour: number, minute: number): string | null;
}

/**
 * Every user-facing string the library emits. Plain strings where fixed,
 * functions where a value is interpolated. Pieces are intentionally granular so
 * `describe.ts` / `explain.ts` keep ownership of WHICH template to assemble,
 * while the locale owns the WORDS.
 */
export interface Messages {
  errors: ErrorMessages;
  assumptions: AssumptionMessages;
  describe: DescribeMessages;
  explain: ExplainMessages;
  /**
   * Canonical example phrases — error fallbacks, chips; round-trip tested.
   * At least three: indexes 1 and 2 are the default error suggestions.
   */
  examples: readonly [string, string, string, ...string[]];
}

export interface ErrorMessages {
  /** Hint for empty input. */
  empty: string;
  /** Token the parser could not place; reused for an unrecognized range end. */
  unrecognized(token: string): string;
  /** "every N days/weeks/months" from an arbitrary start — not expressible. */
  everyNFromStart(unit: string): string;
  minuteOutOfRange: string;
  domOutOfRange: string;
  /** Fallback if the assembler somehow emits an undescribable shape (unreachable). */
  buildFailed: string;
  lastDayUnsupported: string;
  /** Suggestion paired with `lastDayUnsupported`. */
  lastDaySuggestion: string;
  minuteIntervalOutOfRange: string;
  hourIntervalOutOfRange: string;
  /** Interval + explicit time of day collide. `unit` is the interval unit word. */
  intervalWithTime(unit: string): string;
  /** Interval + day-of-month collide. `unit` is the interval unit word. */
  intervalWithDom(unit: string): string;
  everyMinuteWithExtras: string;
  hourlyWithTime: string;
  hourlyWithDom: string;
  bothDayFields: string;
  /** Pasted cron is shape-valid but a field is out of range, so it never runs. */
  cronNeverRuns: string;
  /** "at minute N" appeared outside an hourly schedule, where it has no meaning. */
  minuteOfOutsideHourly: string;
  multipleMinutes: string;
  /** Last-resort hint when nothing matched. */
  unreadable: string;
}

export interface AssumptionMessages {
  /** No time given → default. */
  defaultTime: string;
  /** No day given on a monthly schedule. */
  defaultDayMonth: string;
  /** No day given on a weekly schedule. */
  defaultDayWeek: string;
  /** Day 29-31: months without it are skipped. */
  shortMonthSkip(day: number): string;
  /** Bare hour read with an assumed meridiem. `reading` is pre-formatted. */
  assumedMeridiem(raw: string, reading: string): string;
  /** One-click flip label. `alternative` is the pre-formatted other reading. */
  flipLabel(alternative: string): string;
}

/** Output templates for `describeCron`. Suffix/fragment args are pre-built strings. */
export interface DescribeMessages {
  everyMinute(dowSuffix: string): string;
  everyNMinutes(n: string, dowSuffix: string): string;
  /** " at minute 30" fragment, when minute > 0. */
  atMinute(minute: number): string;
  everyHour(atMinute: string, dowSuffix: string): string;
  everyNHours(n: string, atMinute: string, dowSuffix: string): string;
  /** dom+dow OR case: "On <dom>, or <dowSuffix>, at <times>". */
  domOrDow(domPhrase: string, dowSuffix: string, timeList: string): string;
  monthlyOn(domList: string, timeList: string): string;
  weekdaysAt(timeList: string): string;
  weekendsAt(timeList: string): string;
  everyDaysAt(dayList: string, timeList: string): string;
  everyDayAt(timeList: string): string;
  /** Fallback label for a valid-but-undescribable pasted cron. */
  custom(cron: string): string;
  /** " on weekdays" day-of-week suffix. */
  dowWeekdays: string;
  /** " on weekends" day-of-week suffix. */
  dowWeekends: string;
  /** " on <joined day labels>" suffix. */
  dowList(joinedDays: string): string;
  /** Day-of-month list without unit, e.g. "the 1st and 15th". */
  domThe(joined: string): string;
  /** Full day-of-month phrase, e.g. "the 1st and 15th of the month". */
  domOfMonth(joined: string): string;
}

/** Exactly one string per cron field, in field order (minute … day of week). */
type PerField = readonly [string, string, string, string, string];

/** Output templates and labels for `explainCronFields`. */
export interface ExplainMessages {
  /** Five cron field names, in order. */
  fieldNames: PerField;
  /** Twelve month labels, January first. */
  monthLabels: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  /** Whole-field "every …" by field index 0-4. */
  every: PerField;
  /** Step units by field index 0-4 (plural). */
  stepUnits: PerField;
  everyNUnits(n: string, unit: string): string;
  onDom(domPhrase: string): string;
  everyNFromThrough(step: string, unit: string, from: string, to: string): string;
  /**
   * "at minute 30" style. `field` arrives exactly as written in
   * {@link ExplainMessages.fieldNames}; the locale decides casing (English
   * lowercases, German keeps nouns capitalized).
   */
  atField(field: string, joined: string): string;
  /** The extra "Day rule" row's field label. */
  dayRuleField: string;
  /** The extra "Day rule" row's value cell. */
  dayRuleValue: string;
  /** `domMeaning` is a pre-built clause (e.g. "on the 1st and 15th of the month"). */
  dayRuleMeaning(domMeaning: string, dowMeaning: string): string;
}
