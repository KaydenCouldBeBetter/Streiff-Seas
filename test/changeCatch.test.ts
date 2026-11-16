// Edit, Add photos and Retract from the app (web/src/lib/changeCatch.ts, changeCopy.ts and
// weightEntryFromHoz), against a PocketBase booted from pb_migrations/ and pb_hooks/ with the
// fixture world. Each request echoes the loaded rev; refusals are explained by reloading; Retry
// after no reply never sends a change twice. Needs exiftool, as the server does.

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PocketBase, { type RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  catchBaseOf,
  changeLanded,
  editFields,
  refusalReason,
  retryChange,
  sendChange,
  type CatchBase,
  type Change,
  type Reloaded,
} from "../web/src/lib/changeCatch";
import { changeNotice, notSentMessage } from "../web/src/lib/changeCopy";
import { parseWeight, weightEntryFromHoz } from "../web/src/lib/weightEntry";
import type { PreparedPhoto } from "../web/src/lib/sendCatch";
import { freePort, REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type World } from "./harness/world";
import { exiftoolGps, haveTool, leaksIn } from "./spike/leaks";

const pocketbase = usePocketBase();
const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
const HOUR = 3600_000;

if (!haveTool("exiftool")) throw new Error("test/changeCatch.test.ts needs exiftool installed");

let users: FixtureUsers;
let world: World;
let scratch: string;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  scratch = await mkdtemp(path.join(tmpdir(), "change-catch-"));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const iso = (ms: number) => new Date(ms).toISOString();
const stored = (id: string) => pocketbase().superuser.collection("catches").getOne(id);

async function photo(name = "clean-1.jpg", capturedAt: Date | null = new Date(Date.now() - HOUR)): Promise<PreparedPhoto> {
  return { file: new File([await readFile(path.join(FIXTURES, name))], name, { type: name.endsWith(".png") ? "image/png" : "image/jpeg" }), capturedAt };
}

/** A pending catch M submits through the API now: 5,500 hoz (3 lb 7.0 oz), two photos, rev 1. */
async function submitted(): Promise<{ client: PocketBase; record: RecordModel; base: CatchBase }> {
  const client = await as("M");
  const capturedAt = Date.now() - HOUR;
  const body = new FormData();
  body.set("entry", entryOf(world, "E1.M").id);
  body.set("species", world.species.largemouth.id);
  body.set("weight_hoz", "5500");
  body.set("client_uuid", randomUUID());
  body.set("captured_at", iso(capturedAt));
  body.set("photo_captured_at", JSON.stringify([iso(capturedAt), iso(capturedAt)]));
  body.append("photo", (await photo("clean-1.jpg")).file);
  body.append("photo", (await photo("clean-2.jpg")).file);
  const record = await client.collection("catches").create(body);
  return { client, record, base: catchBaseOf(record) };
}

async function auditRows(catchId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter("catch = {:id}", { id: catchId }), sort: "created" });
}

/** The superuser moves rev (any change does, through the compare-and-swap), as a second device would. */
async function changedElsewhere(id: string): Promise<void> {
  await pocketbase().superuser.collection("catches").update(id, { weight_hoz: 6000 });
}

const now = () => Date.now();

