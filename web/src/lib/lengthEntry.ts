// Length entry (SUB-01b, MY-03a; later JDG-04a): whole inches plus eighths, as a measuring board
// reads, to the stored integer `length_q` in quarter inches, rounded DOWN (scoring.md §4,
// example 6: 17 5/8 in is 70, 14 7/8 in is 59). The rounded value is previewed before sending
// (screens.md SUB-01b; Figma Length input). Pure: no DOM, no PocketBase. Display units never
// change lengths.

import { lengthText } from "./liveBoard";

export interface LengthEntry {
  /** Whole inches as typed, e.g. "17". */
  inches: string;
  /** Eighths of an inch, 0 to 7, from the eighths sheet. */
  eighths: number;
}

export const EMPTY_LENGTH: LengthEntry = { inches: "", eighths: 0 };

/** The eighths sheet's options, in order (Figma Length input notes: 0 to 7/8). */
export const EIGHTHS_LABELS: readonly string[] = ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"];

/** missing: no inches typed. format: not a whole number. zero: rounds to 0, which the rule refuses. */
export type LengthProblem = "missing" | "format" | "zero";

export type LengthResult = { ok: true; q: number } | { ok: false; problem: LengthProblem };

const WHOLE = /^\d+$/;

export function parseLength(entry: LengthEntry): LengthResult {
  const inches = entry.inches.trim();
  if (inches === "") return { ok: false, problem: "missing" };
  if (!WHOLE.test(inches) || !Number.isInteger(entry.eighths) || entry.eighths < 0 || entry.eighths > 7) return { ok: false, problem: "format" };
  const q = Number(inches) * 4 + Math.floor(entry.eighths / 2);
  if (!Number.isSafeInteger(q)) return { ok: false, problem: "format" };
  if (q <= 0) return { ok: false, problem: "zero" };
  return { ok: true, q };
}

/** A stored length as an entry to edit (MY-03a). Exact, so an untouched entry reads back the same. */
export function lengthEntryFromQ(q: number): LengthEntry {
  return { inches: String(Math.floor(q / 4)), eighths: (q % 4) * 2 };
}

/** The length as the angler entered it, for "Catch as entered": "17 5/8 in", "18 in". */
export function enteredLengthText(entry: LengthEntry): string {
  const inches = entry.inches.trim() || "0";
  return entry.eighths === 0 ? `${inches} in` : `${inches} ${EIGHTHS_LABELS[entry.eighths]} in`;
}

/** The preview under the fields, or null until the entry is valid. */
export function lengthPreview(entry: LengthEntry): string | null {
  const result = parseLength(entry);
  if (!result.ok) return null;
  const counts = `Counts as ${lengthText(result.q)}`;
  return entry.eighths % 2 === 1 ? `${counts} (rounded down to the quarter inch)` : counts;
}

/** The field's error line, or null when there's nothing to say (missing shows in the "To send, add" line). */
export function lengthProblemCopy(problem: LengthProblem): string | null {
  switch (problem) {
    case "missing":
      return null;
    case "format":
      return "Use whole inches, like 17, and pick the eighths from the list.";
    case "zero":
      return "Enter a length of at least 1/4 in.";
  }
}
