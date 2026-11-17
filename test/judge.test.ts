// S3: the judge approves, rejects, corrects and re-judges (docs/security.md "catches" Update, the
// judge branch, and Hooks, On update by a judge), against a PocketBase booted from pb_migrations/
// and pb_hooks/ with the fixture world. K judges every event; S is E1's backup judge and N every
// other event's; O is an organizer who judges nothing. Needs exiftool: each test submits fresh
// catches through the real create hook.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { computeStandings } from "../web/src/lib/scoring";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type World } from "./harness/world";
import { haveTool } from "./spike/leaks";

const pocketbase = usePocketBase();
const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
const HOUR = 3600_000;
const REFUSED = [400, 403, 404];
const SNAPSHOT_FIELDS = ["flags", "length_q", "photo", "photo_captured_at", "reason", "rev", "species", "status", "weight_hoz"];

if (!haveTool("exiftool")) throw new Error("test/judge.test.ts needs exiftool installed (brew install exiftool)");

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const iso = (ms: number) => new Date(ms).toISOString();
const stored = (id: string) => pocketbase().superuser.collection("catches").getOne(id);
const update = (client: PocketBase, id: string, body: Record<string, unknown>) => client.collection("catches").update(id, body);

async function fixture(name: string): Promise<File> {
  return new File([await readFile(path.join(FIXTURES, name))], name, { type: "image/jpeg" });
}

type EntryKey = `${"E1" | "E2" | "EL" | "EC"}.${FixtureName}`;

/**
 * A catch the angler submits through the API now (pending, rev 1). `flagged` leaves photo 2
 * without a capture time, so the create hook flags it extra_photo_no_time.
 */
async function submitted(entryKey: EntryKey = "E1.M", options: { weightHoz?: number; lengthQ?: number; flagged?: boolean } = {}): Promise<RecordModel> {
  const who = entryKey.split(".")[1] as FixtureName;
  const client = await as(who);
  const capturedAt = Date.now() - HOUR;
  const body = new FormData();
  body.set("entry", entryOf(world, entryKey).id);
  body.set("species", world.species.largemouth.id);
  if (options.lengthQ !== undefined) body.set("length_q", String(options.lengthQ));
  else body.set("weight_hoz", String(options.weightHoz ?? 5500));
  body.set("client_uuid", randomUUID());
  body.set("captured_at", iso(capturedAt));
  body.set("photo_captured_at", JSON.stringify([iso(capturedAt), options.flagged ? null : iso(capturedAt)]));
  body.append("photo", await fixture("clean-1.jpg"));
  body.append("photo", await fixture("clean-2.jpg"));
  return client.collection("catches").create(body);
}

/** A catch in a given state, set by the superuser where no judge path exists yet in the test. */
async function inState(entryKey: EntryKey, status: "verified" | "rejected" | "retracted"): Promise<RecordModel> {
  const record = await submitted(entryKey);
  return pocketbase()
    .superuser.collection("catches")
    .update(record.id, { status, reason: status === "rejected" ? "Readout not legible" : "" });
}

async function rows(catchId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  const all = await superuser.collection("audit_log").getFullList({ filter: superuser.filter("target_id = {:id}", { id: catchId }), sort: "created" });
  return all.filter((row) => row.action !== "create");
}

/** Refused, and the catch and its audit rows are exactly as they were (R-AUD-H-04). */
async function expectRefused(request: () => Promise<unknown>, id: string): Promise<void> {
  const before = await stored(id);
  const auditBefore = (await rows(id)).length;
  expect(REFUSED).toContain(await statusOf(request()));
  const after = await stored(id);
  expect(after).toMatchObject({
    rev: before.rev,
    status: before.status,
    reason: before.reason,
    judged_by: before.judged_by,
    weight_hoz: before.weight_hoz,
    length_q: before.length_q,
    species: before.species,
    flags: before.flags,
  });
  expect((await rows(id)).length).toBe(auditBefore);
}

/** One decision as `who`, echoing the stored rev. */
async function judge(who: FixtureName, record: RecordModel, body: Record<string, unknown>): Promise<RecordModel> {
  const current = await stored(record.id);
  return update(await as(who), record.id, { rev: current.rev, ...body });
}