describe("edit (MY-03)", () => {
  it("saves a weight edit with the loaded rev: rev + 1 and one edit row", async () => {
    const { client, base } = await submitted();

    expect(await sendChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now())).toEqual({ kind: "saved" });
    expect(await stored(base.id)).toMatchObject({ weight_hoz: 5488, rev: 2, status: "pending" });
    expect((await auditRows(base.id)).map((row) => row.action)).toEqual(["create", "edit"]);
  });

  it("saves a species edit alone", async () => {
    const { client, base } = await submitted();

    expect(await sendChange(client, base, { action: "edit", fields: { species: world.species.smallmouth.id } }, now())).toEqual({ kind: "saved" });
    expect(await stored(base.id)).toMatchObject({ species: world.species.smallmouth.id, weight_hoz: 5500 });
  });

  it("refused as changed when another device moved rev since the screen loaded", async () => {
    const { client, base } = await submitted();
    await changedElsewhere(base.id);

    expect(await sendChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now())).toMatchObject({ kind: "refused", reason: "changed" });
    expect(await stored(base.id)).toMatchObject({ weight_hoz: 6000 });
  });

  it("refused as approved when the judge decided first", async () => {
    const { client, base } = await submitted();
    await pocketbase().superuser.collection("catches").update(base.id, { status: "verified", judged_by: users.K.id });

    const result = await sendChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now());
    expect(result).toMatchObject({ kind: "refused", reason: "approved" });
    expect(changeNotice("edit", result)).toEqual({
      tone: "info",
      title: "Not saved",
      message: "The judge approved this catch while you were editing. It's shown as it is now.",
    });
  });

  it("refused as withdrawn on W's catch", async () => {
    const w = await as("W");
    const base = catchBaseOf(catchOf(world, "E1.W.pending"));

    expect(await sendChange(w, base, { action: "edit", fields: { weight_hoz: 9000 } }, now())).toMatchObject({ kind: "refused", reason: "withdrawn" });
  });

  it("refused as deadline once submit_deadline has passed, with the deadline in the message", async () => {
    const { client, base } = await submitted();
    const events = pocketbase().superuser.collection("events");
    const before = world.events.E1.submit_deadline as string;
    const passed = new Date(Date.now() - HOUR);
    try {
      await events.update(world.events.E1.id, { submit_deadline: passed.toISOString() });
      const result = await sendChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now());

      expect(result).toMatchObject({ kind: "refused", reason: "deadline" });
      const notice = changeNotice("edit", result);
      expect(notice?.tone).toBe("warning");
      expect(notice?.message).toMatch(/^The submission deadline passed at .+, so this catch can't change now\.$/);
    } finally {
      await events.update(world.events.E1.id, { submit_deadline: before });
    }
  });

  it("Retry after a lost reply finds the edit saved and sends nothing", async () => {
    const { client, base } = await submitted();
    const change: Change = { action: "edit", fields: { weight_hoz: 5488 } };
    await sendChange(client, base, change, now());

    expect(await retryChange(client, base, change, now())).toEqual({ kind: "already-saved" });
    expect((await auditRows(base.id)).map((row) => row.action)).toEqual(["create", "edit"]);
    expect(await stored(base.id)).toMatchObject({ rev: 2 });
  });

  it("Retry when nothing landed sends it", async () => {
    const { client, base } = await submitted();

    expect(await retryChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now())).toEqual({ kind: "saved" });
    expect(await stored(base.id)).toMatchObject({ weight_hoz: 5488, rev: 2 });
  });

  it("Retry when the catch changed some other way is refused, not resent", async () => {
    const { client, base } = await submitted();
    await changedElsewhere(base.id);

    expect(await retryChange(client, base, { action: "edit", fields: { weight_hoz: 5488 } }, now())).toMatchObject({ kind: "refused", reason: "changed" });
    expect(await stored(base.id)).toMatchObject({ weight_hoz: 6000 });
  });
});

