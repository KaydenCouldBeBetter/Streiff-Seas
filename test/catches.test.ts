// S1 step 2: submitting a catch (docs/security.md "catches" Create and Hooks, On create), against a
// PocketBase booted from pb_migrations/ and pb_hooks/ with the fixture world. Every photo goes
// through exiftool, so these tests need it installed, as the server does (fail closed without it).

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { entryOf, seedWorld, type World } from "./harness/world";
import { exiftoolGps, haveTool, leaksIn } from "./spike/leaks";

const pocketbase = usePocketBase();
const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
const HOUR = 3600_000;
const DAY = 24 * HOUR;

if (!haveTool("exiftool")) throw new Error("test/catches.test.ts needs exiftool installed (brew install exiftool): the photo hook refuses every photo without it");

let users: FixtureUsers;
let world: World;
let scratch: string;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  scratch = await mkdtemp(path.join(tmpdir(), "catches-test-"));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const iso = (ms: number) => new Date(ms).toISOString();

async function fixture(name: string, type = "image/jpeg"): Promise<File> {
  return new File([await readFile(path.join(FIXTURES, name))], name, { type });
}

const clean = async () => [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")];

interface Submit {
  entry: string;
  photos: File[];
  /** One capture time per photo in ms (null for none); defaults to an hour ago for each. */
  times?: (number | null)[];
  species?: string;
  /** Overrides and extra fields, sent as given; undefined removes a field. */
  body?: Record<string, string | undefined>;
}

/** The multipart body the app sends: weight 3 lb 7 oz unless the body says otherwise. */
function form({ entry, photos, times, species, body = {} }: Submit): FormData {
  const at = times ?? photos.map(() => Date.now() - HOUR);
  const fields: Record<string, string | undefined> = {
    entry,
    species: species ?? world.species.largemouth.id,
    weight_hoz: "5500",
    client_uuid: randomUUID(),
    captured_at: at[0] == null ? "" : iso(at[0]),
    photo_captured_at: JSON.stringify(at.map((t) => (t == null ? "" : iso(t)))),
    ...body,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.set(key, value);
  for (const photo of photos) data.append("photo", photo);
  return data;
}

const submit = (client: PocketBase, input: Submit) => client.collection("catches").create(form(input));

async function catchesOn(entryId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("catches").getFullList({ filter: superuser.filter("entry = {:entry}", { entry: entryId }) });
}

async function auditRowsFor(catchId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter("target_id = {:id}", { id: catchId }) });
}

const auditCount = async () => (await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems;

/** Asserts the request is refused and that it left no catch on the entry and no audit row. */
async function expectRefused(request: () => Promise<unknown>, entryId: string): Promise<void> {
  const before = (await catchesOn(entryId)).length;
  const rows = await auditCount();
  expect(await statusOf(request())).toBe(400);
  expect(await catchesOn(entryId)).toHaveLength(before);
  expect(await auditCount()).toBe(rows);
}

/** A live event of its own, with an entry for `who`, for windows the world doesn't have. */
async function eventWith(who: FixtureName, window: { starts: number; ends: number; deadline: number }): Promise<{ event: RecordModel; entry: RecordModel }> {
  const { superuser } = pocketbase();
  const event = await superuser.collection("events").create({
    name: `Window ${randomUUID().slice(0, 8)}`,
    status: "live",
    starts_at: iso(window.starts),
    ends_at: iso(window.ends),
    deadline_ext_min: 0,
    submit_deadline: iso(window.deadline),
    metric: "weight",
    best_n: 10,
    judge: users.K.id,
    backup_judge: users.N.id,
    species: [world.species.largemouth.id, world.species.smallmouth.id],
  });
  const entry = await superuser.collection("entries").create({ event: event.id, angler: users[who].id });
  return { event, entry };
}

/** Every stored original of the record, downloaded as a member would, with what it still carries. */
async function storedLeaks(client: PocketBase, record: RecordModel): Promise<Record<string, string[]>> {
  const token = await client.files.getToken();
  const out: Record<string, string[]> = {};
  for (const name of record.photo as string[]) {
    const response = await fetch(client.files.getURL(record, name, { token }));
    expect(response.status, name).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = path.join(scratch, name);
    await writeFile(file, bytes);
    out[name] = [...leaksIn(bytes), ...(exiftoolGps(file) ?? [])];
  }
  return out;
}

async function documentedCreateRule(): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf("\n### catches\n");
  const end = doc.indexOf("\n### ", start + 1);
  const block = /\*\*Create\*\*\n```\n([\s\S]*?)\n```/.exec(doc.slice(start, end < 0 ? undefined : end));
  if (block?.[1] === undefined) throw new Error("security.md ### catches has no Create block");
  return block[1];
}