describe("approve, reject, correct", () => {
  it("R-CAT-U-01, R-AUD-H-01, H-05: K approves M's pending catch; judged_by K; rev + 1; one approve row with both snapshots", async () => {
    const record = await submitted();

    const after = await judge("K", record, { status: "verified" });

    expect(after).toMatchObject({ status: "verified", judged_by: users.K.id, rev: 2, reason: "" });
    const [row, ...more] = await rows(record.id);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ action: "approve", actor: users.K.id, catch: record.id, event: world.events.E1.id });
    expect(Object.keys(row?.before as object).sort()).toEqual(SNAPSHOT_FIELDS);
    expect(Object.keys(row?.after as object).sort()).toEqual(SNAPSHOT_FIELDS);
    expect(row?.before).toMatchObject({ status: "pending", rev: 1 });
    expect(row?.after).toMatchObject({ status: "verified", rev: 2 });
  });

  it("R-CAT-U-02: K rejects with a reason; one reject row carrying it", async () => {
    const record = await submitted();

    expect(await judge("K", record, { status: "rejected", reason: "Readout not legible" })).toMatchObject({ status: "rejected", reason: "Readout not legible", judged_by: users.K.id });
    const [row, ...more] = await rows(record.id);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ action: "reject", after: { status: "rejected", reason: "Readout not legible" } });
  });

  it("R-CAT-U-03: K may not reject without a reason, or with one made of spaces", async () => {
    const record = await submitted();
    await expectRefused(() => judge("K", record, { status: "rejected" }), record.id);
    await expectRefused(() => judge("K", record, { status: "rejected", reason: "" }), record.id);
    await expectRefused(() => judge("K", record, { status: "rejected", reason: "   " }), record.id);
  });

  it("R-CAT-U-04, scoring.md example 15: K corrects 4.73 to 4.37 with a reason; verified; exactly one correct row, no approve row", async () => {
    const record = await submitted("E1.M", { weightHoz: 7568 });

    const after = await judge("K", record, { weight_hoz: 6992, reason: "The scale reads 4.37 in photo 2" });

    expect(after).toMatchObject({ status: "verified", weight_hoz: 6992, judged_by: users.K.id, reason: "The scale reads 4.37 in photo 2" });
    const all = await rows(record.id);
    expect(all.map((row) => row.action)).toEqual(["correct"]);
    expect(all[0]?.before).toMatchObject({ weight_hoz: 7568, status: "pending" });
    expect(all[0]?.after).toMatchObject({ weight_hoz: 6992, status: "verified" });
  });

  it("R-CAT-U-04: a correction that also says status verified is the same single correct row", async () => {
    const record = await submitted();
    await judge("K", record, { status: "verified", weight_hoz: 5400, reason: "Scale shows 3.38" });
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["correct"]);
  });

  it("R-CAT-U-05: K may not correct without a reason, or with one made of spaces", async () => {
    const record = await submitted();
    await expectRefused(() => judge("K", record, { weight_hoz: 5400 }), record.id);
    await expectRefused(() => judge("K", record, { weight_hoz: 5400, reason: "" }), record.id);
    await expectRefused(() => judge("K", record, { species: world.species.smallmouth.id, reason: "  " }), record.id);
  });

  it("R-CAT-U-05: a decided catch's old reason doesn't count as the correction's reason", async () => {
    const record = await inState("E1.M", "rejected");
    await expectRefused(() => judge("K", record, { species: world.species.smallmouth.id }), record.id);
  });

  it("R-CAT-U-44: K corrects species on M's rejected catch and length_q on N's pending catch in EL, each with a reason; both verified, one correct row each", async () => {
    const rejected = await inState("E1.M", "rejected");
    expect(await judge("K", rejected, { species: world.species.smallmouth.id, reason: "Smallmouth in photo 1" })).toMatchObject({
      status: "verified",
      species: world.species.smallmouth.id,
    });
    expect((await rows(rejected.id)).map((row) => row.action)).toEqual(["correct"]);

    const length = await submitted("EL.N", { lengthQ: 70 });
    expect(await judge("K", length, { length_q: 66, reason: "The board reads 16 1/2" })).toMatchObject({ status: "verified", length_q: 66 });
    expect((await rows(length.id)).map((row) => row.action)).toEqual(["correct"]);
  });

  it("R-CAT-U-41: K may not correct and reject in one request", async () => {
    const record = await submitted();
    await expectRefused(() => judge("K", record, { status: "rejected", reason: "Wrong fish", weight_hoz: 5000 }), record.id);
    await expectRefused(() => judge("K", record, { status: "rejected", reason: "Wrong fish", species: world.species.smallmouth.id }), record.id);
  });

  it("R-CAT-U-38: approving, rejecting or correcting a flagged catch leaves flags unchanged", async () => {
    for (const body of [{ status: "verified" }, { status: "rejected", reason: "No time on photo 2" }, { weight_hoz: 5300, reason: "Scale reads 3.31" }]) {
      const record = await submitted("E1.M", { flagged: true });
      expect(record.flags).toEqual(["extra_photo_no_time"]);
      expect((await judge("K", record, body)).flags).toEqual(["extra_photo_no_time"]);
    }
  });

  it("approving a catch that is already verified changes nothing, so it is refused", async () => {
    const record = await inState("E1.M", "verified");
    await expectRefused(() => judge("K", record, { status: "verified" }), record.id);
  });
});

