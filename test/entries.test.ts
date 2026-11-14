// S1 step 1: joining a tournament (docs/security.md "entries" Create and Hooks), against a
// PocketBase booted from pb_migrations/ and pb_hooks/ with the fixture world. Its own file, so
// its own PocketBase: the withdraw and rejoin rows (a later step) will share it.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, newUser, type FixtureName, type FixtureUsers } from "./harness/users";
import { seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

/** A signed-in member of their own, so one test's join never touches another's. */
async function newMember(name = "Join Tester"): Promise<{ user: RecordModel; client: PocketBase }> {
  const user = await pocketbase().superuser.collection("users").create(newUser({ name, emailVisibility: false, verified: true }));
  return { user, client: await actAs(pocketbase(), user) };
}

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

/** The entries rows for this angler in this event, read as the superuser. */
async function entriesOf(eventId: string, anglerId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("entries").getFullList({ filter: superuser.filter("event = {:event} && angler = {:angler}", { event: eventId, angler: anglerId }) });
}

/** The audit rows written about one record. */
async function auditRowsFor(targetId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter("target_id = {:id}", { id: targetId }) });
}

const join = (client: PocketBase, eventId: string, anglerId: string, extra: Record<string, unknown> = {}) =>
  client.collection("entries").create({ event: eventId, angler: anglerId, ...extra });

/** The self-join Create rule as docs/security.md writes it. */
async function documentedCreateRule(): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf("\n### entries\n");
  const end = doc.indexOf("\n### ", start + 1);
  const block = /\*\*Create\*\* \(self-join\)\n```\n([\s\S]*?)\n```/.exec(doc.slice(start, end < 0 ? undefined : end));
  if (block?.[1] === undefined) throw new Error("security.md ### entries has no Create (self-join) block");
  return block[1];
}

describe("join", () => {
  it("stores the create rule exactly as security.md writes it, and leaves update and delete locked", async () => {
    const stored = await pocketbase().superuser.collections.getOne("entries");

    expect(stored.createRule).toBe(await documentedCreateRule());
    expect(stored.updateRule).toBeNull();
    expect(stored.deleteRule).toBeNull();
  });

  it("R-ENT-C-01 and R-AUD-H-02, H-05: X joins E1, display_name is set and one join row is written", async () => {
    const entry = await join(await as("X"), world.events.E1.id, users.X.id);

    expect(entry).toMatchObject({ event: world.events.E1.id, angler: users.X.id, display_name: users.X.name, withdrawn: false });
    const rows = await auditRowsFor(entry.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "join", actor: users.X.id, event: world.events.E1.id, catch: "", target_id: entry.id });
    // Fixed entry snapshot; `before` is empty on a join.
    expect(rows[0]?.after).toEqual({ withdrawn: false, withdraw_reason: "", withdrawn_by: "" });
    expect(rows[0]?.before == null || rows[0]?.before === "").toBe(true);
  });

  it("R-ENT-C-01: display_name is the name at the moment of joining", async () => {
    const { user, client } = await newMember("Dana Ruiz");

    const entry = await join(client, world.events.E2.id, user.id);

    expect(entry.display_name).toBe("Dana Ruiz");
  });

  it("R-ENT-C-02: X may not join E1 as M", async () => {
    const { user, client } = await newMember();
    const before = await entriesOf(world.events.E1.id, users.M.id);

    expect(await statusOf(join(client, world.events.E1.id, users.M.id))).toBe(400);
    expect(await entriesOf(world.events.E1.id, users.M.id)).toEqual(before);
    expect(await entriesOf(world.events.E1.id, user.id)).toEqual([]);
  });

  it("R-ENT-C-03: M joining E1 again fails, and there is still one entry (and no second join row)", async () => {
    const { user, client } = await newMember();
    const first = await join(client, world.events.E1.id, user.id);

    expect(await statusOf(join(client, world.events.E1.id, user.id))).toBe(400);
    expect(await entriesOf(world.events.E1.id, user.id)).toHaveLength(1);
    expect(await auditRowsFor(first.id)).toHaveLength(1);
  });

  it.each([
    ["ED", "a draft"],
    ["EC", "a closed event"],
    ["EF", "a final event"],
  ] as const)("R-ENT-C-04: X may not join %s, %s", async (key, _what) => {
    const { user, client } = await newMember();

    expect(await statusOf(join(client, world.events[key].id, user.id))).toBe(400);
    expect(await entriesOf(world.events[key].id, user.id)).toEqual([]);
  });

  it("R-ENT-C-05: X may not join a live event after its submit_deadline", async () => {
    const { superuser } = pocketbase();
    const day = 24 * 3600_000;
    const late = await superuser.collection("events").create({
      name: "Late Live",
      status: "live",
      starts_at: new Date(Date.now() - 30 * day).toISOString(),
      ends_at: new Date(Date.now() - 10 * day).toISOString(),
      deadline_ext_min: 0,
      submit_deadline: new Date(Date.now() - 9 * day).toISOString(),
      metric: "weight",
      best_n: 10,
      judge: users.K.id,
      backup_judge: users.N.id,
      species: [world.species.largemouth.id],
    });
    const { user, client } = await newMember();

    expect(await statusOf(join(client, late.id, user.id))).toBe(400);
    expect(await entriesOf(late.id, user.id)).toEqual([]);
  });

  it.each([
    ["display_name", { display_name: "Somebody Else" }],
    ["withdrawn", { withdrawn: true }],
    ["withdrawn sent as false", { withdrawn: false }],
    ["withdraw_reason", { withdraw_reason: "because" }],
    ["withdrawn_by", { withdrawn_by: "K" }],
  ])("R-ENT-C-06: a join body that sets %s is refused", async (_field, extra) => {
    const { user, client } = await newMember();
    // withdrawn_by names a real user (K), so only the rule can refuse it.
    const body = "withdrawn_by" in extra ? { withdrawn_by: users.K.id } : extra;

    expect(await statusOf(join(client, world.events.E1.id, user.id, body))).toBe(400);
    expect(await entriesOf(world.events.E1.id, user.id)).toEqual([]);
  });

  it("R-ENT-C-07: anon may not join", async () => {
    const before = (await pocketbase().superuser.collection("entries").getList(1, 1)).totalItems;

    expect(await statusOf(join(actAsAnon(pocketbase()), world.events.E1.id, users.X.id))).toBe(400);
    expect((await pocketbase().superuser.collection("entries").getList(1, 1)).totalItems).toBe(before);
  });

  it.each(["K", "S"] as const)("R-ENT-C-08: %s joining E1 again fails; still one entry (the judge and backup judge fish too)", async (who) => {
    expect(await statusOf(join(await as(who), world.events.E1.id, users[who].id))).toBe(400);
    expect(await entriesOf(world.events.E1.id, users[who].id)).toHaveLength(1);
  });

  it("R-AUD-H-04: a refused join writes no audit row", async () => {
    const before = (await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems;
    const { user, client } = await newMember();

    await statusOf(join(client, world.events.EC.id, user.id));
    await statusOf(join(client, world.events.E1.id, users.M.id));
    await statusOf(join(actAsAnon(pocketbase()), world.events.E1.id, user.id));

    expect((await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems).toBe(before);
  });

  it("a member who joined can read their own entry back (R-ENT-L-02)", async () => {
    const { user, client } = await newMember();
    const entry = await join(client, world.events.E1.id, user.id);

    expect((await client.collection("entries").getOne(entry.id)).display_name).toBe(user.name);
  });
});
