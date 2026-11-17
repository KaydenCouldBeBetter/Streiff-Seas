// S1 step 5: the angler edits, adds a photo to, or retracts their own pending catch
// (docs/security.md "catches" Update and Hooks, On update by the angler), against a PocketBase
// booted from pb_migrations/ and pb_hooks/ with the fixture world. Needs exiftool, as the server
// does: every added photo is stripped.

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type World } from "./harness/world";
import { exiftoolGps, haveTool, leaksIn } from "./spike/leaks";

const pocketbase = usePocketBase();
const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
const HOUR = 3600_000;
/** A refusal: 404 from the update rule, 400 from the hook or the schema. */
const REFUSED = [400, 403, 404];

if (!haveTool("exiftool")) throw new Error("test/catchUpdate.test.ts needs exiftool installed (brew install exiftool)");

let users: FixtureUsers;
let world: World;
let scratch: string;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  scratch = await mkdtemp(path.join(tmpdir(), "catch-update-"));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const iso = (ms: number) => new Date(ms).toISOString();

async function fixture(name: string, type = "image/jpeg"): Promise<File> {
  return new File([await readFile(path.join(FIXTURES, name))], name, { type });
}

/** A pending catch the angler submits through the API now, photographed an hour ago. */
async function submitted(who: FixtureName = "M", entryKey: `${"E1" | "E2" | "EL"}.${FixtureName}` = "E1.M"): Promise<{ client: PocketBase; record: RecordModel; capturedAt: number }> {
  const client = await as(who);
  const capturedAt = Date.now() - HOUR;
  const body = new FormData();
  body.set("entry", entryOf(world, entryKey).id);
  body.set("species", world.species.largemouth.id);
  body.set("weight_hoz", "5500");
  body.set("client_uuid", randomUUID());
  body.set("captured_at", iso(capturedAt));
  body.set("photo_captured_at", JSON.stringify([iso(capturedAt), iso(capturedAt)]));
  body.append("photo", await fixture("clean-1.jpg"));
  body.append("photo", await fixture("clean-2.jpg"));
  return { client, record: await client.collection("catches").create(body), capturedAt };
}

/** The multipart body for adding one photo: echoes rev, appends with `photo+`, extends the times. */
async function addPhoto(record: RecordModel, file: File, time: number | null, extra: Record<string, string> = {}): Promise<FormData> {
  const body = new FormData();
  body.set("rev", String(record.rev));
  body.set("photo_captured_at", JSON.stringify([...(record.photo_captured_at as string[]), time === null ? "" : iso(time)]));
  for (const [key, value] of Object.entries(extra)) body.set(key, value);
  body.append("photo+", file);
  return body;
}

const stored = (id: string) => pocketbase().superuser.collection("catches").getOne(id);
const update = (client: PocketBase, id: string, body: FormData | Record<string, unknown>) => client.collection("catches").update(id, body);

async function rows(catchId: string, action?: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  const all = await superuser.collection("audit_log").getFullList({ filter: superuser.filter("target_id = {:id}", { id: catchId }), sort: "created" });
  return all.filter((row) => (action ? row.action === action : row.action !== "create"));
}

/** Refused, and the catch, its files and its audit rows are exactly as they were. */
async function expectRefused(request: () => Promise<unknown>, id: string): Promise<void> {
  const before = await stored(id);
  const auditBefore = (await rows(id)).length;
  expect(REFUSED).toContain(await statusOf(request()));
  const after = await stored(id);
  expect(after.photo).toEqual(before.photo);
  expect(after).toMatchObject({ rev: before.rev, status: before.status, weight_hoz: before.weight_hoz, species: before.species, flags: before.flags });
  expect((await rows(id)).length).toBe(auditBefore);
}

async function documentedUpdateRule(): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf("\n### catches\n");
  const end = doc.indexOf("\n### ", start + 1);
  const block = /\*\*Update\*\* \(two branches[^\n]*\n```\n([\s\S]*?)\n```/.exec(doc.slice(start, end < 0 ? undefined : end));
  if (block?.[1] === undefined) throw new Error("security.md ### catches has no Update block");
  return block[1];
}

