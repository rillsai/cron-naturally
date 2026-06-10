export interface Assumption {
  /** Shown inline, e.g. "Read \"9\" as 9:00 AM." */
  text: string;
  /** One-click correction: replaces the input text wholesale. */
  alternative?: { label: string; input: string };
}

export interface ParseOk {
  ok: true;
  cron: string;
  /** Canonical phrasing in the active locale. Re-parses to a semantically identical cron. */
  description: string;
  assumptions: Assumption[];
}

export interface ParseError {
  ok: false;
  reason: "empty" | "unrecognized" | "unsupported";
  /** Warm, specific, never blames. */
  hint: string;
  /** Up to two clickable example phrasings. */
  suggestions: string[];
}

export type ParseResult = ParseOk | ParseError;
