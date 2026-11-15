import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPANDED_EM, EXPANDED_QUERY, MEDIUM_EM, MEDIUM_QUERY, breakpointFor } from "../web/src/lib/breakpoints";

// The Figma "Desktop & responsive layout spec" table: compact under 600 px, medium 600 to 1023 px,
// expanded 1024 px and up, written in em so enlarged text gets the simpler layout sooner.
describe("breakpoints", () => {
  it("puts the edges where the spec table does, at the default text size", () => {
    expect(breakpointFor(390)).toBe("compact");
    expect(breakpointFor(599)).toBe("compact");
    expect(breakpointFor(600)).toBe("medium");
    expect(breakpointFor(834)).toBe("medium");
    expect(breakpointFor(1023)).toBe("medium");
    expect(breakpointFor(1024)).toBe("expanded");
    expect(breakpointFor(1440)).toBe("expanded");
  });

  it("gives the simpler layout sooner when the text is enlarged (spec build note 1)", () => {
    // At 200% zoom a 1440 window is 720 wide: medium. At 400% a 1280 window is 320 wide: compact.
    expect(breakpointFor(720)).toBe("medium");
    expect(breakpointFor(320)).toBe("compact");
    // A member whose text is 20 px: 750 px is the medium edge and 1280 px the expanded one.
    expect(breakpointFor(749, 20)).toBe("compact");
    expect(breakpointFor(750, 20)).toBe("medium");
    expect(breakpointFor(1279, 20)).toBe("medium");
    expect(breakpointFor(1280, 20)).toBe("expanded");
  });

  it("writes the two numbers in em", () => {
    expect(MEDIUM_QUERY).toBe("(min-width: 37.5em)");
    expect(EXPANDED_QUERY).toBe("(min-width: 64em)");
  });

  it("is the same pair of numbers the stylesheets use, with no px breakpoint left", () => {
    const index = readFileSync(join(import.meta.dirname, "../web/src/index.css"), "utf8");
    const responsive = readFileSync(join(import.meta.dirname, "../web/src/responsive.css"), "utf8");
    const widths = [...(index + responsive).matchAll(/@media \((?:min|max)-width: ([\d.]+)(em|px)\)/g)].map((m) => ({ value: Number(m[1]), unit: m[2] }));
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((w) => w.unit === "px")).toEqual([]);
    // A min-width edge is MEDIUM_EM or EXPANDED_EM; a max-width edge is one sixteenth of a px below one.
    const edges = new Set([MEDIUM_EM, EXPANDED_EM, MEDIUM_EM - 1 / 16, EXPANDED_EM - 1 / 16]);
    for (const w of widths) expect(edges.has(w.value)).toBe(true);
  });
});