describe("the rule", () => {
  it("stores the update rule exactly as security.md writes it, and leaves delete locked", async () => {
    const collection = await pocketbase().superuser.collections.getOne("catches");

    expect(collection.updateRule).toBe(await documentedUpdateRule());
    expect(collection.deleteRule).toBeNull();
  });
});

describe("edit", () => {
  it("R-CAT-U-16, R-AUD-H-01, H-05: M edits own pending weight; rev + 1; one edit row with both snapshots", async () => {
    const { client, record } = await submitted();

    const after = await update(client, record.id, { rev: 1, weight_hoz: 5488 });

    expect(after).toMatchObject({ weight_hoz: 5488, rev: 2, status: "pending" });
    const [row, ...more] = await rows(record.id);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ action: "edit", actor: users.M.id, catch: record.id, event: world.events.E1.id });
    expect(row?.before).toMatchObject({ weight_hoz: 5500, rev: 1 });
    expect(row?.after).toMatchObject({ weight_hoz: 5488, rev: 2 });
    expect(Object.keys(row?.before as object).sort()).toEqual(["flags", "length_q", "photo", "photo_captured_at", "reason", "rev", "species", "status", "weight_hoz"]);
  });

  it("R-CAT-U-16: M changes species to the other one in E1", async () => {
    const { client, record } = await submitted();

    expect(await update(client, record.id, { rev: 1, species: world.species.smallmouth.id })).toMatchObject({ species: world.species.smallmouth.id, rev: 2 });
  });

  it("R-CAT-U-17: M may not change species to one not in E1 (walleye)", async () => {
    const { client, record } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, species: world.species.walleye.id }), record.id);
  });

  it("R-CAT-U-18: M may not edit own catch after it was judged", async () => {
    const verified = catchOf(world, "E1.M.verified");
    await expectRefused(async () => update(await as("M"), verified.id, { rev: verified.rev, weight_hoz: 9000 }), verified.id);
  });

  it("R-CAT-U-19: N may not edit own pending catch in EC (closed)", async () => {
    const pending = catchOf(world, "EC.N.pending");
    await expectRefused(async () => update(await as("N"), pending.id, { rev: pending.rev, weight_hoz: 9000 }), pending.id);
  });

  it.each([
    ["status = verified", { status: "verified" }],
    ["status = pending", { status: "pending" }],
    ["status = rejected", { status: "rejected" }],
    ["reason", { reason: "trust me" }],
    ["a rev other than the stored one", { rev: 7 }],
  ])("R-CAT-U-20: an edit that sets %s is refused", async (_case, body) => {
    const { client, record } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, weight_hoz: 5600, ...body }), record.id);
  });

  it("R-CAT-U-22: M may not edit Y's catch", async () => {
    const y = catchOf(world, "E1.Y.pending");
    await expectRefused(async () => update(await as("M"), y.id, { rev: y.rev, weight_hoz: 9000 }), y.id);
  });

  it("R-CAT-U-23: W may not edit own pending catch on the withdrawn entry", async () => {
    const w = catchOf(world, "E1.W.pending");
    await expectRefused(async () => update(await as("W"), w.id, { rev: w.rev, weight_hoz: 9000 }), w.id);
  });

  it("R-CAT-U-24: M may not send length_q in a weight event", async () => {
    const { client, record } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, length_q: 70 }), record.id);
  });

  it("R-CAT-U-25: anon may not update any catch", async () => {
    const { record } = await submitted();
    await expectRefused(() => update(actAsAnon(pocketbase()), record.id, { rev: 1, weight_hoz: 5600 }), record.id);
  });

  it("R-CAT-U-28: M may not change captured_at", async () => {
    const { client, record } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, captured_at: iso(Date.now() - 2 * HOUR) }), record.id);
  });

  it("an edit that changes nothing is refused, and rev doesn't move", async () => {
    const { client, record } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, weight_hoz: 5500 }), record.id);
  });
});

