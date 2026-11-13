// M0-04 photo spike, question 1: does a stored original or a thumbnail ever carry location data,
// on a two-photo create and on an added photo, for each of the four fixtures; and does a refused
// file leave nothing in pb_data. Spike hooks live in test/spike/hooks/ (not in pb_hooks/).
//
// Fixtures come from scripts/make-photo-fixtures.py; test/fixtures/iphone.heic must be a real
// iPhone file dropped in by hand, and its tests are skipped until it is there.

import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exiftoolGps, haveTool } from "./spike/leaks";
import { FIXTURES, asUser, catchForm, evidence, fixture, inspectStorage, seed, startSpike, type Seed, type Spike } from "./spike/spike";

const HEIC = existsSync(path.join(FIXTURES, "iphone.heic"));
const EXIFTOOL = haveTool("exiftool");

const LEAKY = [
  ["gps.jpg", "EXIF GPS"],
  ["xmp-gps.jpg", "XMP GPS"],
  ["text-chunk.png", "PNG text chunks"],
  // Extra to the four in L2: location data after the end-of-image marker, where a scan that stops at the image data does not look.
  ["trailer-gps.jpg", "EXIF/XMP packet after the JPEG end marker"],
] as const;

async function errorOf(run: () => Promise<unknown>): Promise<{ status: number; message: string; photo?: string }> {
  try {
    await run();
  } catch (error) {
    const e = error as { status: number; response: { message: string; data?: { photo?: { code?: string; message?: string } } } };
    return { status: e.status, message: e.response.message, photo: e.response.data?.photo?.code };
  }
  throw new Error("expected the request to be refused");
}

describe("control: PocketBase alone, any image type, thumbnails on", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: [], mimes: [], thumbs: ["100x100"] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it("keeps the location data in a stored original and not in its thumbnail", async () => {
    const m = await asUser(spike.harness, s.member);
    const record = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("gps.jpg")]));
    const { files, thumbResponses } = await inspectStorage(spike, m, record);
    evidence("control: create [clean-1.jpg, gps.jpg], no hook", { thumbResponses, files });

    const original = files.find((f) => f.path.includes("gps_") && f.kind === "original")!;
    const thumb = files.find((f) => f.path.includes("gps_") && f.kind === "thumbnail")!;
    expect(original.leaks.length).toBeGreaterThan(0);
    expect(thumb).toBeDefined();
    expect(thumb.leaks).toEqual([]);
  });
});

describe("Option B: refuse any file that carries metadata (fail closed)", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: ["strip_b.pb.js"], mimes: [], thumbs: ["100x100"] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it.each(LEAKY)("refuses %s (%s) on a two-photo create and leaves zero files", async (name) => {
    const m = await asUser(spike.harness, s.member);
    const before = await spike.storage();
    const refused = await errorOf(async () => m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture(name)])));
    evidence(`B: create refused [clean-1.jpg, ${name}]`, { refused, storageBefore: before.length, storageAfter: (await spike.storage()).length });
    expect(refused.photo).toBe("photo_has_metadata");
    expect(await spike.storage()).toEqual(before);
    expect((await m.collection("catches").getFullList()).length).toBe(0);
  });

  it("accepts two clean JPEGs and a clean added photo; originals and thumbnails carry nothing", async () => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const form = new FormData();
    form.set("rev", "1");
    form.append("photo+", await fixture("clean-1.jpg"));
    const updated = await m.collection("catches").update(created.id, form);
    const { files, thumbResponses } = await inspectStorage(spike, m, updated);
    evidence("B: clean create + clean add", { photo: updated.photo, thumbResponses, files });
    expect(updated.photo).toHaveLength(3);
    expect(files.filter((f) => f.kind === "original")).toHaveLength(3);
    expect(files.filter((f) => f.kind === "thumbnail")).toHaveLength(3);
    for (const f of files) expect(f.leaks, f.path).toEqual([]);
  });

  it.each(LEAKY)("refuses %s (%s) as an added photo and leaves the stored files as they were", async (name) => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const before = await spike.storage();
    const form = new FormData();
    form.set("rev", "1");
    form.append("photo+", await fixture(name));
    const refused = await errorOf(() => m.collection("catches").update(created.id, form));
    evidence(`B: add refused ${name}`, { refused });
    expect(refused.photo).toBe("photo_has_metadata");
    expect(await spike.storage()).toEqual(before);
    expect((await m.collection("catches").getOne(created.id)).photo).toEqual(created.photo);
  });

  it.skipIf(!HEIC)("refuses iphone.heic on create and as an added photo", async () => {
    const m = await asUser(spike.harness, s.member);
    const before = await spike.storage();
    const file = await fixture("iphone.heic");
    const onCreate = await errorOf(async () => m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), file])));
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const form = new FormData();
    form.set("rev", "1");
    form.append("photo+", file);
    const onAdd = await errorOf(() => m.collection("catches").update(created.id, form));
    evidence("B: iphone.heic", { onCreate, onAdd });
    expect(onCreate.photo).toBe("photo_has_metadata");
    expect(onAdd.photo).toBe("photo_has_metadata");
    expect((await spike.storage()).length).toBe(before.length + 4); // only the clean catch's two photos and their .attrs
  });
});

