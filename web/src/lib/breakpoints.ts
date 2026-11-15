// The three layout sizes (Figma "Desktop & responsive layout spec", 13 Nov 2026): compact is a
// phone, medium is an iPad in portrait or a small window with a rail, expanded has the sidebar
// and the side-by-side lists. The widths are in em (37.5em and 64em, build note 1), so a member who
// enlarges the text gets the simpler layout sooner. No DOM here, so tests can import it; the
// CSS in responsive.css repeats the two numbers and test/breakpoints.test.ts keeps them equal.

export type Breakpoint = "compact" | "medium" | "expanded";

/** Medium starts here: 600 px at the default 16 px text. */
export const MEDIUM_EM = 37.5;
/** Expanded starts here: 1024 px at the default 16 px text. */
export const EXPANDED_EM = 64;

export const MEDIUM_QUERY = `(min-width: ${MEDIUM_EM}em)`;
export const EXPANDED_QUERY = `(min-width: ${EXPANDED_EM}em)`;

/** Which layout a window of this width gets, given the root font size in px (16 unless enlarged). */
export function breakpointFor(widthPx: number, rootFontPx = 16): Breakpoint {
  if (widthPx >= EXPANDED_EM * rootFontPx) return "expanded";
  if (widthPx >= MEDIUM_EM * rootFontPx) return "medium";
  return "compact";
}
