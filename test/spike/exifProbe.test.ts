// The scratch page web/exif-probe.html carries its own EXIF reader. This runs that reader (the
// block between the READER markers) in Node against the fixtures, so the page's logic is checked
// here; what iPhone Safari and Android Chrome DELIVER can only be checked on the phones.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "./spike";

const page = readFileSync(path.join(import.meta.dirname, "..", "..", "web", "exif-probe.html"), "utf8");
const block = /\/\* READER:BEGIN[^*]*\*\/([\s\S]*?)\/\* READER:END \*\//.exec(page)![1]!;
const probe = new Function(`${block}; return ExifProbe;`)() as {
  describeJpeg(buffer: ArrayBuffer): any;
  describeText(d: any): string;
  inspect(buffer: ArrayBuffer): { container: string; exifFound: boolean; exif: any; xmp: any; notes: string[] };
};

const inspectFixture = (name: string) => {
  const b = readFileSync(path.join(FIXTURES, name));
  return probe.inspect(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe("exif-probe.html reader", () => {
  it("reads DateTimeOriginal and GPS from an EXIF JPEG (big-endian, as iPhones write)", () => {
    const r = inspectFixture("gps.jpg");
    expect(r.container).toBe("jpeg");
    expect(r.exif.dateTimeOriginal).toBe("2026:10:03 06:58:12");
    expect(r.exif.make).toBe("FixtureCam");
    expect(r.exif.gps.present).toBe(true);
    expect(r.exif.gps.lat).toBeCloseTo(43.1234, 4);
    expect(r.exif.gps.lon).toBeCloseTo(77.5678, 4);
  });

  it("finds no EXIF in a clean JPEG, and a time and GPS in XMP-only", () => {
    expect(inspectFixture("clean-1.jpg").exifFound).toBe(false);
    const x = inspectFixture("xmp-gps.jpg");
    expect(x.exifFound).toBe(false);
    expect(x.xmp.dateTimeOriginal).toContain("2026");
    expect(x.xmp.gps).toBe(true);
  });

  it("reads a PNG with an XMP text chunk", () => {
    const r = inspectFixture("text-chunk.png");
    expect(r.container).toBe("png");
    expect(r.xmp.gps).toBe(true);
  });

  it("reads a little-endian EXIF block (as many Android cameras write)", () => {
    // II*\0, IFD0 at 8 with one entry (ExifIFD pointer -> 26); ExifIFD with one entry: DateTimeOriginal at 44.
    const date = "2026:10:04 07:15:30\0";
    const tiff = Buffer.alloc(44 + date.length);
    tiff.write("II", 0, "latin1");
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
    tiff.writeUInt32LE(0, 22);
    tiff.writeUInt16LE(1, 26);
    tiff.writeUInt16LE(0x9003, 28); tiff.writeUInt16LE(2, 30); tiff.writeUInt32LE(date.length, 32); tiff.writeUInt32LE(44, 36);
    tiff.writeUInt32LE(0, 40);
    tiff.write(date, 44, "latin1");
    const exifSegment = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
    const seg = Buffer.alloc(4);
    seg.writeUInt8(0xff, 0); seg.writeUInt8(0xe1, 1); seg.writeUInt16BE(exifSegment.length + 2, 2);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg, exifSegment, Buffer.from([0xff, 0xd9])]);
    const r = probe.inspect(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer);
    expect(r.exif.dateTimeOriginal).toBe("2026:10:04 07:15:30");
  });

  it.skipIf(!existsSync(path.join(FIXTURES, "iphone.heic")))("reads the real iPhone HEIC dropped into test/fixtures/", () => {
    const r = inspectFixture("iphone.heic");
    expect(r.container).toContain("HEIC");
    expect(r.exif?.dateTimeOriginal).toMatch(/^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/);
  });

  const describe_ = (name: string) => {
    const b = readFileSync(path.join(FIXTURES, name));
    return probe.describeJpeg(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  };

  it("lists the segments and EXIF tags of a file (to see what Safari's canvas writes)", () => {
    const g = describe_("gps.jpg");
    expect(g.isJpeg).toBe(true);
    expect(g.gpsIfd).toBe(true);
    const exif = g.segments.find((s: any) => s.kind === "Exif");
    expect(exif.tiff.ifds.IFD0.some((e: string) => e.startsWith("0x010f/2/"))).toBe(true);
    expect(exif.tiff.ifds.ExifIFD.some((e: string) => e.startsWith("0x9003/2/20="))).toBe(true);
    expect(exif.tiff.ifds.GPSIFD.length).toBeGreaterThan(3);
    expect(probe.describeText(g)).toContain("GPS IFD: YES");

    const c = describe_("clean-1.jpg");
    expect(c.gpsIfd).toBe(false);
    expect(c.exifSegments).toBe(0);
    expect(c.trailing).toBe(0);
    expect(probe.describeText(c)).toContain("GPS IFD: no");

    const t = describe_("trailer-gps.jpg");
    expect(t.trailing).toBeGreaterThan(100);
    expect(describe_("text-chunk.png").isJpeg).toBe(false);
  });

  it("lists the 8BIM resource ids of a Photoshop APP13 block (0x0404 would be IPTC)", () => {
    const resource = (id: number, data: Buffer) => {
      const head = Buffer.alloc(12);
      head.write("8BIM", 0, "latin1");
      head.writeUInt16BE(id, 4); // name: empty pascal string, padded to two bytes
      head.writeUInt32BE(data.length, 8);
      return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const body = Buffer.concat([Buffer.from("Photoshop 3.0\0", "latin1"), resource(0x0404, Buffer.from("City")), resource(0x0425, Buffer.alloc(16))]);
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xffed, 0);
    seg.writeUInt16BE(body.length + 2, 2);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg, body, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
    const d = probe.describeJpeg(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer);
    expect(d.segments[0].resources).toEqual(["0x0404/4", "0x0425/16"]);
    expect(probe.describeText(d)).toContain("8BIM[0x0404/4 0x0425/16]");
  });
});