describe("the designed schema (image/jpeg only) refuses other types by itself", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({ hooks: [], mimes: ["image/jpeg"], thumbs: [] });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it.each([["text-chunk.png"], ...(HEIC ? [["iphone.heic"]] : [])])("refuses %s and leaves zero files", async (name) => {
    const m = await asUser(spike.harness, s.member);
    const refused = await errorOf(async () => m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture(name!)])));
    evidence(`schema: ${name} refused`, { refused });
    expect(refused.status).toBe(400);
    expect(await spike.storage()).toEqual([]);
  });
});

// Option A needs exiftool on the machine running PocketBase. Skipped here until it is installed.
describe.skipIf(!EXIFTOOL)("Option A: exiftool through $os.cmd", () => {
  let spike: Spike;
  let s: Seed;
  beforeAll(async () => {
    spike = await startSpike({
      hooks: ["strip_a.pb.js"],
      mimes: [],
      thumbs: ["100x100"],
      replace: { __STRIP_CMD__: JSON.stringify(["exiftool", "-all=", "-overwrite_original", "{file}"]) },
    });
    s = await seed(spike.harness);
  });
  afterAll(() => spike.stop());

  it.each(LEAKY)("cleans %s (%s) on a two-photo create", async (name) => {
    const m = await asUser(spike.harness, s.member);
    const record = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture(name)]));
    const { files, thumbResponses } = await inspectStorage(spike, m, record);
    evidence(`A: create [clean-1.jpg, ${name}]`, { thumbResponses, files });
    for (const f of files.filter((f) => f.path.includes(record.id))) expect(f.leaks, f.path).toEqual([]);
  });

  it.each(LEAKY)("cleans %s (%s) as an added photo", async (name) => {
    const m = await asUser(spike.harness, s.member);
    const created = await m.collection("catches").create(catchForm(s, [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")]));
    const form = new FormData();
    form.set("rev", "1");
    form.append("photo+", await fixture(name));
    const updated = await m.collection("catches").update(created.id, form);
    const { files, thumbResponses } = await inspectStorage(spike, m, updated);
    evidence(`A: add ${name}`, { thumbResponses, files, exiftoolGps: exiftoolGps });
    for (const f of files.filter((f) => f.path.includes(updated.id))) expect(f.leaks, f.path).toEqual([]);
  });
});

// What reading the upload inside the hook costs at the field's size limit (5 MB per file).
// Needs test/fixtures/large-clean.jpg: `python3 scripts/make-photo-fixtures.py` makes it.
describe.skipIf(!existsSync(path.join(FIXTURES, "large-clean.jpg")))("cost of reading a 5 MB photo in a hook", () => {
  it.each([
    ["no hook", [] as string[]],
    ["Option B scan", ["strip_b.pb.js"]],
  ])("%s", async (label, hooks) => {
    const spike = await startSpike({ hooks, mimes: ["image/jpeg"], thumbs: [] });
    try {
      const s = await seed(spike.harness);
      const m = await asUser(spike.harness, s.member);
      const big = await fixture("large-clean.jpg");
      const started = performance.now();
      const record = await m.collection("catches").create(catchForm(s, [big, big]));
      const ms = Math.round(performance.now() - started);
      evidence(`large-clean.jpg (${big.size} bytes) x 2 create, ${label}`, { ms, files: record.photo.length });
      expect(record.photo).toHaveLength(2);
      expect(ms).toBeLessThan(15_000);
    } finally {
      await spike.stop();
    }
  });
});
