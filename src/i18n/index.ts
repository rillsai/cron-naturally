import { en } from "./en.js";
import type { Locale } from "./types.js";

export type { Locale } from "./types.js";

/** The default locale used when a caller does not pass one. */
export const DEFAULT_LOCALE: Locale = en;

/** All bundled locales, keyed by code. Add a language by registering it here. */
export const LOCALES: Readonly<Record<string, Locale>> = { en };

/** Options accepted by the public language-aware entry points. */
export interface LocaleOptions {
  /** Locale bundle to parse/describe in. Defaults to {@link DEFAULT_LOCALE} (en). */
  locale?: Locale;
}

/** Resolve the effective locale from caller options. */
export function resolveLocale(opts?: LocaleOptions): Locale {
  return opts?.locale ?? DEFAULT_LOCALE;
}