describe("who may judge", () => {
  it("R-CAT-U-06: K may not approve own catch", async () => {
    const record = await submitted("E1.K");
    await expectRefused(() => judge("K", record, { status: "verified" }), record.id);
  });

  it("R-CAT-U-07, scoring.md example 12: S approves K's catch in E1; judged_by S", async () => {
    const record = await submitted("E1.K");
    expect(await judge("S", record, { status: "verified" })).toMatchObject({ status: "verified", judged_by: users.S.id });
    expect((await rows(record.id)).map((row) => [row.action, row.actor])).toEqual([["approve", users.S.id]]);
  });

  it("R-CAT-U-08: S may not approve M's catch in E1", async () => {
    const record = await submitted("E1.M");
    await expectRefused(() => judge("S", record, { status: "verified" }), record.id);
  });

  it("R-CAT-U-09, scoring.md example 18: S may not approve K's catch in E2, where N is the backup judge", async () => {
    const record = await submitted("E2.K");
    await expectRefused(() => judge("S", record, { status: "verified" }), record.id);
    expect(await judge("N", record, { status: "verified" })).toMatchObject({ judged_by: users.N.id });
  });

  it("R-CAT-U-10: M may not approve Y's catch", async () => {
    const record = await submitted("E1.Y");
    await expectRefused(() => judge("M", record, { status: "verified" }), record.id);
  });

  it("R-CAT-U-46: O, an organizer who isn't the judge, may not judge M's catch", async () => {
    const record = await submitted("E1.M");
    await expectRefused(() => judge("O", record, { status: "verified" }), record.id);
    await expectRefused(() => judge("O", record, { status: "rejected", reason: "No" }), record.id);
  });

  it("R-CAT-U-12: nobody changes a catch in the final EF", async () => {
    const kCatch = catchOf(world, "EF.K.verified");
    const nCatch = catchOf(world, "EF.N.verified");
    await expectRefused(() => judge("K", nCatch, { status: "rejected", reason: "Late" }), nCatch.id);
    await expectRefused(() => judge("N", kCatch, { status: "rejected", reason: "Late" }), kCatch.id);
    await expectRefused(() => judge("N", nCatch, { weight_hoz: 1000 }), nCatch.id);
  });
});