describe("add a photo", () => {
  it("R-CAT-U-21: a third photo with the current rev keeps photos 1 and 2 in place; photo_added; rev + 1; one edit row", async () => {
    const { client, record, capturedAt } = await submitted();

    const after = await update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt));

    expect(after.photo).toHaveLength(3);
    expect((after.photo as string[]).slice(0, 2)).toEqual(record.photo);
    expect(after).toMatchObject({ rev: 2, flags: ["photo_added"] });
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["edit"]);
  });

  it("an added photo goes through the location strip (gps.jpg comes out clean)", async () => {
    const { client, record, capturedAt } = await submitted();
    const after = await update(client, record.id, await addPhoto(record, await fixture("gps.jpg"), capturedAt));
    const name = (after.photo as string[])[2]!;
    const token = await client.files.getToken();
    const bytes = Buffer.from(await (await fetch(client.files.getURL(after, name, { token }))).arrayBuffer());
    const file = path.join(scratch, name);
    await writeFile(file, bytes);

    expect([...leaksIn(bytes), ...(exiftoolGps(file) ?? [])]).toEqual([]);
  });

  it("R-CAT-U-34: a photo 30 h after captured_at adds photo_added and extra_photo_far, keeping earlier codes", async () => {
    const client = await as("M");
    const capturedAt = Date.now() - 30 * HOUR;
    const body = new FormData();
    body.set("entry", entryOf(world, "E1.M").id);
    body.set("species", world.species.largemouth.id);
    body.set("weight_hoz", "5500");
    body.set("client_uuid", randomUUID());
    body.set("captured_at", iso(capturedAt));
    body.set("photo_captured_at", JSON.stringify([iso(capturedAt), iso(capturedAt)]));
    body.append("photo", await fixture("clean-1.jpg"));
    body.append("photo", await fixture("clean-2.jpg"));
    const record = await client.collection("catches").create(body);
    expect(record.flags).toEqual(["late_submit"]);

    const after = await update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt + 30 * HOUR));

    expect(after.flags).toEqual(["late_submit", "photo_added", "extra_photo_far"]);
  });

  it("R-CAT-U-35: a photo with no capture time adds photo_added and extra_photo_no_time", async () => {
    const { client, record } = await submitted();

    expect((await update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), null))).flags).toEqual(["photo_added", "extra_photo_no_time"]);
  });

  // Each body also changes the weight, a change the angler may make, so only the append-only check
  // can be what refuses it.
  it.each([
    ["photo- of the first photo", async (r: RecordModel) => ({ rev: r.rev, weight_hoz: 5600, "photo-": [(r.photo as string[])[0]] })],
    ["a full list without the first photo", async (r: RecordModel) => ({ rev: r.rev, weight_hoz: 5600, photo: [(r.photo as string[])[1]] })],
    ["the two photos in the other order", async (r: RecordModel) => ({ rev: r.rev, weight_hoz: 5600, photo: [...(r.photo as string[])].reverse() })],
    ["an empty photo list", async (r: RecordModel) => ({ rev: r.rev, weight_hoz: 5600, photo: [] })],
  ])("R-CAT-U-26: %s is refused and no file is deleted", async (_case, body) => {
    const { client, record } = await submitted();
    await expectRefused(async () => update(client, record.id, await body(record)), record.id);
    const token = await client.files.getToken();
    for (const name of record.photo as string[]) expect((await fetch(client.files.getURL(record, name, { token }))).status, name).toBe(200);
  });

  it("R-CAT-U-26: a new file put in place of photo 1 is refused", async () => {
    const { client, record, capturedAt } = await submitted();
    const body = new FormData();
    body.set("rev", "1");
    body.set("photo_captured_at", JSON.stringify([iso(capturedAt), iso(capturedAt)]));
    body.append("photo", await fixture("clean-2.jpg"));
    body.append("photo", (record.photo as string[])[1]!);
    await expectRefused(() => update(client, record.id, body), record.id);
  });

  it("R-CAT-U-27: a 5th photo is refused", async () => {
    const { client, record, capturedAt } = await submitted();
    const four = await update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt));
    const withFour = await update(client, record.id, await addPhoto(four, await fixture("clean-2.jpg"), capturedAt));
    expect(withFour.photo).toHaveLength(4);

    await expectRefused(async () => update(client, record.id, await addPhoto(withFour, await fixture("clean-1.jpg"), capturedAt)), record.id);
  });

  it.each([
    ["over 5 MB", () => new File([Buffer.alloc(5 * 1024 * 1024 + 1, 0xff)], "big.jpg", { type: "image/jpeg" })],
    ["not image/jpeg", () => fixture("text-chunk.png", "image/png")],
  ])("R-CAT-U-27: an added photo %s is refused", async (_case, file) => {
    const { client, record, capturedAt } = await submitted();
    await expectRefused(async () => update(client, record.id, await addPhoto(record, await file(), capturedAt)), record.id);
  });

  it.each([
    ["changes the first entry", (_r: RecordModel, at: number) => JSON.stringify([iso(at - HOUR), iso(at), iso(at)])],
    ["has one entry too few", (_r: RecordModel, at: number) => JSON.stringify([iso(at), iso(at)])],
    ["has one entry too many", (_r: RecordModel, at: number) => JSON.stringify([iso(at), iso(at), iso(at), iso(at)])],
  ])("R-CAT-U-36: an added photo whose photo_captured_at %s is refused; no file stored or deleted", async (_case, times) => {
    const { client, record, capturedAt } = await submitted();
    const body = await addPhoto(record, await fixture("clean-1.jpg"), capturedAt);
    body.set("photo_captured_at", times(record, capturedAt));
    await expectRefused(() => update(client, record.id, body), record.id);
  });

  it("R-CAT-U-36: changing a stored photo_captured_at entry without adding a photo is refused", async () => {
    const { client, record, capturedAt } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, weight_hoz: 5600, photo_captured_at: [iso(capturedAt - HOUR), iso(capturedAt)] }), record.id);
  });

  it.each([
    ["no rev", (body: FormData) => body.delete("rev")],
    ["a stale rev (a retried upload whose first attempt landed)", (body: FormData) => body.set("rev", "0")],
  ])("R-CAT-U-39: adding a photo with %s is refused; no file added, no audit row", async (_case, change) => {
    const { client, record, capturedAt } = await submitted();
    const body = await addPhoto(record, await fixture("clean-1.jpg"), capturedAt);
    change(body);
    await expectRefused(() => update(client, record.id, body), record.id);
  });

  it("R-CAT-U-39: the same add sent twice lands once; the retry is refused as stale", async () => {
    const { client, record, capturedAt } = await submitted();
    const first = await update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt));
    expect(first.photo).toHaveLength(3);

    await expectRefused(async () => update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt)), record.id);
    expect((await stored(record.id)).photo).toHaveLength(3);
  });

  it("R-CAT-U-40: two adds sent at the same moment with the same rev: exactly one lands, one photo added, one edit row", async () => {
    const { client, record, capturedAt } = await submitted();
    const [a, b] = await Promise.all([
      statusOf(update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt))),
      statusOf(update(client, record.id, await addPhoto(record, await fixture("clean-2.jpg"), capturedAt))),
    ]);

    expect([a, b].filter((s) => s === "allowed")).toHaveLength(1);
    const after = await stored(record.id);
    expect(after.photo).toHaveLength(3);
    expect(after.rev).toBe(2);
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["edit"]);
  });
});