describe("submit: the rule", () => {
  // The update rule is checked against security.md in test/catchUpdate.test.ts (S1 step 5).
  it("stores the create rule exactly as security.md writes it, and leaves delete locked", async () => {
    const stored = await pocketbase().superuser.collections.getOne("catches");

    expect(stored.createRule).toBe(await documentedCreateRule());
    expect(stored.deleteRule).toBeNull();
  });

  it("R-CAT-C-01, R-AUD-H-01 and H-05: M submits to their own E1 entry; pending, rev 1, no flags, one create row", async () => {
    const entry = entryOf(world, "E1.M");
    const created = await submit(await as("M"), { entry: entry.id, photos: await clean() });

    expect(created).toMatchObject({ status: "pending", rev: 1, flags: [], weight_hoz: 5500, judged_by: "", reason: "" });
    expect(created.photo).toHaveLength(2);
    const rows = await auditRowsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "create", actor: users.M.id, event: world.events.E1.id, catch: created.id });
    expect(Object.keys(rows[0]?.after as object).sort()).toEqual(
      ["flags", "length_q", "photo", "photo_captured_at", "reason", "rev", "species", "status", "weight_hoz"],
    );
    expect(rows[0]?.after).toMatchObject({ status: "pending", rev: 1, weight_hoz: 5500, photo: created.photo, flags: [] });
    expect(rows[0]?.before == null || rows[0]?.before === "").toBe(true);
  });

  it.each(["K", "S"] as const)("R-CAT-C-18: %s submits to their own E1 entry; pending, rev 1", async (who) => {
    const created = await submit(await as(who), { entry: entryOf(world, `E1.${who}`).id, photos: await clean() });

    expect(created).toMatchObject({ status: "pending", rev: 1 });
  });

  it("R-CAT-C-02: M may not submit to Y's entry", async () => {
    const entry = entryOf(world, "E1.Y");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it.each([
    ["R-CAT-C-03", "status = verified", { status: "verified" }],
    ["R-CAT-C-03", "status = pending", { status: "pending" }],
    ["R-CAT-C-04", "judged_by", { judged_by: "K" }],
    ["R-CAT-C-05", "reason", { reason: "trust me" }],
    ["R-CAT-C-05", "flags", { flags: "[]" }],
    ["R-CAT-C-15", "rev", { rev: "1" }],
  ])("%s: a body that sets %s is refused", async (_id, _what, extra: Record<string, string>) => {
    const entry = entryOf(world, "E1.M");
    const body = extra.judged_by === undefined ? extra : { judged_by: users.K.id };
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean(), body }), entry.id);
  });

  it("R-CAT-C-06: M may not submit before the event's starts_at", async () => {
    const { entry } = await eventWith("M", { starts: Date.now() + DAY, ends: Date.now() + 10 * DAY, deadline: Date.now() + 11 * DAY });
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it("R-CAT-C-07: M may not submit after the event's submit_deadline", async () => {
    const { entry } = await eventWith("M", { starts: Date.now() - 10 * DAY, ends: Date.now() - 2 * DAY, deadline: Date.now() - DAY });
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it.each(["ED", "EC", "EF"] as const)("R-CAT-C-08: N may not submit in %s (not live)", async (key) => {
    const entry = entryOf(world, `${key}.N`);
    await expectRefused(async () => submit(await as("N"), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it("R-CAT-C-09: walleye isn't one of E1's species, so it is refused", async () => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean(), species: world.species.walleye.id }), entry.id);
  });

  it("R-CAT-C-10: the same client_uuid sent twice leaves one record", async () => {
    const entry = entryOf(world, "E1.M");
    const client = await as("M");
    const uuid = randomUUID();
    const first = await submit(client, { entry: entry.id, photos: await clean(), body: { client_uuid: uuid } });

    expect(await statusOf(submit(client, { entry: entry.id, photos: await clean(), body: { client_uuid: uuid } }))).toBe(400);
    const { superuser } = pocketbase();
    const same = await superuser.collection("catches").getFullList({ filter: superuser.filter("client_uuid = {:uuid}", { uuid }) });
    expect(same.map((record) => record.id)).toEqual([first.id]);
  });

  it("R-CAT-C-11: anon may not submit", async () => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(actAsAnon(pocketbase()), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it.each([
    ["length_q sent", { length_q: "70" }],
    ["weight_hoz missing", { weight_hoz: undefined }],
    ["weight_hoz 0", { weight_hoz: "0" }],
  ])("R-CAT-C-12: in a weight event, %s is refused", async (_case, body) => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean(), body }), entry.id);
  });

  it.each([
    ["weight_hoz sent", { weight_hoz: "5500", length_q: "70" }],
    ["length_q missing", { weight_hoz: undefined }],
    ["length_q 0", { weight_hoz: undefined, length_q: "0" }],
  ])("R-CAT-C-13: in a length event (EL), %s is refused", async (_case, body) => {
    const entry = entryOf(world, "EL.N");
    await expectRefused(async () => submit(await as("N"), { entry: entry.id, photos: await clean(), body }), entry.id);
  });

  it("R-CAT-C-13: in EL a length is accepted (17 1/2 in is length_q 70, scoring.md example 6)", async () => {
    const created = await submit(await as("N"), { entry: entryOf(world, "EL.N").id, photos: await clean(), body: { weight_hoz: undefined, length_q: "70" } });

    expect(created).toMatchObject({ status: "pending", length_q: 70, weight_hoz: 0 });
  });

  it("R-CAT-C-14: W may not submit to their own withdrawn entry", async () => {
    const entry = entryOf(world, "E1.W");
    await expectRefused(async () => submit(await as("W"), { entry: entry.id, photos: await clean() }), entry.id);
  });

  it("R-CAT-C-16: a photo over 5 MB is refused", async () => {
    const entry = entryOf(world, "E1.M");
    const big = new File([Buffer.alloc(5 * 1024 * 1024 + 1, 0xff)], "big.jpg", { type: "image/jpeg" });
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: [await fixture("clean-1.jpg"), big] }), entry.id);
  });

  it("R-CAT-C-16: a photo that isn't image/jpeg is refused (PNG)", async () => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: [await fixture("clean-1.jpg"), await fixture("text-chunk.png", "image/png")] }), entry.id);
  });

  it("R-CAT-C-17: during an outage extension a catch photographed after ends_at is allowed and flagged after_window", async () => {
    const now = Date.now();
    const { entry } = await eventWith("M", { starts: now - 10 * DAY, ends: now - 30 * HOUR, deadline: now + 3 * HOUR });
    const created = await submit(await as("M"), { entry: entry.id, photos: await clean(), times: [now - 2 * HOUR, now - 2 * HOUR] });

    expect(created.status).toBe("pending");
    expect(created.flags).toEqual(["after_window"]);
  });

  it.each([
    ["photo_captured_at missing", { photo_captured_at: undefined }],
    ["one entry for two photos", { photo_captured_at: JSON.stringify([iso(Date.now() - HOUR)]) }],
    ["three entries for two photos", { photo_captured_at: JSON.stringify(["", "", ""]) }],
    ["a first entry that differs from captured_at", { photo_captured_at: JSON.stringify([iso(Date.now() - 2 * HOUR), iso(Date.now() - HOUR)]) }],
    ["an entry that isn't a date", { photo_captured_at: JSON.stringify(["yesterday", "today"]), captured_at: "" }],
  ])("R-CAT-C-19: %s is refused", async (_case, body) => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: await clean(), body }), entry.id);
  });

  it.each([
    ["no photo", 0],
    ["one photo", 1],
  ])("R-CAT-C-21: a catch with %s is refused", async (_case, count) => {
    const entry = entryOf(world, "E1.M");
    const photos = (await clean()).slice(0, count);
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos, times: photos.map(() => null) }), entry.id);
  });

  it("R-CAT-C-23: a body that sets created doesn't change the stored created", async () => {
    const entry = entryOf(world, "E1.M");
    const before = Date.now();
    const uuid = randomUUID();
    const outcome = await statusOf(submit(await as("M"), { entry: entry.id, photos: await clean(), body: { client_uuid: uuid, created: "2020-01-01 00:00:00.000Z" } }));
    const { superuser } = pocketbase();
    const stored = await superuser.collection("catches").getFullList({ filter: superuser.filter("client_uuid = {:uuid}", { uuid }) });

    // v0.40.4 either refuses the field or ignores it; either way no catch dated 2020 exists.
    if (outcome === "allowed") {
      expect(stored).toHaveLength(1);
      expect(new Date(String(stored[0]?.created).replace(" ", "T")).getTime()).toBeGreaterThanOrEqual(before - 5000);
    } else {
      expect(outcome).toBe(400);
      expect(stored).toEqual([]);
    }
  });

  it("R-AUD-H-04: refused submits write no audit row", async () => {
    const rows = await auditCount();

    await statusOf(submit(actAsAnon(pocketbase()), { entry: entryOf(world, "E1.M").id, photos: await clean() }));
    await statusOf(submit(await as("M"), { entry: entryOf(world, "E1.Y").id, photos: await clean() }));
    await statusOf(submit(await as("M"), { entry: entryOf(world, "E1.M").id, photos: (await clean()).slice(0, 1), times: [null] }));

    expect(await auditCount()).toBe(rows);
  });
});

