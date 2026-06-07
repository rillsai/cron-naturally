export interface ParsedTime {
  hour: number; // 0-23
  minute: number; // 0-59
  /** True when AM was assumed on a bare hour ("at 9", "9:30", bare "12" = noon). */
  assumedMeridiem: boolean;
}

/**
 * Parse one (possibly merged) time token. Accepted forms:
 * noon, midnight, 9am, 9:30pm, 21:00, 2100/900 (military), bare 0-23.
 * Bare 1-11 assume AM; bare 12 assumes noon; both flagged assumedMeridiem
 * so the caller can surface the assumption with a one-click flip.
 */
export function parseTimeToken(token: string): ParsedTime | null {
  if (token === "noon") return { hour: 12, minute: 0, assumedMeridiem: false };
  if (token === "midnight") return { hour: 0, minute: 0, assumedMeridiem: false };

  const meridiem = token.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem[3] === "pm" && hour !== 12) hour += 12;
    if (meridiem[3] === "am" && hour === 12) hour = 0;
    return { hour, minute, assumedMeridiem: false };
  }

  const colon = token.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, assumedMeridiem: hour >= 1 && hour <= 12 };
  }

  if (/^\d{3,4}$/.test(token)) {
    const minute = Number(token.slice(-2));
    const hour = Number(token.slice(0, -2));
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, assumedMeridiem: false };
  }

  if (/^\d{1,2}$/.test(token)) {
    const hour = Number(token);
    if (hour > 23) return null;
    if (hour === 0 || hour >= 13) return { hour, minute: 0, assumedMeridiem: false };
    return { hour, minute: 0, assumedMeridiem: true };
  }

  return null;
}

/** Canonical 12-hour string: "9:05 AM", "12:00 PM". */
export function formatTime12(hour: number, minute: number): string {
  const meridiem = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}