describe("add photos (MY-04)", () => {
  it("adds one photo: 3 photos, the stored times kept plus the new one, photo_added, one edit row", async () => {
    const { client, base, record } = await submitted();
    const added = await photo("clean-1.jpg", new Date(Date.now() - HOUR / 2));

    expect(await sendChange(client, base, { action: "photos", photos: [added] }, now())).toEqual({ kind: "saved" });
    const after = await stored(base.id);
    expect(after.photo).toHaveLength(3);
    expect((after.photo as string[]).slice(0, 2)).toEqual(record.photo);
    expect(after.photo_captured_at).toHaveLength(3);
    expect(new Date((after.photo_captured_at as string[])[2]!).getTime()).toBe(added.capturedAt!.getTime());
    expect(after.flags).toContain("photo_added");
    expect((await auditRows(base.id)).map((row) => row.action)).toEqual(["create", "edit"]);
  });

  it("an added photo with GPS comes out clean", async () => {
    const { client, base } = await submitted();
    await sendChange(client, base, { action: "photos", photos: [await photo("gps.jpg")] }, now());
    const after = await stored(base.id);
    const name = (after.photo as string[])[2]!;
    const bytes = Buffer.from(await (await fetch(client.files.getURL(after, name, { token: await client.files.getToken() }))).arrayBuffer());
    const file = path.join(scratch, name);
    await writeFile(file, bytes);

    expect([...leaksIn(bytes), ...(exiftoolGps(file) ?? [])]).toEqual([]);
  });

  it("refused as full when the catch already has 4 photos", async () => {
    const { client, base } = await submitted();
    await sendChange(client, base, { action: "photos", photos: [await photo(), await photo("clean-2.jpg")] }, now());
    const full = catchBaseOf(await stored(base.id));

    expect(full.photoCount).toBe(4);
    expect(await sendChange(client, full, { action: "photos", photos: [await photo()] }, now())).toMatchObject({ kind: "refused", reason: "full" });
  });

  it("refused as photo for a file that isn't a JPEG", async () => {
    const { client, base } = await submitted();

    const result = await sendChange(client, base, { action: "photos", photos: [await photo("text-chunk.png")] }, now());
    expect(result).toMatchObject({ kind: "refused", reason: "photo" });
    expect(changeNotice("photos", result, 1)?.title).toBe("Photo not added");
    expect((await stored(base.id)).photo).toHaveLength(2);
  });

  it("Retry after a lost reply finds the photo landed and uploads nothing", async () => {
    const { client, base } = await submitted();
    const change: Change = { action: "photos", photos: [await photo()] };
    await sendChange(client, base, change, now());

    expect(await retryChange(client, base, change, now())).toEqual({ kind: "already-saved" });
    expect((await stored(base.id)).photo).toHaveLength(3);
  });

  it("a second add on the old rev is refused as changed, and adds nothing", async () => {
    const { client, base } = await submitted();
    await sendChange(client, base, { action: "photos", photos: [await photo()] }, now());

    expect(await sendChange(client, base, { action: "photos", photos: [await photo()] }, now())).toMatchObject({ kind: "refused", reason: "changed" });
    expect((await stored(base.id)).photo).toHaveLength(3);
  });
});

describe("retract (MY-05)", () => {
  it("retracts with the loaded rev: one retract row", async () => {
    const { client, base } = await submitted();

    expect(await sendChange(client, base, { action: "retract" }, now())).toEqual({ kind: "saved" });
    expect(await stored(base.id)).toMatchObject({ status: "retracted", rev: 2 });
    expect((await auditRows(base.id)).map((row) => row.action)).toEqual(["create", "retract"]);
  });

  it("a second retract on the old rev is refused as retracted", async () => {
    const { client, base } = await submitted();
    await sendChange(client, base, { action: "retract" }, now());

    expect(await sendChange(client, base, { action: "retract" }, now())).toMatchObject({ kind: "refused", reason: "retracted" });
  });

  it("Retry after a lost reply finds it retracted and sends nothing", async () => {
    const { client, base } = await submitted();
    await sendChange(client, base, { action: "retract" }, now());

    expect(await retryChange(client, base, { action: "retract" }, now())).toEqual({ kind: "already-saved" });
    expect((await auditRows(base.id)).map((row) => row.action)).toEqual(["create", "retract"]);
  });

  it("refused as approved: Not retracted", async () => {
    const { client, base } = await submitted();
    await pocketbase().superuser.collection("catches").update(base.id, { status: "verified", judged_by: users.K.id });

    const result = await sendChange(client, base, { action: "retract" }, now());
    expect(changeNotice("retract", result)).toEqual({
      tone: "info",
      title: "Not retracted",
      message: "The judge approved this catch before your retract arrived. It's shown as it is now.",
    });
  });
});

describe("no reply", () => {
  it("is not-sent, for a send and for a retry", async () => {
    const { client, base } = await submitted();
    const offline = new PocketBase(`http://127.0.0.1:${await freePort()}`);
    offline.authStore.save(client.authStore.token, client.authStore.record);

    expect(await sendChange(offline, base, { action: "edit", fields: { weight_hoz: 5488 } }, now())).toEqual({ kind: "not-sent" });
    expect(await retryChange(offline, base, { action: "retract" }, now())).toEqual({ kind: "not-sent" });
    expect(await stored(base.id)).toMatchObject({ rev: 1, weight_hoz: 5500, status: "pending" });
  });

  it("has the Figma NOT SENT copy", () => {
    expect(notSentMessage("edit").message).toBe("Your edit didn't reach the club, so the catch hasn't changed yet. Tap Retry when you have signal.");
    expect(notSentMessage("retract").message).toBe("Your retract didn't reach the club. The catch is still pending until Retry gets through.");
    expect(notSentMessage("photos", 1).title).toBe("Photo not uploaded");
  });
});