describe("submit: flags set on create (R-CAT-C-20, C-22)", () => {
  const now = () => Date.now();

  // E1's window runs from 7 days ago to 30 days ahead. Each case lists every code its times
  // match: a catch photographed before the window was also photographed more than 24 h ago.
  it.each([
    ["a clean catch", () => [now() - HOUR, now() - HOUR], []],
    ["no capture time", () => [null, now() - HOUR], ["no_capture_time"]],
    ["before starts_at", () => [now() - 8 * DAY, now() - 8 * DAY], ["before_window", "late_submit"]],
    ["more than 24 h before receipt", () => [now() - 30 * HOUR, now() - 30 * HOUR], ["late_submit"]],
    ["photo 2 with no capture time", () => [now() - HOUR, null], ["extra_photo_no_time"]],
    ["photo 2 more than 24 h from photo 1", () => [now() - HOUR, now() - 31 * HOUR], ["extra_photo_far"]],
  ] as const)("R-CAT-C-20: %s gets exactly %j", async (_case, times, flags) => {
    const created = await submit(await as("M"), { entry: entryOf(world, "E1.M").id, photos: await clean(), times: [...times()] });

    expect(created.flags).toEqual(flags);
  });

  it("R-CAT-C-20: after ends_at gets exactly after_window (see R-CAT-C-17)", async () => {
    const at = now();
    const { entry } = await eventWith("M", { starts: at - 10 * DAY, ends: at - 30 * HOUR, deadline: at + 3 * HOUR });
    const created = await submit(await as("M"), { entry: entry.id, photos: await clean(), times: [at - HOUR, at - HOUR] });

    expect(created.flags).toEqual(["after_window"]);
  });

  it("R-CAT-C-22: 4 photos, photo 3 30 h after photo 1 and photo 4 with no time: both extra-photo codes, no photo_added", async () => {
    const at = now();
    const photos = [...(await clean()), await fixture("clean-1.jpg"), await fixture("clean-2.jpg")];
    const created = await submit(await as("M"), { entry: entryOf(world, "E1.M").id, photos, times: [at - 2 * HOUR, at - 2 * HOUR, at + 28 * HOUR, null] });

    expect(created.photo).toHaveLength(4);
    expect(created.flags).toEqual(["extra_photo_no_time", "extra_photo_far"]);
  });
});

