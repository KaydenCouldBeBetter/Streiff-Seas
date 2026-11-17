// Length entry (web/src/lib/lengthEntry.ts): to the eighth inch, stored as quarter inches rounded
// down (scoring.md §4 and example 6), with the rounded value previewed before sending.

import { describe, expect, it } from "vitest";
import {
  EIGHTHS_LABELS,
  EMPTY_LENGTH,
  enteredLengthText,
  lengthEntryFromQ,
  lengthPreview,
  lengthProblemCopy,
  parseLength,
} from "../web/src/lib/lengthEntry";
import { lengthText } from "../web/src/lib/liveBoard";

describe("scoring.md example 6", () => {
  it.each([
    // One board reads 17 5/8 in; another reads 14 7/8 in → 17 1/2 in (70) and 14 3/4 in (59).
    ["17", 5, 70, "17 1/2 in"],
    ["14", 7, 59, "14 3/4 in"],
  ])("%s and %i/8 in is stored as %i and counts as %s", (inches, eighths, q, shown) => {
    const entry = { inches, eighths };

    expect(parseLength(entry)).toEqual({ ok: true, q });
    expect(lengthText(q)).toBe(shown);
    expect(lengthPreview(entry)).toBe(`Counts as ${shown} (rounded down to the quarter inch)`);
  });
});

describe("parseLength", () => {
  it("rounds every eighth down to the quarter", () => {
    const q = EIGHTHS_LABELS.map((_, eighths) => (parseLength({ inches: "17", eighths }) as { q: number }).q);

    expect(q).toEqual([68, 68, 69, 69, 70, 70, 71, 71]);
  });

  it.each([
    [{ inches: "", eighths: 0 }, "missing"],
    [{ inches: "  ", eighths: 5 }, "missing"],
    [{ inches: "17.5", eighths: 0 }, "format"],
    [{ inches: "-3", eighths: 0 }, "format"],
    [{ inches: "abc", eighths: 0 }, "format"],
    [{ inches: "17", eighths: 8 }, "format"],
    [{ inches: "17", eighths: 2.5 }, "format"],
    // The rule needs length_q > 0; 1/8 in rounds down to 0.
    [{ inches: "0", eighths: 0 }, "zero"],
    [{ inches: "0", eighths: 1 }, "zero"],
  ] as const)("%o is %s", (entry, problem) => {
    expect(parseLength(entry)).toEqual({ ok: false, problem });
  });

  it("accepts the smallest length the rule allows, a quarter inch", () => {
    expect(parseLength({ inches: "0", eighths: 2 })).toEqual({ ok: true, q: 1 });
  });

  it("starts empty", () => {
    expect(parseLength(EMPTY_LENGTH)).toEqual({ ok: false, problem: "missing" });
  });
});

describe("lengthEntryFromQ", () => {
  it("reads back exactly for every stored length, so an untouched Edit sends nothing", () => {
    for (let q = 1; q <= 200; q++) expect(parseLength(lengthEntryFromQ(q))).toEqual({ ok: true, q });
  });

  it("opens 70 as 17 and 4/8, previewed without the rounding note", () => {
    const entry = lengthEntryFromQ(70);

    expect(entry).toEqual({ inches: "17", eighths: 4 });
    expect(lengthPreview(entry)).toBe("Counts as 17 1/2 in");
  });
});

describe("copy", () => {
  it("writes what was entered, to the eighth", () => {
    expect(enteredLengthText({ inches: "17", eighths: 5 })).toBe("17 5/8 in");
    expect(enteredLengthText({ inches: "18", eighths: 0 })).toBe("18 in");
  });

  it("previews nothing until the entry is valid", () => {
    expect(lengthPreview({ inches: "", eighths: 5 })).toBeNull();
    expect(lengthPreview({ inches: "0", eighths: 1 })).toBeNull();
  });

  it("has an error line for format and zero, none for missing", () => {
    expect(lengthProblemCopy("missing")).toBeNull();
    expect(lengthProblemCopy("format")).toMatch(/whole inches/);
    expect(lengthProblemCopy("zero")).toBe("Enter a length of at least 1/4 in.");
  });
});
