// Looks for location data in a stored file, without using the hook code it is grading.
// Two independent views: this module's own walk of the bytes, and exiftool / exiv2 when they
// are installed (their output is evidence; the assertions use the walk, plus exiftool if present).

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The made-up spot in scripts/make-photo-fixtures.py, as digits that must not survive. */
const NEEDLES = ["43.1234", "77.5678", "7.404", "34.068", "GPSLatitude", "GPSLongitude", "ns.adobe.com", "Exif\0\0"];

export function haveTool(name: string): boolean {
  return spawnSync(name, ["-ver"], { stdio: "ignore" }).error === undefined || spawnSync(name, ["--version"], { stdio: "ignore" }).error === undefined;
}

/** What the file carries that could hold a location, as short labels. Empty means none found. */
export function leaksIn(bytes: Buffer): string[] {
  const found: string[] = [];
  const text = bytes.toString("latin1");
  for (const needle of NEEDLES) if (text.includes(needle)) found.push(`bytes:${needle.replace("\0", "\\0")}`);

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 4 <= bytes.length && bytes[i] === 0xff; ) {
      const marker = bytes[i + 1]!;
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(i + 2);
      if (marker === 0xe1) found.push(`jpeg:APP1(${bytes.toString("latin1", i + 4, i + 8)})`);
      if (marker === 0xed) found.push("jpeg:APP13");
      if (marker === 0xfe) found.push("jpeg:COM");
      i += 2 + length;
    }
  } else if (bytes.toString("latin1", 1, 4) === "PNG") {
    for (let i = 8; i + 8 <= bytes.length; ) {
      const length = bytes.readUInt32BE(i);
      const type = bytes.toString("latin1", i + 4, i + 8);
      if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type)) found.push(`png:${type}`);
      if (type === "IEND") break;
      i += 12 + length;
    }
  } else if (bytes.toString("latin1", 4, 8) === "ftyp") {
    // HEIF: location lives in an Exif item or XMP item inside the meta box. Not walked here;
    // exiftool is the check for these.
    if (text.includes("Exif") || text.includes("mime")) found.push("heif:Exif-or-XMP-item-present");
  }
  return [...new Set(found)];
}

/** Human-readable dump for the evidence file: exiftool if installed, else exiv2, else says so. */
export function dump(file: string): string {
  const attempts: [string, string[]][] = [
    ["exiftool", ["-a", "-G1", "-s", file]],
    ["exiv2", ["-pa", file]],
  ];
  for (const [tool, args] of attempts) {
    const r = spawnSync(tool, args, { encoding: "utf8" });
    if (r.error === undefined) {
      const out = `${r.stdout}${r.stderr}`.trim();
      return `[${tool}] ${out === "" ? "(no metadata reported)" : out}`;
    }
  }
  return "(neither exiftool nor exiv2 installed)";
}

/** exiftool's verdict on location tags alone, when installed: the GPS group and any XMP/EXIF coordinates. */
export function exiftoolGps(file: string): string[] | undefined {
  try {
    const out = execFileSync("exiftool", ["-a", "-G1", "-s", "-GPS:all", "-XMP:GPS*", "-Composite:GPS*", "-PNG:all", "-Comment", "-UserComment", file], { encoding: "utf8" });
    return out.split("\n").filter((l) => l.trim() !== "");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return [];
  }
}

export function read(file: string): Buffer {
  return readFileSync(file);
}
