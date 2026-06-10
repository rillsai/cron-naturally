import {
  isCronExpression,
  isRunnableCron,
  normalizeCronSpacing,
  SPECIAL_EQUIVALENTS,
} from "./cron.js";
import { findDay, fuzzyCanonicalize } from "./days.js";
import { describeCron } from "./describe.js";
import { type LocaleOptions, resolveLocale } from "./i18n/index.js";
import type { Lexicon, Locale } from "./i18n/types.js";
import { type ParsedTime, readTime } from "./time.js";
import type { Assumption, ParseError, ParseResult } from "./types.js";

function tokenize(input: string, loc: Locale): string[] {
  const lex = loc.lexicon;
  // NFC first: decomposed accents (é as e + combining mark) would otherwise
  // defeat exact vocabulary lookups and skew edit distances.
  const lowered = input
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, ` ${lex.andWord} `)
    .replace(lex.punctuation, " ");
  // "mon-fri" → "mon through fri" (letters only; leaves 21:00 and 9-5 alone).
  // Hyphenated vocabulary words (compounds, day names like "segunda-feira")
  // are NOT ranges — leave them intact for the lexicon lookups downstream.
  const ranged = lowered.replace(/(\p{L}+)\s*-\s*(\p{L}+)/gu, (_match, a: string, b: string) => {
    const joined = `${a}-${b}`;
    const isVocabularyWord =
      joined in lex.compounds || joined in loc.days.fullNames || joined in loc.days.abbreviations;
    return isVocabularyWord ? joined : `${a} ${lex.rangeWord} ${b}`;
  });
  const tokens = ranged
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => lex.compounds[t] ?? [t]);
  // merge "<time> am/pm" pairs into one token
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1];
    if ((next === loc.time.am || next === loc.time.pm) && /^\d{1,2}(:\d{2})?$/.test(tokens[i])) {
      merged.push(tokens[i] + next);
      i++;
    } else {
      merged.push(tokens[i]);
    }
  }
  return merged;
}

/** Canonical form of a word token: alias → exact keyword/day → fuzzy → original. */
function canonicalize(
  token: string,
  lex: Lexicon,
  dayNames: string[],
  surfaceToSymbol: ReadonlyMap<string, string>,
): string {
  if (/\d/.test(token)) return token;
  const aliased = lex.aliases[token] ?? token;
  if (lex.keywords.includes(aliased)) return aliased;
  if (dayNames.includes(aliased)) return aliased;
  return fuzzyCanonicalize(aliased, surfaceToSymbol) ?? token;
}

interface TimedToken extends ParsedTime {
  raw: string;
}