describe("re-judging", () => {
  it("R-CAT-U-11: K changes verified to rejected with a reason, live (E1) and closed (EC); audited", async () => {
    const live = await inState("E1.M", "verified");
    expect(await judge("K", live, { status: "rejected", reason: "The fish in photo 2 isn't the fish in photo 1" })).toMatchObject({ status: "rejected" });
    expect((await rows(live.id)).map((row) => row.action)).toEqual(["reject"]);

    const closed = catchOf(world, "EC.K.verified");
    expect(await judge("N", closed, { status: "rejected", reason: "Readout not legible" })).toMatchObject({ status: "rejected", judged_by: users.N.id });
    expect((await rows(closed.id)).map((row) => row.action)).toEqual(["reject"]);
  });

  it("R-CAT-U-42: changing a decided catch's status needs a reason either way", async () => {
    const verified = await inState("E1.M", "verified");
    await expectRefused(() => judge("K", verified, { status: "rejected" }), verified.id);
    const rejected = await inState("E1.M", "rejected");
    await expectRefused(() => judge("K", rejected, { status: "verified" }), rejected.id);
  });

  it("R-CAT-U-43, scoring.md example 26: K re-approves M's rejected catch with a reason; verified; one approve row; M reads both steps with both reasons", async () => {
    const record = await submitted();
    await judge("K", record, { status: "rejected", reason: "Readout not legible" });
    expect(await judge("K", record, { status: "verified", reason: "Readout legible at full size" })).toMatchObject({ status: "verified", reason: "Readout legible at full size" });

    const m = await as("M");
    const history = await m.collection("audit_log").getFullList({ filter: m.filter("catch = {:id}", { id: record.id }), sort: "created" });
    expect(history.map((row) => [row.action, (row.after as { reason: string }).reason])).toEqual([
      ["create", ""],
      ["reject", "Readout not legible"],
      ["approve", "Readout legible at full size"],
    ]);
    // Another member reads the overturned rejection too, now the catch is verified (R-AUD-L-07).
    const y = await as("Y");
    expect((await y.collection("audit_log").getFullList({ filter: y.filter("catch = {:id}", { id: record.id }) })).map((row) => row.action).sort()).toEqual(["approve", "create", "reject"]);
  });

  it("R-CAT-U-45: K may not send only a reason and the rev to a decided catch", async () => {
    const record = await inState("E1.M", "rejected");
    await expectRefused(() => judge("K", record, { reason: "Better wording" }), record.id);
  });

  it("scoring.md example 21: correcting a verified 2.05 to 1.05 re-culls A from 28.05 to 27.60", async () => {
    const { superuser } = pocketbase();
    const entry = await superuser.collection("entries").create({ event: world.events.E1.id, angler: users.X.id, display_name: "Angler X" });
    const lbs = [2.1, 3.45, 1.2, 4.02, 2.88, 1.75, 3.1, 2.4, 0.95, 1.6, 2.05, 3.8, 2.5];
    const catches: RecordModel[] = [];
    for (const lb of lbs) {
      const capturedAt = iso(Date.now() - HOUR);
      catches.push(
        await superuser.collection("catches").create({
          entry: entry.id,
          species: world.species.largemouth.id,
          weight_hoz: Math.round(lb * 1600),
          photo: [await fixture("clean-1.jpg"), await fixture("clean-2.jpg")],
          captured_at: capturedAt,
          photo_captured_at: [capturedAt, capturedAt],
          client_uuid: randomUUID(),
          rev: 1,
          status: "verified",
          judged_by: users.K.id,
          flags: [],
        }),
      );
    }
    const total = async () => {
      const list = await superuser.collection("catches").getFullList({ filter: superuser.filter("entry = {:e}", { e: entry.id }) });
      const [row] = computeStandings("weight", [{ id: entry.id, withdrawn: false }], list.map((c) => ({ id: c.id, entry: entry.id, status: c.status, weight_hoz: c.weight_hoz })));
      return (row?.total ?? 0) / 1600;
    };
    expect(await total()).toBe(28.05);

    const twoOhFive = catches[lbs.indexOf(2.05)]!;
    await judge("K", twoOhFive, { weight_hoz: 1680, reason: "The readout shows 1.05" });

    expect(await total()).toBe(27.6);
  });
});

