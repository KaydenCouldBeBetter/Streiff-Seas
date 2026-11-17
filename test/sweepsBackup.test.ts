// R-ALL-S-01 (docs/security.md "Sweeps"): backup judging grants nothing outside `catches` and
// `audit_log`. The member cases of `users`, `events`, `species` and `entries` are re-run as S
// (E1's backup judge) and N (every other event's), on records that aren't their own, and each
// must come out as it does for M, an ordinary member. The one documented difference, R-ENT-L-06
// (S reads K's entry in E1 after K withdraws it), doesn't arise here: no judge entry is withdrawn
// in the world.

import type PocketBase from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { entryOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

/** What a caller lists, leaving out records that are their own (their user, their entries). */
async function listed(client: PocketBase, who: FixtureName, collection: string): Promise<string[]> {
  const records = await client.collection(collection).getFullList({ requestKey: null });
  return records
    .filter((record) => {
      if (collection === "users") return record.id !== users[who].id;
      if (collection === "entries") return record.angler !== users[who].id;
      return true;
    })
    .map((record) => record.id)
    .sort();
}

const BACKUPS = ["S", "N"] as const;

describe("R-ALL-S-01: S and N, as backup judges, read like M", () => {
  it("list no other user, as M lists none (R-USR-L-02)", async () => {
    for (const who of [...BACKUPS, "M" as const]) expect(await listed(await as(who), who, "users")).toEqual([]);
  });

  for (const collection of ["events", "species"]) {
    it(`list the same ${collection} as M`, async () => {
      const member = await listed(await as("M"), "M", collection);
      for (const who of BACKUPS) expect(await listed(await as(who), who, collection)).toEqual(member);
    });
  }

  it("list the same other anglers' entries as an ordinary member (X, who has none) does", async () => {
    // X has no entry, so X's list is exactly what any member sees of everyone's entries.
    const everyMember = await listed(await as("X"), "X", "entries");
    for (const who of BACKUPS) {
      const theirOwn = new Set(Object.values(world.entries).filter((entry) => entry.angler === users[who].id).map((entry) => entry.id));
      expect(await listed(await as(who), who, "entries")).toEqual(everyMember.filter((id) => !theirOwn.has(id)));
    }
  });

  it("views no other user, as M can't (R-USR-V-01)", async () => {
    for (const who of [...BACKUPS, "M" as const]) {
      expect(await statusOf((await as(who)).collection("users").getOne(users.Y.id))).toBe(404);
    }
  });
});

describe("R-ALL-S-01: S and N, as backup judges, change only what M may", () => {
  for (const who of [...BACKUPS, "M" as const]) {
    it(`${who}: another user's name, an event, a species and someone else's entry are all refused`, async () => {
      const client = await as(who);
      expect(await statusOf(client.collection("users").update(users.Y.id, { name: "Someone Else" }))).toBe(404);
      for (const key of ["E1", "E2", "EC"] as const) {
        expect(await statusOf(client.collection("events").update(world.events[key].id, { name: "Renamed" }))).not.toBe("allowed");
      }
      expect(await statusOf(client.collection("events").create({ name: "Mine", status: "draft" }))).not.toBe("allowed");
      expect(await statusOf(client.collection("species").create({ name: "pike" }))).not.toBe("allowed");
      expect(await statusOf(client.collection("species").update(world.species.walleye.id, { name: "walleye pike" }))).not.toBe("allowed");
      // R-ENT-U-06 and U-12: withdrawing someone else, here Y in E1 and K's entry in E2.
      expect(await statusOf(client.collection("entries").update(entryOf(world, "E1.Y").id, { withdrawn: true }))).not.toBe("allowed");
      expect(await statusOf(client.collection("entries").update(entryOf(world, "E2.K").id, { withdrawn: true, withdraw_reason: "Not fishing" }))).not.toBe("allowed");
      // R-ENT-C-02: joining as someone else.
      expect(await statusOf(client.collection("entries").create({ event: world.events.E2.id, angler: users.X.id }))).not.toBe("allowed");
    });
  }

  it("nothing above changed a record", async () => {
    const { superuser } = pocketbase();
    expect((await superuser.collection("users").getOne(users.Y.id)).name).toBe("Angler Y");
    expect((await superuser.collection("events").getOne(world.events.E1.id)).name).toBe(world.events.E1.name);
    expect((await superuser.collection("entries").getOne(entryOf(world, "E1.Y").id)).withdrawn).toBe(false);
    expect((await superuser.collection("entries").getOne(entryOf(world, "E2.K").id)).withdrawn).toBe(false);
    expect(await statusOf(superuser.collection("species").getFirstListItem('name = "pike"'))).toBe(404);
  });
});
