// S4 step 6: the judge step-down (docs/security.md R-EVT-U-19, R-AUD-L-08; scoring.md example 28;
// ops.md section 12 "Judge step-down"). A superuser step, in its own file with its own PocketBase,
// because it changes E1's judge for good: S becomes the judge and N the backup judge.

import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { CATCH_KEYS, catchOf, entryOf, parseCatchKey, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const sorted = (ids: string[]) => [...ids].sort();

async function rowsWhere(filter: string, params: Record<string, string>): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter(filter, params) });
}

async function entriesOf(eventId: string, anglerId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("entries").getFullList({ filter: superuser.filter("event = {:event} && angler = {:angler}", { event: eventId, angler: anglerId }) });
}

describe("judge step-down", () => {
  it("refuses a superuser change to a judge without the organizer role who isn't the backup judge", async () => {
    // M is a member and not E1's backup judge: only the step-down may set a non-organizer judge.
    expect(await statusOf(pocketbase().superuser.collection("events").update(world.events.E1.id, { judge: users.M.id }))).toBe(400);
    expect((await pocketbase().superuser.collection("events").getOne(world.events.E1.id)).judge).toBe(users.K.id);
  });

  it("refuses a superuser step-down that leaves the judge and the backup judge the same person", async () => {
    expect(await statusOf(pocketbase().superuser.collection("events").update(world.events.E1.id, { judge: users.S.id }))).toBe(400);
  });

  it("R-EVT-U-19: the superuser makes S (a member) the judge of E1 and N the backup judge in one request", async () => {
    const e1 = world.events.E1.id;
    const kEntry = await pocketbase().superuser.collection("entries").getOne(entryOf(world, "E1.K").id);
    const editsBefore = (await rowsWhere('target_id = {:id} && action = "event_edit"', { id: e1 })).length;

    const updated = await pocketbase().superuser.collection("events").update(e1, { judge: users.S.id, backup_judge: users.N.id });

    expect(updated).toMatchObject({ judge: users.S.id, backup_judge: users.N.id, status: "live" });
    // N had no E1 entry, so gets one, with a join row; display_name from N's name.
    const nEntries = await entriesOf(e1, users.N.id);
    expect(nEntries).toHaveLength(1);
    expect(nEntries[0]).toMatchObject({ display_name: users.N.name, withdrawn: false });
    expect(nEntries[0]?.created).not.toBe("");
    const joins = await rowsWhere('target_id = {:id} && action = "join"', { id: nEntries[0]?.id ?? "" });
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ actor: "", event: e1, before: null, after: { withdrawn: false, withdraw_reason: "", withdrawn_by: "" } });
    // K's entry is left as it was.
    expect(await pocketbase().superuser.collection("entries").getOne(kEntry.id)).toEqual(kEntry);
    // Exactly one event_edit row, actor empty (a superuser action), before and after.
    const edits = await rowsWhere('target_id = {:id} && action = "event_edit"', { id: e1 });
    expect(edits).toHaveLength(editsBefore + 1);
    const edit = edits.at(-1);
    expect(edit).toMatchObject({ actor: "", event: e1, catch: "" });
    expect(edit?.before).toMatchObject({ judge: users.K.id, backup_judge: users.S.id });
    expect(edit?.after).toMatchObject({ judge: users.S.id, backup_judge: users.N.id });
  });

  it("R-AUD-L-08: after the step-down S lists every row of every E1 catch, rejected ones included", async () => {
    const e1Catches = new Set(CATCH_KEYS.filter((key) => parseCatchKey(key).event === "E1").map((key) => catchOf(world, key).id));
    const expected = sorted((await rowsWhere("event = {:event}", { event: world.events.E1.id })).filter((row) => e1Catches.has(row.catch)).map((row) => row.id));
    expect(expected.length).toBeGreaterThan(0);
    for (const key of ["E1.Y.rejected", "E1.M.rejected", "E1.W.pending"] as const) {
      expect((await rowsWhere("catch = {:id}", { id: catchOf(world, key).id })).length).toBeGreaterThan(0);
    }

    const s = await as("S");
    const listed = await s.collection("audit_log").getFullList({ filter: `event = "${world.events.E1.id}"` });
    expect(sorted(listed.filter((row) => e1Catches.has(row.catch)).map((row) => row.id))).toEqual(expected);
    // Still no event or entry rows: S isn't an organizer.
    expect(listed.filter((row) => row.catch === "")).toEqual([]);
  });

  it("scoring.md example 28: S now judges everyone else's pending catches, K's included; N judges only S's", async () => {
    const s = await as("S");
    const n = await as("N");
    const kPending = catchOf(world, "E1.K.pending");
    const mPending = catchOf(world, "E1.M.pending");

    // S approves K's catch (the former judge's) and M's.
    expect(await statusOf(s.collection("catches").update(kPending.id, { status: "verified", rev: kPending.rev }))).toBe("allowed");
    expect(await statusOf(s.collection("catches").update(mPending.id, { status: "verified", rev: mPending.rev }))).toBe("allowed");
    // N, the new backup judge, can't judge M's; K, no longer the judge, can't judge Y's.
    const yPending = catchOf(world, "E1.Y.pending");
    expect(await statusOf(n.collection("catches").update(yPending.id, { status: "verified", rev: yPending.rev }))).not.toBe("allowed");
    expect(await statusOf((await as("K")).collection("catches").update(yPending.id, { status: "verified", rev: yPending.rev }))).not.toBe("allowed");
    // Decisions already made stand, with their original judged_by.
    expect((await pocketbase().superuser.collection("catches").getOne(catchOf(world, "E1.M.verified").id)).judged_by).toBe(users.K.id);
  });
});