export function parseNaturalSchedule(raw: string, opts?: LocaleOptions): ParseResult {
  const loc = resolveLocale(opts);
  const lex = loc.lexicon;
  const E = loc.messages.errors;
  const A = loc.messages.assumptions;
  const examples = loc.messages.examples;

  const fail = (
    reason: ParseError["reason"],
    hint: string,
    suggestions?: string[],
  ): ParseError => ({
    ok: false,
    reason,
    hint,
    suggestions: suggestions ?? [examples[1], examples[2]],
  });

  // Precomputed once per parse: the day full-names and the fuzzy pool. The
  // pool maps every SURFACE word (keyword symbol, day name, alias spelling) to
  // its canonical symbol, so typos in a locale's own vocabulary fuzzy-match
  // even when the symbol itself is not a word in that language.
  const dayNames = Object.keys(loc.days.fullNames);
  const surfaceToSymbol = new Map<string, string>();
  for (const keyword of lex.keywords) surfaceToSymbol.set(keyword, keyword);
  for (const dayName of dayNames) surfaceToSymbol.set(dayName, dayName);
  for (const [surface, symbol] of Object.entries(lex.aliases)) surfaceToSymbol.set(surface, symbol);
  const canon = (token: string): string => canonicalize(token, lex, dayNames, surfaceToSymbol);

  const trimmed = raw.trim();
  if (!trimmed) {
    return fail("empty", E.empty);
  }

  // Pasted cron: pass through (explain mode for consumers).
  if (isCronExpression(trimmed)) {
    if (!isRunnableCron(trimmed)) {
      return fail("unsupported", E.cronNeverRuns);
    }
    const cron = SPECIAL_EQUIVALENTS[trimmed] ?? normalizeCronSpacing(trimmed);
    return {
      ok: true,
      cron,
      description: describeCron(cron, opts) ?? loc.messages.describe.custom(cron),
      assumptions: [],
    };
  }

  const tokens = tokenize(trimmed, loc);

  // Index of the next non-filler token at or after `from`. Lookaheads read
  // through fillers so phrasings like "toutes les 15 minutes" (filler between
  // the keyword and the number) parse the same as "every 15 minutes".
  const nextIdx = (from: number): number => {
    let j = from;
    while (j < tokens.length && lex.fillers.has(canon(tokens[j]))) j++;
    return j;
  };

  const days = new Set<number>();
  const times: TimedToken[] = [];
  const assumptions: Assumption[] = [];
  const doms: number[] = [];
  let sawOr = false;
  let weekdays = false;
  let weekends = false;
  let freq: "minutely" | "hourly" | "daily" | "weekly" | "monthly" | null = null;
  let intervalUnit: "minute" | "hour" | null = null;
  let intervalN: number | null = null;
  let minuteOf: number | null = null;
  let sawLastOrEnd = false;
  let monthly = false;

  for (let i = 0; i < tokens.length; i++) {
    const word = canon(tokens[i]);
    // Explicit "or" links a day-of-month clause to a day-of-week clause, the one
    // case where cron legitimately sets both day fields (it fires on EITHER).
    if (tokens[i] === lex.orWord) {
      sawOr = true;
      continue;
    }
    if (lex.fillers.has(word)) continue;

    if (word === "every") {
      const j1 = nextIdx(i + 1);
      const next = canon(tokens[j1] ?? "");
      if (next === "other") {
        const j2 = nextIdx(j1 + 1);
        const unit = canon(tokens[j2] ?? "");
        if (unit === "minute" || unit === "hour") {
          intervalUnit = unit;
          intervalN = 2;
          i = j2;
          continue;
        }
        if (unit === "day" || unit === "week" || unit === "month") {
          return fail("unsupported", E.everyNFromStart(unit));
        }
      }
      if (/^\d+$/.test(tokens[j1] ?? "")) {
        const j2 = nextIdx(j1 + 1);
        const unit = canon(tokens[j2] ?? "");
        if (unit === "minute" || unit === "hour") {
          intervalUnit = unit;
          intervalN = Number(tokens[j1]);
          i = j2;
          continue;
        }
        if (unit === "day" || unit === "week" || unit === "month") {
          return fail("unsupported", E.everyNFromStart(unit));
        }
      }
      if (next === "minute") {
        freq = "minutely";
        i = j1;
        continue;
      }
      if (next === "hour") {
        freq = "hourly";
        i = j1;
        continue;
      }
      if (next === "day") {
        freq = "daily";
        i = j1;
        continue;
      }
      if (next === "week") {
        freq = "weekly";
        i = j1;
        continue;
      }
      if (next === "month") {
        freq = "monthly";
        monthly = true;
        i = j1;
        continue;
      }
      continue; // "every monday": day token handled on the next iteration
    }

    if (word === "minute" && /^\d{1,2}$/.test(tokens[nextIdx(i + 1)] ?? "")) {
      const j1 = nextIdx(i + 1);
      minuteOf = Number(tokens[j1]);
      if (minuteOf > 59) return fail("unsupported", E.minuteOutOfRange);
      i = j1;
      continue;
    }

    if (word === "weekday") {
      weekdays = true;
      continue;
    }
    if (word === "weekend") {
      weekends = true;
      continue;
    }
    if (word === "daily") {
      freq = "daily";
      continue;
    }
    if (word === "hourly") {
      freq = "hourly";
      continue;
    }
    if (word === "weekly") {
      freq = "weekly";
      continue;
    }
    if (word === "monthly") {
      monthly = true;
      continue;
    }
    if (word === "last" || word === "end") {
      sawLastOrEnd = true;
      continue;
    }
    if (word === "first") {
      doms.push(1);
      monthly = true;
      continue;
    }
    if (word === "month") {
      monthly = true;
      continue;
    }
    if (word === "day" || word === "week") {
      continue; // "last day of...", "day of the week" connectors
    }

    const ordinalDay = lex.ordinalDay(tokens[i]);
    if (ordinalDay !== null) {
      if (ordinalDay < 1 || ordinalDay > 31) {
        return fail("unsupported", E.domOutOfRange);
      }
      doms.push(ordinalDay);
      monthly = true;
      continue;
    }

    const day =
      findDay(word, loc.days, lex.singularize) ?? findDay(tokens[i], loc.days, lex.singularize);
    if (day !== null) {
      days.add(day);
      // Range detection is positional: right after a day name, the locale's
      // rangeWord counts as a connector EVEN IF it is also a filler (Spanish
      // "a" is both: "lunes a viernes" vs "a las 9"). Checked before the
      // filler skip so the dual-role word keeps its range meaning here.
      let j = i + 1;
      let sawRange = false;
      while (j < tokens.length) {
        if (tokens[j] === lex.rangeWord || canon(tokens[j]) === "through") {
          sawRange = true;
          break;
        }
        if (lex.fillers.has(canon(tokens[j]))) {
          j++;
          continue;
        }
        break;
      }
      if (sawRange) {
        const k = nextIdx(j + 1);
        const endToken = tokens[k] ?? "";
        const endDay =
          findDay(canon(endToken), loc.days, lex.singularize) ??
          findDay(endToken, loc.days, lex.singularize);
        if (endDay !== null) {
          for (let d = day; d !== endDay; d = (d + 1) % 7) days.add(d);
          days.add(endDay);
          i = k;
        } else if (!lex.fillers.has(canon(tokens[j]))) {
          // A dedicated connector ("through") with no day after it is an
          // error worth naming. A dual-role connector that is also a filler
          // ("segunda-feira a las 9h") just wasn't a range — leave it for
          // the filler skip and parse on.
          return fail("unrecognized", E.unrecognized(endToken));
        }
      }
      continue;
    }

    const time = readTime(tokens[i], loc.time);
    if (time) {
      times.push({ ...time, raw: tokens[i] });
      continue;
    }

    return fail("unrecognized", E.unrecognized(tokens[i]));
  }

  if (sawLastOrEnd) {
    return fail("unsupported", E.lastDayUnsupported, [E.lastDaySuggestion]);
  }

  // "at minute N" picks the minute within an hourly cadence. In any other
  // shape it has nothing to attach to and would be silently dropped — reject
  // instead so the user's intent is never ignored.
  if (minuteOf !== null && intervalUnit !== "hour" && freq !== "hourly") {
    return fail("unsupported", E.minuteOfOutsideHourly);
  }

  // Day-of-week field — canonical weekday block is "1-5": when the final
  // merged set (named days + weekday/weekend flags) is exactly {1,2,3,4,5},
  // emit "1-5", not "1,2,3,4,5".
  const dowField = ((): string | null => {
    const set = new Set(days);
    if (weekdays) for (const d of [1, 2, 3, 4, 5]) set.add(d);
    if (weekends) {
      set.add(0);
      set.add(6);
    }
    if (set.size === 0) return null;
    if (set.size === 7) return "*";
    const sorted = [...set].sort((a, b) => a - b);
    if (sorted.join(",") === "1,2,3,4,5") return "1-5";
    return sorted.join(",");
  })();

  const okResult = (cron: string): ParseResult => {
    const description = describeCron(cron, opts);
    /* v8 ignore start -- unreachable: the assembler only emits describable shapes */
    if (!description) {
      return fail("unrecognized", E.buildFailed);
    }
    /* v8 ignore stop */
    return { ok: true, cron, description, assumptions };
  };

  type ResolvedTime = { minute: number; hours: number[] };

  const resolveTime = (): ResolvedTime | ParseError => {
    if (times.length === 0) {
      assumptions.push({ text: A.defaultTime });
      return { minute: 0, hours: [9] };
    }
    const minute = times[0].minute;
    if (times.some((t) => t.minute !== minute)) {
      return fail("unsupported", E.multipleMinutes);
    }
    for (const t of times) {
      if (!t.assumedMeridiem) continue;
      const flippedHour = t.hour === 12 ? 0 : t.hour + 12;
      // The locale decides how (and whether) the flipped reading can be
      // written as input: null means no flip phrasing exists (24-hour-only
      // locales), so the assumption is surfaced without an alternative.
      const flippedToken = loc.format.flipToken(flippedHour, t.minute);
      assumptions.push({
        text: A.assumedMeridiem(t.raw, loc.format.time(t.hour, t.minute)),
        ...(flippedToken !== null && {
          alternative: {
            label: A.flipLabel(loc.format.time(flippedHour, t.minute)),
            input: trimmed
              .normalize("NFC")
              .toLowerCase()
              .replace(new RegExp(`(?<!\\d)${t.raw}(?!\\d)`), flippedToken),
          },
        }),
      });
    }
    const hours = [...new Set(times.map((t) => t.hour))].sort((a, b) => a - b);
    return { minute, hours };
  };

  // Assembly, most-specific first
  if (intervalUnit === "minute") {
    if (intervalN === null || intervalN < 1 || intervalN > 59) {
      return fail("unsupported", E.minuteIntervalOutOfRange);
    }
    if (times.length > 0) {
      return fail("unsupported", E.intervalWithTime("minute"));
    }
    if (doms.length > 0 || monthly) {
      return fail("unsupported", E.intervalWithDom("minute"));
    }
    return okResult(`*/${intervalN} * * * ${dowField ?? "*"}`);
  }

  if (intervalUnit === "hour") {
    if (intervalN === null || intervalN < 1 || intervalN > 23) {
      return fail("unsupported", E.hourIntervalOutOfRange);
    }
    if (times.length > 0) {
      return fail("unsupported", E.intervalWithTime("hour"));
    }
    if (doms.length > 0 || monthly) {
      return fail("unsupported", E.intervalWithDom("hour"));
    }
    return okResult(`${minuteOf ?? 0} */${intervalN} * * ${dowField ?? "*"}`);
  }

  if (freq === "minutely") {
    if (times.length > 0 || doms.length > 0 || monthly) {
      return fail("unsupported", E.everyMinuteWithExtras);
    }
    return okResult(`* * * * ${dowField ?? "*"}`);
  }

  if (freq === "hourly") {
    if (times.length > 0) {
      return fail("unsupported", E.hourlyWithTime);
    }
    if (doms.length > 0 || monthly) {
      return fail("unsupported", E.hourlyWithDom);
    }
    return okResult(`${minuteOf ?? 0} * * * ${dowField ?? "*"}`);
  }

  if (doms.length > 0 || monthly) {
    // Cron OR-combines the two day fields, so both may be set only when the user
    // explicitly said "or" (e.g. "1st and 15th, or fridays"). An implicit pairing
    // ("mondays on the 15th") means AND, which cron can't express — reject it.
    if (dowField && !sawOr) {
      return fail("unsupported", E.bothDayFields);
    }
    const monthDays = doms.length > 0 ? doms : [1];
    if (doms.length === 0) {
      assumptions.push({ text: A.defaultDayMonth });
    }
    for (const day of [...new Set(monthDays)].sort((a, b) => a - b)) {
      if (day >= 29) {
        assumptions.push({ text: A.shortMonthSkip(day) });
      }
    }
    const time = resolveTime();
    if ("ok" in time) return time;
    const domField = [...new Set(monthDays)].sort((a, b) => a - b).join(",");
    const dowPart = sawOr && dowField ? dowField : "*";
    return okResult(`${time.minute} ${time.hours.join(",")} ${domField} * ${dowPart}`);
  }

  if (dowField || freq === "daily" || freq === "weekly" || times.length > 0) {
    let field = dowField;
    if (freq === "weekly" && !field) {
      field = "1";
      assumptions.push({ text: A.defaultDayWeek });
    }
    const time = resolveTime();
    if ("ok" in time) return time;
    return okResult(`${time.minute} ${time.hours.join(",")} * * ${field ?? "*"}`);
  }

  return fail("unrecognized", E.unreadable);
}
