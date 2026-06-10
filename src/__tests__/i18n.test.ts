import { describe, expect, it } from "vitest";
import { explainCronFields } from "../explain";
import { DEFAULT_LOCALE, type Locale, LOCALES, resolveLocale } from "../i18n/index";
import { parseNaturalSchedule } from "../parse";

describe("locale registry", () => {
  it("defaults to English and exposes it in the registry", () => {
    expect(DEFAULT_LOCALE.code).toEqual("en");
    expect(LOCALES.en).toBe(DEFAULT_LOCALE);
  });

  it("resolveLocale falls back to the default when no locale is given", () => {
    expect(resolveLocale()).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ locale: LOCALES.en })).toBe(LOCALES.en);
  });

  it("English singularize strips a trailing s, else returns null", () => {
    const { singularize } = DEFAULT_LOCALE.lexicon;
    expect(singularize("mondays")).toEqual("monday");
    expect(singularize("monday")).toEqual(null);
  });
});

describe("en formatters", () => {
  const { list, ordinal, flipToken } = DEFAULT_LOCALE.format;

  it("builds re-parseable flip tokens for every hour shape", () => {
    expect(flipToken(0, 0)).toEqual("midnight");
    expect(flipToken(0, 30)).toEqual("12:30am");
    expect(flipToken(9, 30)).toEqual("9:30am");
    expect(flipToken(12, 0)).toEqual("noon");
    expect(flipToken(12, 30)).toEqual("12:30pm");
    expect(flipToken(21, 0)).toEqual("9pm");
    expect(flipToken(21, 30)).toEqual("9:30pm");
  });

  it("joins lists with the right number of items", () => {
    expect(list([])).toEqual(""); // empty: the defensive `?? ""` branch
    expect(list(["a"])).toEqual("a");
    expect(list(["a", "b"])).toEqual("a and b");
    expect(list(["a", "b", "c"])).toEqual("a, b, and c");
  });

  it("formats every ordinal suffix, including the 11-13 exception", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });
});

// A deliberately European-shaped toy locale ("xx") exercising the contract
// features no English input can reach: accented + hyphenated day names, a
// rangeWord that doubles as a filler (Spanish "a"), fillers between keyword
// and number (French "toutes les 15 minutes"), locale ordinals ("1º"),
// locale clock formats ("9h30"), and a 24-hour culture with no flip phrasing.
describe("European-shaped toy locale", () => {
  const xx: Locale = {
    ...DEFAULT_LOCALE,
    code: "xx",
    lexicon: {
      ...DEFAULT_LOCALE.lexicon,
      fillers: new Set(["a", "las", "les", "el", "de"]),
      aliases: {
        cada: "every",
        toutes: "every",
        minutos: "minute",
        minutes: "minute",
        hasta: "through",
      },
      rangeWord: "a",
      compounds: {},
      singularize: () => null,
      ordinalDay: (token) => {
        const m = token.match(/^(\d{1,2})º$/);
        return m ? Number(m[1]) : null;
      },
    },
    days: {
      ...DEFAULT_LOCALE.days,
      fullNames: {
        domingo: 0,
        "segunda-feira": 1,
        martes: 2,
        miércoles: 3,
        jueves: 4,
        viernes: 5,
        sábado: 6,
      },
      abbreviations: { lun: 1, mié: 3, vie: 5 },
    },
    time: {
      ...DEFAULT_LOCALE.time,
      readClock: (token) => {
        const m = token.match(/^(\d{1,2})h(\d{2})?$/);
        return m ? { hour: Number(m[1]), minute: Number(m[2] ?? "0") } : null;
      },
    },
    format: { ...DEFAULT_LOCALE.format, flipToken: () => null },
  };
  const opts = { locale: xx };

  it("skips fillers between the interval keyword and the number", () => {
    const result = parseNaturalSchedule("toutes les 15 minutes", opts);
    expect(result.ok && result.cron).toEqual("*/15 * * * *");
  });

  it("reads the rangeWord positionally even though it is also a filler", () => {
    const range = parseNaturalSchedule("segunda-feira a viernes a las 9h", opts);
    expect(range.ok && range.cron).toEqual("0 9 * * 1-5");
    const time = parseNaturalSchedule("cada segunda-feira a las 9h", opts);
    expect(time.ok && time.cron).toEqual("0 9 * * 1");
  });

  it("expands accented abbreviation ranges and keeps hyphenated day names whole", () => {
    const abbrev = parseNaturalSchedule("lun-mié a las 9h", opts);
    expect(abbrev.ok && abbrev.cron).toEqual("0 9 * * 1,2,3");
    const hyphenated = parseNaturalSchedule("segunda-feira a las 21h30", opts);
    expect(hyphenated.ok && hyphenated.cron).toEqual("30 21 * * 1");
  });

  it("matches decomposed (NFD) input against composed day names", () => {
    // "sa" + combining acute + "bado": what macOS keyboards can emit.
    const nfd = "sa\u0301bado a las 10h";
    const result = parseNaturalSchedule(nfd, opts);
    expect(result.ok && result.cron).toEqual("0 10 * * 6");
  });

  it("reads locale ordinals for the day of the month", () => {
    const result = parseNaturalSchedule("el 1º a las 8h", opts);
    expect(result.ok && result.cron).toEqual("0 8 1 * *");
  });

  it("reads locale clock formats as explicit times, no meridiem assumption", () => {
    const result = parseNaturalSchedule("viernes a las 9h30", opts);
    expect(result.ok && result.cron).toEqual("30 9 * * 5");
    expect(result.ok && result.assumptions).toEqual([]);
  });

  it("surfaces the assumption without an alternative when flipToken is null", () => {
    const result = parseNaturalSchedule("viernes a las 9:30", opts);
    expect(result.ok && result.cron).toEqual("30 9 * * 5");
    if (!result.ok) return;
    expect(result.assumptions).toHaveLength(1);
    expect(result.assumptions[0].alternative).toBeUndefined();
  });

  it("hands atField the raw field name so locales control casing", () => {
    const de: Locale = {
      ...DEFAULT_LOCALE,
      messages: {
        ...DEFAULT_LOCALE.messages,
        explain: {
          ...DEFAULT_LOCALE.messages.explain,
          fieldNames: ["Minute", "Stunde", "Monatstag", "Monat", "Wochentag"],
          atField: (field, joined) => `um ${field} ${joined}`,
        },
      },
    };
    const rows = explainCronFields("30 * * * *", { locale: de });
    expect(rows?.[0].meaning).toEqual("um Minute 30");
  });
});
