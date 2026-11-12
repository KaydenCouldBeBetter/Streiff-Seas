import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK_ICON_COLORS, darkSvg } from "../web/src/lib/darkIcons";

// Dark mode against its Figma source: file x3HjJImlsriMAGxnsIhb7k, Color collection (Light and
// Dark modes), read 2026-11-12, and the section "Dark mode · key screens" (197:10639).
// [token, Light, Dark]. Alpha is written as in CSS (8 digits).
const FIGMA_COLORS: readonly (readonly [string, string, string])[] = [
  ["bg-default", "#ffffff", "#0b141b"],
  ["bg-sunken", "#eef3f6", "#16222c"],
  ["bg-selected", "#dcebf3", "#0f3245"],
  ["bg-primary", "#0a4a6b", "#8acff2"],
  ["bg-primary-pressed", "#083f5c", "#62b2dc"],
  ["bg-success", "#ddf0e3", "#0f2f1e"],
  ["bg-warning", "#fbebcb", "#3a2706"],
  ["bg-danger", "#f9dedb", "#3d1411"],
  ["bg-neutral", "#e6eaed", "#22303b"],
  ["bg-danger-strong", "#871b14", "#ffa59c"],
  ["bg-disabled", "#e6eaed", "#22303b"],
  ["bg-backdrop", "#0b1a2666", "#00000099"],
  ["text-default", "#0b1a26", "#eaf1f6"],
  ["text-secondary", "#33434f", "#b7c5cf"],
  ["text-on-primary", "#ffffff", "#04202f"],
  ["text-link", "#0a4a6b", "#8acff2"],
  ["text-success", "#0b5530", "#8eddaa"],
  ["text-warning", "#6b4100", "#f4c46e"],
  ["text-danger", "#871b14", "#ffa59c"],
  ["text-neutral", "#3d4850", "#c3cdd4"],
  ["text-disabled", "#33434f", "#b7c5cf"],
  ["border-default", "#5e6f7c", "#7d8e9a"],
  ["border-selected", "#0a4a6b", "#8acff2"],
  ["border-divider", "#eef3f6", "#22303b"],
  ["border-focus", "#0a4a6b", "#8acff2"],
  ["border-success", "#0b5530", "#8eddaa"],
  ["border-warning", "#6b4100", "#f4c46e"],
  ["border-danger", "#871b14", "#ffa59c"],
  ["border-neutral", "#3d4850", "#c3cdd4"],
  ["border-on-primary", "#ffffff", "#04202f"],
  ["icon-default", "#0b1a26", "#eaf1f6"],
  ["icon-secondary", "#33434f", "#b7c5cf"],
  ["icon-primary", "#0a4a6b", "#8acff2"],
  ["icon-on-primary", "#ffffff", "#04202f"],
  ["icon-success", "#0b5530", "#8eddaa"],
  ["icon-warning", "#6b4100", "#f4c46e"],
  ["icon-danger", "#871b14", "#ffa59c"],
  ["icon-neutral", "#3d4850", "#c3cdd4"],
  ["icon-disabled", "#5e6f7c", "#7d8e9a"],
];

const root = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(root, "web/src/index.css"), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--cf-color-[a-z-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim().toLowerCase();
  return out;
}

/** Comments out, so a note inside a block can't look like a declaration or a colour. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

function blockOf(selector: string): string {
  const start = code.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`index.css has no ${selector} block`);
  return code.slice(start, code.indexOf("\n}", start) + 2);
}

const light = tokens(blockOf(":root"));
const dark = tokens(blockOf(':root[data-theme="dark"]'));

describe("colour tokens against the Figma Color collection", () => {
  it("covers all 39 colour variables", () => {
    expect(FIGMA_COLORS).toHaveLength(39);
  });

  it.each(FIGMA_COLORS)("%s: Light %s, Dark %s", (name, lightValue, darkValue) => {
    expect(light[`--cf-color-${name}`]).toBe(lightValue);
    expect(dark[`--cf-color-${name}`]).toBe(darkValue);
  });

  it("sets in Dark every colour token Light sets, and no others", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("changes nothing but colours in Dark, apart from color-scheme", () => {
    const body = blockOf(':root[data-theme="dark"]');
    const props = [...body.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]!);
    expect(props.filter((p) => !p.startsWith("--cf-color-"))).toEqual(["color-scheme"]);
    expect(body).toContain("color-scheme: dark;");
  });
});

describe("no screen holds a colour of its own", () => {
  it("has no colour literal in index.css outside the token blocks and the dev-only TODO tag", () => {
    const stripped = code
      .replace(blockOf(":root"), "")
      .replace(blockOf(':root[data-theme="dark"]'), "")
      .replace(/\.todo-tag \{[\s\S]*?\n\}/, "");
    expect(stripped.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []).toEqual([]);
  });

  it("has no colour literal in the app's TSX", () => {
    const hits: string[] = [];
    for (const file of walk(join(root, "web/src"), ".tsx")) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b|\brgba?\(/g)) hits.push(`${file}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("icons in Dark", () => {
  const lightDir = join(root, "web/public/icons");
  const darkDir = join(lightDir, "dark");
  const names = readdirSync(lightDir).filter((f) => f.endsWith(".svg"));

  it("has a Dark twin for every icon, and nothing else", () => {
    expect(readdirSync(darkDir).sort()).toEqual([...names].sort());
  });

  it.each(names)("%s is exactly what scripts/make-dark-icons.mjs makes", (name) => {
    const expected = darkSvg(readFileSync(join(lightDir, name), "utf8"), name);
    expect(readFileSync(join(darkDir, name), "utf8")).toBe(expected);
  });

  it("uses no Light colour in a Dark icon", () => {
    for (const name of names) {
      const text = readFileSync(join(darkDir, name), "utf8").toUpperCase();
      for (const lightHex of Object.keys(DARK_ICON_COLORS)) expect(text, name).not.toContain(`"${lightHex}"`);
      expect(text, name).not.toContain('"WHITE"');
    }
  });

  it("refuses a colour it has no Dark value for, so a new icon can't slip through", () => {
    expect(() => darkSvg('<svg><path stroke="#123456"/></svg>', "x.svg")).toThrow(/no Dark colour/);
    expect(() => darkSvg('<svg><path style="stroke:#0B1A26"/></svg>', "x.svg")).toThrow(/not a fill or stroke/);
  });

  it("only names icons that exist, in both sets", () => {
    const used = new Set<string>();
    for (const file of [...walk(join(root, "web/src"), ".tsx"), ...walk(join(root, "web/src"), ".ts")]) {
      for (const m of readFileSync(file, "utf8").matchAll(/\/icons\/([a-z0-9-]+\.svg)/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const name of used) {
      expect(names, name).toContain(name);
    }
  });

  it("is drawn only through <Icon>, never a bare <img> (an <img> can't follow the theme)", () => {
    const bare: string[] = [];
    for (const file of walk(join(root, "web/src"), ".tsx")) {
      for (const m of readFileSync(file, "utf8").matchAll(/<img\b[^>]*>/g)) {
        // Photos (a URL from the data) are not icons; an icon is a path, an icon variable or a map lookup.
        if (/\/icons\/|\bicon\b|\bspinner\b|_ICON\b|selectedIcon/.test(m[0])) bare.push(`${file}: ${m[0]}`);
      }
    }
    expect(bare).toEqual([]);
  });
});

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, ext));
    else if (path.endsWith(ext)) out.push(path);
  }
  return out;
}