describe("judge guards", () => {
  it("R-CAT-U-13: K's approval with the rev K loaded is refused after M edited the catch; with the new rev it lands", async () => {
    const record = await submitted();
    await update(await as("M"), record.id, { rev: 1, weight_hoz: 5488 });

    await expectRefused(async () => update(await as("K"), record.id, { rev: 1, status: "verified" }), record.id);
    expect(await update(await as("K"), record.id, { rev: 2, status: "verified" })).toMatchObject({ status: "verified", weight_hoz: 5488 });
  });

  it("two approvals sent at once with the same rev: exactly one lands, with one row", async () => {
    const record = await submitted();
    const k = await as("K");
    const results = await Promise.all([statusOf(update(k, record.id, { rev: 1, status: "verified" })), statusOf(update(k, record.id, { rev: 1, status: "verified" }))]);
    expect(results.filter((r) => r === "allowed")).toHaveLength(1);
    expect((await rows(record.id)).map((row) => row.action)).toEqual(["approve"]);
  });

  it("R-CAT-U-14: K may not set status to pending, retracted or anything but verified or rejected", async () => {
    const record = await submitted();
    for (const status of ["pending", "retracted", "approved"]) await expectRefused(() => judge("K", record, { status }), record.id);
  });

  it("R-CAT-U-15, U-33, U-37: a judge body may not set judged_by, flags, entry, photo, photo_captured_at, captured_at or client_uuid", async () => {
    const record = await submitted();
    const extras: Record<string, unknown>[] = [
      { judged_by: users.S.id },
      { flags: [] },
      { entry: entryOf(world, "E1.Y").id },
      { photo: [] },
      { photo_captured_at: [] },
      { captured_at: iso(Date.now()) },
      { client_uuid: randomUUID() },
    ];
    for (const extra of extras) await expectRefused(() => judge("K", record, { status: "verified", ...extra }), record.id);
  });

  it("R-CAT-U-33: a judge may not remove or add a photo with the photo- or photo+ modifiers, judge or backup judge; the files stay as they were", async () => {
    const expectPhotosKept = async (id: string, request: () => Promise<unknown>) => {
      const before = (await stored(id)).photo as string[];
      await expectRefused(request, id);
      expect((await stored(id)).photo).toEqual(before);
    };
    const jpeg = await fixture("clean-1.jpg");
    const withAdded = (rev: number, extra: Record<string, string>) => {
      const body = new FormData();
      body.set("rev", String(rev));
      for (const [key, value] of Object.entries(extra)) body.set(key, value);
      body.append("photo+", jpeg);
      return body;
    };

    // K approves M's pending catch while dropping photo 2.
    const pendingCatch = await submitted();
    const second = (pendingCatch.photo as string[])[1]!;
    await expectPhotosKept(pendingCatch.id, async () => update(await as("K"), pendingCatch.id, { rev: pendingCatch.rev, status: "verified", "photo-": [second] }));

    // K rejects a verified catch while adding a photo.
    const verifiedCatch = await inState("E1.M", "verified");
    await expectPhotosKept(verifiedCatch.id, async () =>
      (await as("K")).collection("catches").update(verifiedCatch.id, withAdded(Number(verifiedCatch.rev), { status: "rejected", reason: "Wrong fish" })),
    );

    // S, the backup judge, on K's catch: the other way into the judge branch.
    const kCatch = await submitted("E1.K");
    await expectPhotosKept(kCatch.id, async () => update(await as("S"), kCatch.id, { rev: kCatch.rev, status: "verified", "photo-": [(kCatch.photo as string[])[0]!] }));
    await expectPhotosKept(kCatch.id, async () => (await as("S")).collection("catches").update(kCatch.id, withAdded(Number(kCatch.rev), { status: "verified" })));
  });

  it("R-CAT-U-31: K may not approve, reject or correct a retracted catch", async () => {
    const record = await inState("E1.M", "retracted");
    await expectRefused(() => judge("K", record, { status: "verified" }), record.id);
    await expectRefused(() => judge("K", record, { status: "rejected", reason: "No" }), record.id);
    await expectRefused(() => judge("K", record, { weight_hoz: 1000, reason: "No" }), record.id);
  });

  it("a judge must send the rev it loaded", async () => {
    const record = await submitted();
    await expectRefused(async () => update(await as("K"), record.id, { status: "verified" }), record.id);
  });
});

describe("R-CAT-F-04: judges fetch rejected photos within their scope", () => {
  async function fetchPhoto(who: FixtureName, record: RecordModel): Promise<number> {
    const client = await as(who);
    const token = await client.files.getToken();
    return (await fetch(client.files.getURL(record, String((record.photo as string[])[0]), { token }))).status;
  }

  it("K fetches Y's rejected photo; S fetches K's rejected photo in E1; N may not fetch K's in E1", async () => {
    expect(await fetchPhoto("K", catchOf(world, "E1.Y.rejected"))).toBe(200);
    expect(await fetchPhoto("S", catchOf(world, "E1.K.rejected"))).toBe(200);
    expect(await fetchPhoto("N", catchOf(world, "E1.K.rejected"))).toBe(404);
  });
});

describe("audit_log is written by hooks only", () => {
  async function anyRow(): Promise<RecordModel> {
    const { superuser } = pocketbase();
    return superuser.collection("audit_log").getFirstListItem(superuser.filter("catch = {:id}", { id: catchOf(world, "E1.K.verified").id }));
  }
  const rowBody = () => ({ action: "approve", event: world.events.E1.id, catch: catchOf(world, "E1.M.pending").id, target_id: catchOf(world, "E1.M.pending").id, before: {}, after: {} });

  it("R-AUD-C-01, C-02: M, K and S may not create a row", async () => {
    for (const who of ["M", "K", "S"] as const) {
      expect(REFUSED).toContain(await statusOf((await as(who)).collection("audit_log").create({ ...rowBody(), actor: users[who].id })));
    }
  });

  it("R-AUD-U-01, U-02: M, K and S may not update a row (S on K's catch)", async () => {
    const row = await anyRow();
    for (const who of ["M", "K", "S"] as const) {
      expect(REFUSED).toContain(await statusOf((await as(who)).collection("audit_log").update(row.id, { action: "reject" })));
    }
    expect((await pocketbase().superuser.collection("audit_log").getOne(row.id)).action).toBe(row.action);
  });

  it("R-AUD-D-01: M and K may not delete a row", async () => {
    const row = await anyRow();
    for (const who of ["M", "K"] as const) expect(REFUSED).toContain(await statusOf((await as(who)).collection("audit_log").delete(row.id)));
    expect((await pocketbase().superuser.collection("audit_log").getOne(row.id)).id).toBe(row.id);
  });
});
