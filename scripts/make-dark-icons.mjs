#!/usr/bin/env node
// Writes web/public/icons/dark/<name>.svg for every web/public/icons/<name>.svg, using the
// colour map in web/src/lib/darkIcons.ts (Node 24 runs the .ts file directly). Run it after
// adding or recolouring an icon, then commit the dark/ folder; `npm test` fails if it is stale.
//   node scripts/make-dark-icons.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { darkSvg } from "../web/src/lib/darkIcons.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lightDir = join(root, "web", "public", "icons");
const darkDir = join(lightDir, "dark");

mkdirSync(darkDir, { recursive: true });
let count = 0;
for (const file of readdirSync(lightDir).filter((f) => f.endsWith(".svg")).sort()) {
  writeFileSync(join(darkDir, file), darkSvg(readFileSync(join(lightDir, file), "utf8"), file));
  count += 1;
}
console.log(`Wrote ${count} Dark icons to web/public/icons/dark/`);