describe("submit: the location strip (L2, spike Option A then verify)", () => {
  // Each leaky fixture as the second required photo. The stored original must carry nothing that
  // could hold a location, by an independent byte walk and by exiftool.
  it.each([
    ["gps.jpg", "EXIF GPS"],
    ["xmp-gps.jpg", "XMP GPS"],
    ["trailer-gps.jpg", "location data after the JPEG end marker"],
  ])("stores %s (%s) with no location data left in it", async (name) => {
    const client = await as("M");
    const created = await submit(client, { entry: entryOf(world, "E1.M").id, photos: [await fixture("clean-1.jpg"), await fixture(name)] });

    const leaks = await storedLeaks(client, created);
    for (const [file, found] of Object.entries(leaks)) expect(found, file).toEqual([]);
  });

  it.skipIf(!existsSync(path.join(FIXTURES, "iphone.heic")))("refuses a real iPhone HEIC (not image/jpeg)", async () => {
    const entry = entryOf(world, "E1.M");
    await expectRefused(async () => submit(await as("M"), { entry: entry.id, photos: [await fixture("clean-1.jpg"), await fixture("iphone.heic", "image/heic")] }), entry.id);
  });

  it("a member reads back their own catch with its photos, and the snapshot lists the stored filenames", async () => {
    const client = await as("M");
    const created = await submit(client, { entry: entryOf(world, "E1.M").id, photos: await clean() });
    const read = await client.collection("catches").getOne(created.id);
    const [row] = await auditRowsFor(created.id);

    expect(read.photo).toEqual(created.photo);
    expect((row?.after as { photo: string[] }).photo).toEqual(created.photo);
  });
});
