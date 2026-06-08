import { SPECIAL_EQUIVALENTS } from "./cron.js";
import { DAY_LABELS } from "./days.js";
import { formatTime12 } from "./time.js";

export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Expand a dow field ("1-5", "0,6", "2-4", "7") to sorted day indices; null = invalid. */
function expandDow(field: string): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const range = part.match(/^(\d)-(\d)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > 7 || to > 7 || from > to) return null;
      for (let d = from; d <= to; d++) out.add(d === 7 ? 0 : d);
    } else if (/^\d$/.test(part)) {
      const d = Number(part);
      if (d > 7) return null;
      out.add(d === 7 ? 0 : d);
    } else {
      return null;
    }
  }
  return [...out].sort((a, b) => a - b);
}

function dowSuffix(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "";
  if (days.join(",") === "1,2,3,4,5") return " on weekdays";
  if (days.join(",") === "0,6") return " on weekends";
  return ` on ${listJoin(days.map((d) => DAY_LABELS[d]))}`;
}

/**
 * Canonical English for a cron expression, or null when outside the grammar.
 * Invariant (enforced by round-trip tests): every string this returns
 * re-parses via parseNaturalSchedule to a semantically identical cron.
 */
export function describeCron(cron: string): string | null {
  const trimmed = cron.trim();
  const resolved = SPECIAL_EQUIVALENTS[trimmed] ?? trimmed;
  const parts = resolved.split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dowField] = parts;
  if (month !== "*") return null; // month restrictions are outside the v1 grammar
  const days = dowField === "*" ? null : expandDow(dowField);
  if (dowField !== "*" && (days === null || days.length === 0)) return null;

  if (min === "*" && hour === "*" && dom === "*") return `Every minute${dowSuffix(days)}`;
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === "*" && dom === "*") {
    return `Every ${minStep[1]} minutes${dowSuffix(days)}`;
  }

  if (!/^\d+$/.test(min)) return null;
  const minute = Number(min);
  if (minute > 59) return null;

  if (hour === "*" && dom === "*") {
    const at = minute > 0 ? ` at minute ${minute}` : "";
    return `Every hour${at}${dowSuffix(days)}`;
  }
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep && dom === "*") {
    const at = minute > 0 ? ` at minute ${minute}` : "";
    return `Every ${hourStep[1]} hours${at}${dowSuffix(days)}`;
  }

  if (!/^\d+(,\d+)*$/.test(hour)) return null;
  const hours = hour.split(",").map(Number);
  if (hours.some((h) => h > 23)) return null;
  const timeList = listJoin(hours.map((h) => formatTime12(h, minute)));

  if (/^\d+$/.test(dom)) {
    if (dowField !== "*") return null; // dom+dow OR-semantics: refuse to describe
    const day = Number(dom);
    if (day < 1 || day > 31) return null;
    return `Monthly on the ${ordinal(day)} at ${timeList}`;
  }
  if (dom !== "*") return null;

  if (days && days.length > 0 && days.length < 7) {
    if (days.join(",") === "1,2,3,4,5") return `Weekdays at ${timeList}`;
    if (days.join(",") === "0,6") return `Weekends at ${timeList}`;
    return `Every ${listJoin(days.map((d) => DAY_LABELS[d]))} at ${timeList}`;
  }
  return `Every day at ${timeList}`;
}