describe("retract", () => {
  it("R-CAT-U-29: M retracts own pending catch; hidden from others; one retract row", async () => {
    const { client, record } = await submitted();

    expect(await update(client, record.id, { rev: 1, status: "retracted" })).toMatchObject({ status: "retracted", rev: 2 });
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["retract"]);
    expect(await statusOf((await as("Y")).collection("catches").getOne(record.id))).toBe(404);
    expect(await statusOf(client.collection("catches").getOne(record.id))).toBe("allowed");
  });

  it("R-CAT-U-30: M may not retract own catch after it was judged", async () => {
    const verified = catchOf(world, "E1.M.verified");
    await expectRefused(async () => update(await as("M"), verified.id, { rev: verified.rev, status: "retracted" }), verified.id);
  });

  it("R-CAT-U-30: N may not retract after the deadline (EC, closed)", async () => {
    const pending = catchOf(world, "EC.N.pending");
    await expectRefused(async () => update(await as("N"), pending.id, { rev: pending.rev, status: "retracted" }), pending.id);
  });

  it("R-CAT-U-32: a retracted catch can't be un-retracted", async () => {
    const { client, record } = await submitted();
    await update(client, record.id, { rev: 1, status: "retracted" });
    await expectRefused(() => update(client, record.id, { rev: 2, status: "pending" }), record.id);
    await expectRefused(() => update(client, record.id, { rev: 2, weight_hoz: 5600 }), record.id);
  });

  it("a retract that also edits or adds a photo is refused: retract goes on its own", async () => {
    const { client, record, capturedAt } = await submitted();
    await expectRefused(() => update(client, record.id, { rev: 1, status: "retracted", weight_hoz: 5600 }), record.id);
    await expectRefused(async () => update(client, record.id, await addPhoto(record, await fixture("clean-1.jpg"), capturedAt, { status: "retracted" })), record.id);
  });
});

