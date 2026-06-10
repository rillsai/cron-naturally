import { CRON_REGEX, isRunnableCron, SPECIAL_EQUIVALENTS } from "./cron.js";
import { domPhrase } from "./describe.js";
import { type LocaleOptions, resolveLocale } from "./i18n/index.js";
import type { Locale } from "./i18n/types.js";

export interface CronFieldExplanation {
  field: string;
  value: string;
  meaning: string;
}

/** Inclusive upper bound per field — a bare step ("5/15") runs from its start to this. */
const FIELD_MAX = [59, 23, 31, 12, 7] as const;

function label(index: number, n: number, loc: Locale): string {
  if (index === 4) return loc.days.labels[n === 7 ? 0 : n] ?? String(n);
  if (index === 3) return loc.messages.explain.monthLabels[n - 1] ?? String(n);
  return String(n);
}

/** A field is "restricted" only when it is neither "*" nor a step starting with "*". */
function isRestricted(value: string): boolean {
  return value !== "*" && !value.startsWith("*");
}

function explainField(index: number, value: string, loc: Locale): string {
  const E = loc.messages.explain;
  if (value === "*") return E.every[index];
  const step = value.match(/^\*\/(\d+)$/);
  if (step) return E.everyNUnits(step[1], E.stepUnits[index]);
  if (index === 2 && !value.includes("/")) return E.onDom(domPhrase(value, loc));
  const parts = value.split(",").map((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range)
      return loc.format.range(
        label(index, Number(range[1]), loc),
        label(index, Number(range[2]), loc),
      );
    const stepped = part.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (stepped) {
      return E.everyNFromThrough(
        stepped[3],
        E.stepUnits[index],
        label(index, Number(stepped[1]), loc),
        label(index, Number(stepped[2]), loc),
      );
    }
    // A bare step ("5/15") runs from its start to the field maximum.
    const bareStep = part.match(/^(\d+)\/(\d+)$/);
    if (bareStep) {
      return E.everyNFromThrough(
        bareStep[2],
        E.stepUnits[index],
        label(index, Number(bareStep[1]), loc),
        label(index, FIELD_MAX[index], loc),
      );
    }
    return label(index, Number(part), loc);
  });
  const joined = parts.join(", ");
  if (index === 4 || index === 3) return joined;
  // A lone step phrase ("every 15 minutes from 5 through 59") already names
  // its unit; prefixing the field name would double it up.
  if (value.includes("/") && !value.includes(",")) return joined;
  return E.atField(E.fieldNames[index], joined);
}

/** Field-by-field anatomy for the explain mode table. Null for invalid crons. */
export function explainCronFields(
  cron: string,
  opts?: LocaleOptions,
): CronFieldExplanation[] | null {
  const loc = resolveLocale(opts);
  const E = loc.messages.explain;
  const resolved = SPECIAL_EQUIVALENTS[cron.trim()] ?? cron.trim();
  if (!CRON_REGEX.test(resolved)) return null;
  if (!isRunnableCron(resolved)) return null; // shape-valid but a field never matches (e.g. "60 99 * * *")
  const parts = resolved.split(/\s+/);
  /* v8 ignore next -- unreachable: CRON_REGEX above already requires exactly 5 fields */
  if (parts.length !== 5) return null;
  const rows: CronFieldExplanation[] = parts.map((value, i) => ({
    field: E.fieldNames[i],
    value,
    meaning: explainField(i, value, loc),
  }));

  // The dom/dow OR trap: when both day fields are restricted, cron fires when
  // EITHER matches, not both. Surface it as an explicit extra row so the table
  // reads the way the crontab(5) man page describes the behavior.
  const [, , dom, , dow] = parts;
  if (isRestricted(dom) && isRestricted(dow)) {
    // A stepped dom ("5/10") has no ordinal phrase; reuse its field meaning.
    const domMeaning = dom.includes("/") ? explainField(2, dom, loc) : E.onDom(domPhrase(dom, loc));
    rows.push({
      field: E.dayRuleField,
      value: E.dayRuleValue,
      meaning: E.dayRuleMeaning(domMeaning, explainField(4, dow, loc)),
    });
  }

  return rows;
}
