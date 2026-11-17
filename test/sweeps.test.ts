// The docs/security.md sweeps (R-ALL-ANON-01, R-ALL-V-01, R-ALL-D-01): every collection, action
// and caller cell without a row of its own, over the "Test fixtures" world. They try the rules
// as stored, so a rule opened by a later slice is swept too; re-run them in every slice.

import { randomUUID } from "node:crypto";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, FIXTURE_NAMES, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type CatchKey, type World } from "./harness/world";

const pocketbase = usePocketBase();

const COLLECTIONS = ["users", "species", "events", "entries", "catches", "audit_log"] as const;
type CollectionName = (typeof COLLECTIONS)[number];

let users: FixtureUsers;
let world: World;
/** Every record of every collection, read as the superuser once the world is seeded. */
let records: Record<CollectionName, RecordModel[]>;

async function snapshot(): Promise<Record<CollectionName, RecordModel[]>> {
  const { superuser } = pocketbase();
  const lists = await Promise.all(COLLECTIONS.map((name) => superuser.collection(name).getFullList({ sort: "id" })));
  return Object.fromEntries(COLLECTIONS.map((name, index) => [name, lists[index]])) as Record<CollectionName, RecordModel[]>;
}

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  // The world is seeded by the superuser, which the hooks don't audit; add rows of each kind the
  // audit_log rule tells apart: an event row, and catch rows on visible, rejected and withdrawn catches.
  const { superuser } = pocketbase();
  const row = (actor: FixtureName, action: string, event: RecordModel, key?: CatchKey) =>
    superuser.collection("audit_log").create({
      actor: users[actor].id,
      action,
      event: event.id,
      catch: key === undefined ? "" : catchOf(world, key).id,
      target_id: key === undefined ? event.id : catchOf(world, key).id,
    });
  await row("K", "open", world.events.E1);
  await row("M", "edit", world.events.E1, "E1.M.pending");
  await row("K", "reject", world.events.E1, "E1.Y.rejected");
  await row("W", "create", world.events.E1, "E1.W.pending");
  await row("N", "approve", world.events.E2, "E2.K.verified");
  records = await snapshot();
});

const signedIn = (who: FixtureName) => actAs(pocketbase(), users[who]);

describe("R-ALL-ANON-01: anon views, creates, updates and deletes nothing", () => {
  /** A body the schema would take, so only the rule refuses it. */
  const createBody = (name: Exclude<CollectionName, "users">): Record<string, unknown> => {
    const { events, species } = world;
    switch (name) {
      case "species":
        return { name: "white bass" };
      case "events":
        return { name: "Anon Event", status: "draft", metric: "weight", best_n: 10, judge: users.K.id };
      case "entries":
        return { event: events.E1.id, angler: users.X.id };
      case "catches":
        return { entry: entryOf(world, "E1.M").id, species: species.largemouth.id, weight_hoz: 4000, client_uuid: randomUUID() };
      case "audit_log":
        return { actor: users.K.id, action: "event_edit", event: events.E1.id, target_id: events.E1.id };
    }
  };

  const UPDATE_BODY: Record<CollectionName, Record<string, unknown>> = {
    users: { name: "Changed Name" },
    species: { name: "changed bass" },
    events: { name: "Changed" },
    entries: { withdrawn: true },
    catches: { weight_hoz: 1 },
    audit_log: { target_id: "changed" },
  };

  it.each(COLLECTIONS)("%s", async (name) => {
    const anon = actAsAnon(pocketbase());

    for (const record of records[name]) {
      expect(await statusOf(anon.collection(name).getOne(record.id)), `view ${record.id}`).not.toBe("allowed");
      expect(await statusOf(anon.collection(name).update(record.id, UPDATE_BODY[name])), `update ${record.id}`).not.toBe("allowed");
      expect(await statusOf(anon.collection(name).delete(record.id)), `delete ${record.id}`).not.toBe("allowed");
    }
    // Anon may create a users record: self sign-up, as a member only (R-USR-C-01 to C-09).
    if (name !== "users") expect(await statusOf(anon.collection(name).create(createBody(name))), "create").not.toBe("allowed");
  });
});

describe("R-ALL-V-01: a record can be viewed by id exactly when it is in the caller's list", () => {
  it.each(["anon", ...FIXTURE_NAMES] as const)("%s", async (who) => {
    const client = who === "anon" ? actAsAnon(pocketbase()) : await signedIn(who);
    let found = 0;

    for (const name of COLLECTIONS) {
      const listed = new Set((await client.collection(name).getFullList()).map((record) => record.id));
      for (const record of records[name]) {
        const viewed = (await statusOf(client.collection(name).getOne(record.id))) === "allowed";
        expect(viewed, `${name} ${record.id}`).toBe(listed.has(record.id));
        if (viewed) found++;
      }
    }
    // Every signed-in caller reads something (their own users record at least); anon reads nothing.
    if (who === "anon") expect(found).toBe(0);
    else expect(found).toBeGreaterThan(0);
  });
});

describe("R-ALL-D-01: no one signed in deletes anything", () => {
  // 403 is the null delete rule answering, before pb_hooks/no_deletes.pb.js (R-ALL-D-02) is reached.
  it.each(FIXTURE_NAMES)("%s", async (who) => {
    const client = await signedIn(who);

    for (const name of COLLECTIONS) {
      for (const record of records[name]) {
        expect(await statusOf(client.collection(name).delete(record.id)), `${name} ${record.id}`).toBe(403);
      }
    }
  });
});

// Last in the file: after every sweep above.
it("left every record of every collection as it was, and added none", async () => {
  expect(await snapshot()).toEqual(records);
});