// Until S3 these two asserted that every judge request was refused. S3 builds the judge branch of the
// hook (R-CAT-U-01, U-04; the full set is in test/judge.test.ts), so they now assert it lands.
describe("judging (S3)", () => {
  it("R-CAT-U-01: K approving M's pending catch lands, with one approve row", async () => {
    const { record } = await submitted();
    expect(await update(await as("K"), record.id, { rev: 1, status: "verified" })).toMatchObject({ status: "verified", judged_by: users.K.id, rev: 2 });
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["approve"]);
  });

  it("R-CAT-U-04: K correcting M's pending catch lands as verified, with one correct row", async () => {
    const { record } = await submitted();
    expect(await update(await as("K"), record.id, { rev: 1, status: "verified", weight_hoz: 5600, reason: "Readout shows 3.50" })).toMatchObject({ status: "verified", weight_hoz: 5600 });
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["correct"]);
  });
});

describe("R-AUD-H-04 and the order of checks", () => {
  it("refused updates write no audit row", async () => {
    const before = (await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems;
    const y = catchOf(world, "E1.Y.pending");
    await statusOf(update(await as("M"), y.id, { rev: y.rev, weight_hoz: 1 }));
    await statusOf(update(actAsAnon(pocketbase()), y.id, { rev: y.rev, weight_hoz: 1 }));
    // A judge request the rule refuses: K echoes a rev that isn't the stored one (R-CAT-U-13).
    await statusOf(update(await as("K"), y.id, { rev: y.rev + 5, status: "verified" }));

    expect((await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems).toBe(before);
  });

  it("a member poking at Y's hidden rejected catch gets the rule's answer, like a catch that doesn't exist", async () => {
    const hidden = catchOf(world, "E1.Y.rejected");
    const m = await as("M");

    expect(await statusOf(update(m, hidden.id, { rev: hidden.rev, weight_hoz: 1 }))).toBe(await statusOf(update(m, "doesnotexist123", { rev: 1, weight_hoz: 1 })));
  });

  it("the superuser's edits move rev too, so a screen holding the old rev reloads", async () => {
    const { client, record } = await submitted();
    await pocketbase().superuser.collection("catches").update(record.id, { weight_hoz: 5600 });

    expect((await stored(record.id)).rev).toBe(2);
    await expectRefused(() => update(client, record.id, { rev: 1, weight_hoz: 5700 }), record.id);
  });
});
