// How a Light icon becomes its Dark twin (web/public/icons/dark/). Each colour an icon draws is
// a Figma colour/icon/* token (or border/default for the radio's ring), so the Dark file takes
// that token's Dark value from the Figma Color collection, "Dark" mode. No DOM, no Node: the
// script scripts/make-dark-icons.mjs writes the files and test/darkIcons.test.ts checks that
// they are what this returns.

/** Light value (upper case) → Dark value, with the Figma token each pair comes from. */
export const DARK_ICON_COLORS: Readonly<Record<string, string>> = {
  "#0B1A26": "#EAF1F6", // icon/default      ink/900   → frost/100
  "#33434F": "#B7C5CF", // icon/secondary    ink/700   → frost/300
  "#0A4A6B": "#8ACFF2", // icon/primary      lake/700  → lake/300
  "#0B5530": "#8EDDAA", // icon/success      green/800 → green/300
  "#6B4100": "#F4C46E", // icon/warning      amber/800 → amber/300
  "#871B14": "#FFA59C", // icon/danger       red/800   → red/300
  "#3D4850": "#C3CDD4", // icon/neutral      slate/700 → slate/300
  "#5E6F7C": "#7D8E9A", // border/default    ink/500   → night/500 (the radio ring)
};

/** A white stroke is a mark on the primary fill (icon/on-primary: white → lake/950). */
export const DARK_ON_PRIMARY = "#04202F";
/** A white fill is the surface inside a shape (bg/default: white → night/950). */
export const DARK_SURFACE = "#0B141B";

const PAINT = /\b(fill|stroke)="([^"]*)"/g;
const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** The Dark twin of a Light icon's SVG text. Throws on a colour it has no Dark value for. */
export function darkSvg(svg: string, name = "icon"): string {
  const out = svg.replace(PAINT, (whole, attr: string, value: string) => {
    if (value === "none") return whole;
    if (value.toLowerCase() === "white") return `${attr}="${attr === "stroke" ? DARK_ON_PRIMARY : DARK_SURFACE}"`;
    const dark = DARK_ICON_COLORS[value.toUpperCase()];
    if (dark === undefined) throw new Error(`${name}: no Dark colour for ${attr}="${value}" (add it to DARK_ICON_COLORS)`);
    return `${attr}="${dark}"`;
  });
  // A colour set any other way (style=, stop-color) would slip through, so refuse it.
  const painted = new Set([...svg.matchAll(PAINT)].map((m) => m[2]!.toUpperCase()));
  for (const hex of svg.match(ANY_HEX) ?? []) {
    if (!painted.has(hex.toUpperCase())) throw new Error(`${name}: colour ${hex} is not a fill or stroke attribute`);
  }
  return out;
}
