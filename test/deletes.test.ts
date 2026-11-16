// Nothing is ever deleted, not even by the superuser (docs/security.md R-ALL-D-02; decisions.md
// 2026-11-16, Open item 15): pb_hooks/no_deletes.pb.js refuses every delete in the six
// collections. Each record tried here is one PocketBase itself would let go (no required relation
// points at it), so only the hook keeps it.

import { randomUUID } from "node:crypto";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { createFixtureUsers, newUser } from "./harness/users";
import { catchOf, entryOf, photo, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let world: World;

beforeAll(async () => {
  world = await seedWorld(pocketbase(), await createFixtureUsers(pocketbase()));
});

/** Every users relation Open item 15 names, with the rows that point at `userId`. */
async function referencesTo(userId: string): Promise<Record<string, string[]>> {
  const { superuser } = pocketbase();
  const ids = async (collection: string, field: string) =>
    (await superuser.collection(collection).getFullList({ filter: superuser.filter(`${field} = {:id}`, { id: userId }) }))
      .map((record) => record.id)
      .sort();
  return {
    actor: await ids("audit_log", "actor"),
    withdrawn_by: await ids("entries", "withdrawn_by"),
    judged_by: await ids("catches", "judged_by"),
  };
}

describe("R-ALL-D-02: the superuser deletes nothing", () => {
  it("a user that rows point at only through optional relations stays, and so does every reference", async () => {
    const { superuser } = pocketbase();
    const { events, species, users } = world;
    // Not a judge, an angler or an event's backup judge: no required relation names them.
    const user = await superuser.collection("users").create(newUser({ name: "Former Helper", emailVisibility: false, verified: true }));
    await superuser.collection("audit_log").create({ actor: user.id, action: "event_edit", event: events.E2.id, target_id: events.E2.id });
    await superuser.collection("entries").create({
      event: events.E2.id,
      angler: users.X.id,
      display_name: users.X.name,
      withdrawn: true,
      withdraw_reason: "Moved away",
      withdrawn_by: user.id,
    });
    const capturedAt = new Date(Date.now() - 3600_000).toISOString();
    await superuser.collection("catches").create({
      entry: entryOf(world, "E2.N").id,
      species: species.largemouth.id,
      weight_hoz: 3900,
      photo: [await photo("clean-1.jpg"), await photo("clean-2.jpg")],
      captured_at: capturedAt,
      photo_captured_at: [capturedAt, capturedAt],
      client_uuid: randomUUID(),
      rev: 1,
      status: "verified",
      judged_by: user.id,
      flags: [],
    });
    const before = await referencesTo(user.id);
    expect(Object.values(before).map((ids) => ids.length)).toEqual([1, 1, 1]);

    expect(await statusOf(superuser.collection("users").delete(user.id))).toBe(400);

    expect((await superuser.collection("users").getOne(user.id)).id).toBe(user.id);
    expect(await referencesTo(user.id)).toEqual(before);
  });

  it.each([
    ["users", "a user nothing points at", (): Promise<RecordModel> => pocketbase().superuser.collection("users").create(newUser({ verified: true }))],
    ["species", "walleye, in no event", async () => world.species.walleye],
    [
      "events",
      "a draft with no entries",
      () => pocketbase().superuser.collection("events").create({ name: "Spare Draft", status: "draft", metric: "weight", best_n: 10, judge: world.users.K.id }),
    ],
    ["entries", "an entry with no catches (a draft holds none)", async () => entryOf(world, "ED.N")],
    ["catches", "a pending catch", async () => catchOf(world, "E2.N.pending")],
    [
      "audit_log",
      "an audit row",
      () =>
        pocketbase().superuser.collection("audit_log").create({ action: "event_edit", event: world.events.ED.id, target_id: world.events.ED.id }),
    ],
  ] as const)("%s: %s stays", async (collection, _what, make) => {
    const { superuser } = pocketbase();
    const record = await make();
    const before = await superuser.collection(collection).getOne(record.id);

    expect(await statusOf(superuser.collection(collection).delete(record.id))).toBe(400);

    expect(await superuser.collection(collection).getOne(record.id)).toEqual(before);
  });
});
