// Weight entry (SUB-01a; later MY-03a and JDG-04a): what the angler types, in either format,
// to the stored integer `weight_hoz`, hundredths of an ounce (scoring.md §4: 3 lb 7 oz = 5,500,
// 3.43 lb = 5,488). Pure: no DOM, no PocketBase. Entry only; scoring and display rounding
// belong to scoring.ts.

/** Decimal pounds to two places, or pounds and ounces with ounces to one place (decisions.md 2026-10-02). */
export type WeightFormat = "lb" | "lb_oz";

/** The raw text of every field, so switching format never loses what was typed. */
export interface WeightEntry {
  format: WeightFormat;
  /** Decimal pounds, e.g. "3.44". */
  pounds: string;
  /** Whole pounds in the lb + oz format, e.g. "3". */
  wholePounds: string;
  /** Ounces in the lb + oz format, 0 to 15.9, e.g. "7.0". */
  ounces: string;
}

export const EMPTY_WEIGHT: WeightEntry = { format: "lb", pounds: "", wholePounds: "", ounces: "" };

/** missing: nothing typed. format: not a number in this format. zero: not above 0. ounces: over 15.9. */
export type WeightProblem = "missing" | "format" | "zero" | "ounces";

export type WeightResult = { ok: true; hoz: number } | { ok: false; problem: WeightProblem };

const HOZ_PER_POUND = 1600;
// Some keyboards type a comma as the decimal mark.
const clean = (text: string) => text.trim().replace(",", ".");

const DECIMAL_POUNDS = /^(\d*)(?:\.(\d{0,2}))?$/;
const WHOLE = /^\d*$/;
const OUNCES = /^(\d*)(?:\.(\d?))?$/;

/** "." alone matches the patterns but has no digits. */
const noDigits = (match: RegExpExecArray) => match[1] === "" && !match[2];

function checked(hoz: number): WeightResult {
  if (!Number.isSafeInteger(hoz)) return { ok: false, problem: "format" };
  if (hoz <= 0) return { ok: false, problem: "zero" };
  return { ok: true, hoz };
}

/** Reads the fields of the entry's current format. */
export function parseWeight(entry: WeightEntry): WeightResult {
  if (entry.format === "lb") {
    const text = clean(entry.pounds);
    if (text === "") return { ok: false, problem: "missing" };
    const match = DECIMAL_POUNDS.exec(text);
    if (!match || noDigits(match)) return { ok: false, problem: "format" };
    const hundredths = Number(match[1] || "0") * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    return checked(hundredths * (HOZ_PER_POUND / 100));
  }

  const pounds = clean(entry.wholePounds);
  const ounces = clean(entry.ounces);
  if (pounds === "" && ounces === "") return { ok: false, problem: "missing" };
  const ounceMatch = OUNCES.exec(ounces);
  if (!WHOLE.test(pounds) || !ounceMatch || (ounces !== "" && noDigits(ounceMatch))) return { ok: false, problem: "format" };
  const tenths = Number(ounceMatch[1] || "0") * 10 + Number(ounceMatch[2] || "0");
  if (tenths > 159) return { ok: false, problem: "ounces" };
  return checked(Number(pounds || "0") * HOZ_PER_POUND + tenths * 10);
}

/**
 * Switches format and keeps every field's text. If the other format's fields are empty and
 * the current value is exact in it, they're filled in: 3 lb 7.0 oz becomes 3.44 lb only if
 * it were exactly 3.44 lb (it's 3.4375, so it isn't). Switching back always restores the text.
 */
export function switchWeightFormat(entry: WeightEntry, format: WeightFormat): WeightEntry {
  if (format === entry.format) return entry;
  const next = { ...entry, format };
  const value = parseWeight(entry);
  if (!value.ok) return next;
  if (format === "lb_oz" && entry.wholePounds === "" && entry.ounces === "" && value.hoz % 10 === 0) {
    const tenths = (value.hoz % HOZ_PER_POUND) / 10;
    return { ...next, wholePounds: String(Math.floor(value.hoz / HOZ_PER_POUND)), ounces: `${Math.floor(tenths / 10)}.${tenths % 10}` };
  }
  if (format === "lb" && entry.pounds === "" && value.hoz % 16 === 0) {
    const hundredths = value.hoz / 16;
    return { ...next, pounds: `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}` };
  }
  return next;
}

/** The weight as the angler typed it, for "Catch as entered": "3.44 lb", "3 lb 7.0 oz". */
export function enteredWeightText(entry: WeightEntry): string {
  if (entry.format === "lb") return `${clean(entry.pounds)} lb`;
  const pounds = clean(entry.wholePounds) || "0";
  const ounces = clean(entry.ounces) || "0";
  return `${pounds} lb ${ounces.includes(".") ? ounces : `${ounces}.0`} oz`;
}

/** The field's error line, or null when there's nothing to say (missing shows in the "To send, add" line). */
export function weightProblemCopy(problem: WeightProblem, format: WeightFormat): string | null {
  switch (problem) {
    case "missing":
      return null;
    case "zero":
      return "Enter a weight above 0.";
    case "ounces":
      return "Ounces go from 0 to 15.9.";
    case "format":
      return format === "lb" ? "Use numbers only, up to 2 decimals, like 3.44." : "Use whole pounds, and ounces to 1 decimal, like 7.0.";
  }
}
