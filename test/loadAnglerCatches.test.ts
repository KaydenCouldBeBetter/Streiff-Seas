// Another angler's catches and their history from the server (LB-02, LB-03;
// web/src/lib/loadAnglerCatches.ts), against a PocketBase booted from pb_migrations/ and pb_hooks/
// with the fixture world. The world's hooks wrote one `create` row per catch, with the angler as
// actor; S's approval of K's catch is added here by the superuser, since judging isn't built (S3).

import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAnglerCatches, type AnglerCatchesData } from "../web/src/lib/loadAnglerCatches";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type CatchKey, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

const SNAPSHOT_FIELDS = ["species", "weight_hoz", "length_q", "status", "reason", "photo", "photo_captured_at", "flags", "rev"];
const snapshot = (record: RecordModel, changes: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, record[field]])),
  ...changes,
});

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  const kVerified = catchOf(world, "E1.K.verified");
  await pocketbase()
    .superuser.collection("audit_log")
    .create({
      actor: users.S.id,
      action: "approve",
      event: world.events.E1.id,
      catch: kVerified.id,
      target_id: kVerified.id,
      before: snapshot(kVerified, { status: "pending" }),
      after: snapshot(kVerified),
    });
});

async function open(viewer: FixtureName, angler: `E1.${FixtureName}`): Promise<AnglerCatchesData> {
  const pb = await actAs(pocketbase(), users[viewer]);
  return loadAnglerCatches(pb, entryOf(world, angler).id, users[viewer].id, "lb");
}

const ids = (...keys: CatchKey[]) => keys.map((key) => catchOf(world, key).id);

describe("loadAnglerCatches", () => {
  it("gives M Y's pending and verified catches, newest first, never the rejected or retracted ones (R-CAT-L-02, L-03, L-10)", async () => {
    const data = await open("M", "E1.Y");

    expect(data.entryId).toBe(entryOf(world, "E1.Y").id);
    expect(data.catches.map((c) => c.id)).toEqual(ids("E1.Y.verified", "E1.Y.pending"));
    expect(data.catches.map((c) => [c.status, c.inBest])).toEqual([
      ["verified", true],
      ["pending", false],
    ]);
    expect(data.catches[0]).toMatchObject({ species: "Largemouth bass", measurement: { value: "2.75", unit: "lb" } });
    expect(data.catches[0]?.capturedAt).toBeInstanceOf(Date);
  });

  it("loads the photos with a file token (R-CAT-F-02)", async () => {
    const data = await open("M", "E1.Y");
    const url = data.catches[0]?.photos[0]?.url ?? "";

    expect(data.catches[0]?.photos).toHaveLength(2);
    expect(url).toMatch(/[?&]token=[^&]+/);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("labels the angler's own steps Angler, even when the angler is the judge, and the backup judge's approval Backup judge (LB-03a)", async () => {
    const y = await open("M", "E1.Y");
    expect(y.history[catchOf(world, "E1.Y.verified").id]?.map((row) => [row.action, row.actor])).toEqual([["create", "Angler"]]);

    const k = await open("M", "E1.K");
    expect(k.history[catchOf(world, "E1.K.verified").id]?.map((row) => [row.action, row.actor])).toEqual([
      ["create", "Angler"],
      ["approve", "Backup judge"],
    ]);
  });

  it("labels the viewer's own steps You when they open their own row", async () => {
    const data = await open("M", "E1.M");

    expect(data.catches.map((c) => c.id)).toEqual(ids("E1.M.verified", "E1.M.pending"));
    expect(data.history[catchOf(world, "E1.M.pending").id]?.map((row) => row.actor)).toEqual(["You"]);
  });

  it("gives K, who can read rejected and retracted catches, the same page as everyone (LB-02c)", async () => {
    const data = await open("K", "E1.Y");

    expect(data.catches.map((c) => c.id)).toEqual(ids("E1.Y.verified", "E1.Y.pending"));
  });

  it("refuses M W's withdrawn entry (R-ENT-L-03)", async () => {
    await expect(open("M", "E1.W")).rejects.toMatchObject({ status: 404 });
  });
});