describe("editFields and the weight prefill", () => {
  const base: CatchBase = { id: "c", rev: 1, speciesId: "lm", weightHoz: 5500, lengthQ: 0, photoCount: 2, photoCapturedAt: [] };

  it("sends nothing when nothing changed, and only what changed", () => {
    expect(editFields(base, "weight", "lm", 5500)).toBeNull();
    expect(editFields(base, "weight", "sm", 5500)).toEqual({ species: "sm" });
    expect(editFields(base, "weight", "lm", 5488)).toEqual({ weight_hoz: 5488 });
  });

  it.each([
    // 3 lb 7.0 oz is 3.4375 lb: never shown as 3.44 lb, which reads back as 5,504.
    [5500, "lb", "lb_oz", 5500],
    [5500, "lb_oz", "lb_oz", 5500],
    // 3.43 lb is not a whole tenth of an ounce: shown in decimal pounds whatever the preference.
    [5488, "lb_oz", "lb", 5488],
    [5488, "lb", "lb", 5488],
    // 3.50 lb = 3 lb 8.0 oz: exact in both, so the preference wins.
    [5600, "lb_oz", "lb_oz", 5600],
    [5600, "lb", "lb", 5600],
  ] as const)("%i hoz with %s preferred opens in %s and reads back as %i", (hoz, preferred, format, readBack) => {
    const entry = weightEntryFromHoz(hoz, preferred);

    expect(entry.format).toBe(format);
    expect(parseWeight(entry)).toEqual({ ok: true, hoz: readBack });
    // So an untouched prefill sends no weight.
    expect(editFields(base, "weight", "lm", readBack)).toEqual(hoz === 5500 ? null : { weight_hoz: readBack });
  });
});

describe("refusalReason and changeLanded", () => {
  const base: CatchBase = { id: "c", rev: 3, speciesId: "lm", weightHoz: 5500, lengthQ: 0, photoCount: 2, photoCapturedAt: [] };
  const reloaded = (over: Partial<Reloaded> & { rev?: number; photoCount?: number } = {}): Reloaded => ({
    base: { ...base, rev: over.rev ?? base.rev, photoCount: over.photoCount ?? base.photoCount },
    status: "pending",
    withdrawn: false,
    eventStatus: "live",
    submitDeadline: new Date(Date.now() + HOUR),
    ...over,
  });
  const edit: Change = { action: "edit", fields: { weight_hoz: 5488 } };

  it.each([
    ["approved", reloaded({ status: "verified", withdrawn: true })],
    ["rejected", reloaded({ status: "rejected" })],
    ["retracted", reloaded({ status: "retracted", rev: 9 })],
    ["withdrawn", reloaded({ withdrawn: true, eventStatus: "closed" })],
    ["deadline", reloaded({ eventStatus: "closed", rev: 9 })],
    ["deadline", reloaded({ submitDeadline: new Date(Date.now() - 1) })],
    ["changed", reloaded({ rev: 4 })],
    ["unknown", reloaded()],
  ] as const)("%s first", (reason, state) => {
    expect(refusalReason(edit, base, state, Date.now())).toBe(reason);
  });

  it("full before photo, photo only for a photo refusal", async () => {
    const one: Change = { action: "photos", photos: [await photo()] };

    expect(refusalReason(one, base, reloaded({ photoCount: 4 }), Date.now(), ["photo"])).toBe("full");
    expect(refusalReason(one, base, reloaded(), Date.now(), ["photo"])).toBe("photo");
    expect(refusalReason(edit, base, reloaded(), Date.now(), ["photo"])).toBe("unknown");
  });

  it("an edit landed only when rev moved and every sent field matches", () => {
    expect(changeLanded(edit, base, reloaded({ rev: 4, base: { ...base, rev: 4, weightHoz: 5488 } }))).toBe(true);
    expect(changeLanded(edit, base, reloaded({ rev: 4, base: { ...base, rev: 4, weightHoz: 6000 } }))).toBe(false);
    expect(changeLanded(edit, base, reloaded({ base: { ...base, weightHoz: 5488 } }))).toBe(false);
  });
});
