import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureTimeOf, parseExifTime } from "../web/src/lib/exifTime";
import { displayWeight, displayWeightText } from "../web/src/lib/displayWeight";
import { haveTool } from "./spike/leaks";

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

async function bufferOf(file: string): Promise<ArrayBuffer> {
  const bytes = await readFile(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("captureTimeOf", () => {
  it("reads DateTimeOriginal from gps.jpg as the phone's local time", async () => {
    // exiftool: DateTimeOriginal 2026:10:03 06:58:12, no OffsetTimeOriginal.
    expect(captureTimeOf(await bufferOf(path.join(FIXTURES, "gps.jpg")))).toEqual(new Date(2026, 9, 3, 6, 58, 12));
  });

  it("is null for a JPEG with no EXIF (clean-1.jpg), and for a PNG", async () => {
    expect(captureTimeOf(await bufferOf(path.join(FIXTURES, "clean-1.jpg")))).toBeNull();
    expect(captureTimeOf(await bufferOf(path.join(FIXTURES, "text-chunk.png")))).toBeNull();
  });

  it("is null for bytes that aren't an image", () => {
    expect(captureTimeOf(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(captureTimeOf(new ArrayBuffer(0))).toBeNull();
  });

  it.skipIf(!haveTool("exiftool"))("uses OffsetTimeOriginal when the photo has one", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "exif-time-"));
    try {
      const out = path.join(dir, "offset.jpg");
      execFileSync("exiftool", ["-q", "-OffsetTimeOriginal=-05:00", "-o", out, path.join(FIXTURES, "gps.jpg")]);

      expect(captureTimeOf(await bufferOf(out))).toEqual(new Date("2026-10-03T11:58:12Z"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("parseExifTime", () => {
  it.each(["", "2026:13:01 10:00:00", "0000:00:00 00:00:00", "    :  :     :  :  ", "2026-10-03 06:58:12"])("is null for %j", (value) => {
    expect(parseExifTime(value, null)).toBeNull();
  });

  it("applies a +02:00 offset", () => {
    expect(parseExifTime("2026:07:01 12:00:00", "+02:00")).toEqual(new Date("2026-07-01T10:00:00Z"));
  });
});

describe("displayWeight (scoring.md example 5)", () => {
  it.each([
    [5500, "3.44 lb", "3 lb 7.0 oz"],
    [5488, "3.43 lb", "3 lb 6.9 oz"],
    [4750, "2.97 lb", "2 lb 15.5 oz"],
  ])("%i hundredths of an ounce reads %s and %s", (hoz, lb, lbOz) => {
    expect(displayWeightText(hoz, "lb")).toBe(lb);
    expect(displayWeightText(hoz, "lb_oz")).toBe(lbOz);
  });

  it("example 16: A's 27.15 lb total reads 27 lb 2.4 oz", () => {
    expect(displayWeight(43440, "lb_oz")).toEqual({ value: "27 lb 2.4", unit: "oz" });
    expect(displayWeight(43440, "lb")).toEqual({ value: "27.15", unit: "lb" });
  });

  it("rounds 15.96 oz up into the next pound, not to 15.10", () => {
    // 1 lb 15.96 oz = 3196 hoz -> 32.0 oz -> 2 lb 0.0 oz.
    expect(displayWeightText(3196, "lb_oz")).toBe("2 lb 0.0 oz");
  });
});
