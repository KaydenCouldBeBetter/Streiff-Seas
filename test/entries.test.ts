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
import { entryOf, seedWorld, type World } from "./harness/world";

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

/** A code block under a bold heading in docs/security.md's "### entries" section. */
async function documentedRule(heading: RegExp): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf("\n### entries\n");
  const end = doc.indexOf("\n### ", start + 1);
  const block = new RegExp(`${heading.source}[^\\n]*\\n\`\`\`\\n([\\s\\S]*?)\\n\`\`\``).exec(doc.slice(start, end < 0 ? undefined : end));
  if (block?.[1] === undefined) throw new Error(`security.md ### entries has no ${heading.source} block`);
  return block[1];
}
const documentedCreateRule = () => documentedRule(/\*\*Create\*\* \(self-join\)/);
const documentedUpdateRule = () => documentedRule(/\*\*Update\*\* \(withdraw and rejoin/);

describe("join", () => {
  it("stores the create and update rules exactly as security.md writes them, and leaves delete locked", async () => {
    const stored = await pocketbase().superuser.collections.getOne("entries");

    expect(stored.createRule).toBe(await documentedCreateRule());
    expect(stored.updateRule).toBe(await documentedUpdateRule());
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

// ---------------------------------------------------------------------------------------------
// S1 step 4: withdraw and rejoin (docs/security.md "entries" Update and Hooks). Each test makes
// the entries it changes, so no test leans on another's state.

/** A rule refusal on update: 404 from the rule, or 400 from the hook's own checks. */
const REFUSED = [400, 403, 404];

interface Placed {
  user: RecordModel;
  client: PocketBase;
  entry: RecordModel;
}

/** A new member with an entry in the event, written as the superuser (any state, any event). */
async function placed(eventId: string, state: { withdrawn?: boolean; by?: "self" | "K"; reason?: string } = {}): Promise<Placed> {
  const { user, client } = await newMember();
  const withdrawn = state.withdrawn ?? false;
  const by = withdrawn ? (state.by === "K" ? users.K.id : user.id) : "";
  const entry = await pocketbase().superuser.collection("entries").create({
    event: eventId,
    angler: user.id,
    withdrawn,
    withdrawn_by: by,
    withdraw_reason: state.reason ?? "",
  });
  return { user, client, entry };
}

const entryNow = (id: string) => pocketbase().superuser.collection("entries").getOne(id);
const update = (client: PocketBase, id: string, body: Record<string, unknown>) => client.collection("entries").update(id, body);

async function rowsOf(entryId: string, action?: string): Promise<RecordModel[]> {
  const rows = await auditRowsFor(entryId);
  return action ? rows.filter((row) => row.action === action) : rows.filter((row) => row.action !== "join");
}

/** A live event past its submit_deadline, for the rejoin-too-late rows. */
async function pastDeadlineEvent(): Promise<RecordModel> {
  const day = 24 * 3600_000;
  return pocketbase().superuser.collection("events").create({
    name: "Past Deadline Live",
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
}

describe("withdraw and rejoin", () => {
  it("R-ENT-U-01, R-AUD-H-02, H-05: M withdraws own entry in E1; withdrawn_by = M; one withdraw row with both snapshots", async () => {
    const { user, client, entry } = await placed(world.events.E1.id);

    const after = await update(client, entry.id, { withdrawn: true });

    expect(after).toMatchObject({ withdrawn: true, withdrawn_by: user.id, withdraw_reason: "" });
    const rows = await rowsOf(entry.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "withdraw", actor: user.id, event: world.events.E1.id, target_id: entry.id, catch: "" });
    expect(rows[0]?.before).toEqual({ withdrawn: false, withdraw_reason: "", withdrawn_by: "" });
    expect(rows[0]?.after).toEqual({ withdrawn: true, withdraw_reason: "", withdrawn_by: user.id });
  });

  it("R-ENT-U-02: M withdraws own entry in EC (closed)", async () => {
    const { user, client, entry } = await placed(world.events.EC.id);

    expect(await update(client, entry.id, { withdrawn: true })).toMatchObject({ withdrawn: true, withdrawn_by: user.id });
    expect(await rowsOf(entry.id, "withdraw")).toHaveLength(1);
  });

  it("R-ENT-U-03: M rejoins after withdrawing themself, E1 live, before the deadline; withdrawn_by cleared; one rejoin row", async () => {
    const { user, client, entry } = await placed(world.events.E1.id);
    await update(client, entry.id, { withdrawn: true });

    const after = await update(client, entry.id, { withdrawn: false });

    expect(after).toMatchObject({ withdrawn: false, withdrawn_by: "" });
    const rows = await rowsOf(entry.id, "rejoin");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: user.id });
    expect(rows[0]?.before).toEqual({ withdrawn: true, withdraw_reason: "", withdrawn_by: user.id });
  });

  it("R-ENT-U-04: W may not undo K's withdrawal", async () => {
    const w = entryOf(world, "E1.W");

    expect(REFUSED).toContain(await statusOf(update(await as("W"), w.id, { withdrawn: false })));
    expect(await entryNow(w.id)).toMatchObject({ withdrawn: true, withdrawn_by: users.K.id });
    expect(await rowsOf(w.id)).toEqual([]);
  });

  it("R-ENT-U-05: M may not rejoin after submit_deadline, or in EC", async () => {
    const late = await placed((await pastDeadlineEvent()).id, { withdrawn: true, by: "self" });
    const closed = await placed(world.events.EC.id, { withdrawn: true, by: "self" });

    for (const { client, entry } of [late, closed]) {
      expect(REFUSED).toContain(await statusOf(update(client, entry.id, { withdrawn: false })));
      expect((await entryNow(entry.id)).withdrawn).toBe(true);
      expect(await rowsOf(entry.id)).toEqual([]);
    }
  });

  it("R-ENT-U-06: M may not withdraw Y's entry", async () => {
    const y = entryOf(world, "E1.Y");

    expect(REFUSED).toContain(await statusOf(update(await as("M"), y.id, { withdrawn: true })));
    expect((await entryNow(y.id)).withdrawn).toBe(false);
  });

  it("R-ENT-U-07: K withdraws M with a reason; withdrawn_by = K", async () => {
    const { entry } = await placed(world.events.E1.id);

    expect(await update(await as("K"), entry.id, { withdrawn: true, withdraw_reason: "Not a club member" })).toMatchObject({
      withdrawn: true,
      withdrawn_by: users.K.id,
      withdraw_reason: "Not a club member",
    });
    expect(await rowsOf(entry.id, "withdraw")).toMatchObject([{ actor: users.K.id }]);
  });

  it.each([
    ["no reason", {}],
    ["an empty reason", { withdraw_reason: "" }],
    ["a reason of spaces", { withdraw_reason: "   " }],
  ])("R-ENT-U-08: K may not withdraw M with %s", async (_case, body) => {
    const { entry } = await placed(world.events.E1.id);

    expect(REFUSED).toContain(await statusOf(update(await as("K"), entry.id, { withdrawn: true, ...body })));
    expect((await entryNow(entry.id)).withdrawn).toBe(false);
    expect(await rowsOf(entry.id)).toEqual([]);
  });

  it("R-ENT-U-09: K reinstates a member K withdrew; one rejoin row", async () => {
    const { entry } = await placed(world.events.E1.id, { withdrawn: true, by: "K", reason: "Paused" });

    expect(await update(await as("K"), entry.id, { withdrawn: false })).toMatchObject({ withdrawn: false, withdrawn_by: "" });
    expect(await rowsOf(entry.id, "rejoin")).toMatchObject([{ actor: users.K.id }]);
  });

  it("R-ENT-U-10: no change to an entry in EF, by K or by the angler", async () => {
    const k = entryOf(world, "EF.K");
    const n = entryOf(world, "EF.N");

    expect(REFUSED).toContain(await statusOf(update(await as("K"), k.id, { withdrawn: true })));
    expect(REFUSED).toContain(await statusOf(update(await as("K"), n.id, { withdrawn: true, withdraw_reason: "Late" })));
    expect(REFUSED).toContain(await statusOf(update(await as("N"), n.id, { withdrawn: true })));
    expect((await entryNow(k.id)).withdrawn).toBe(false);
    expect((await entryNow(n.id)).withdrawn).toBe(false);
  });

  it.each([
    ["event", () => ({ event: world.events.E2.id })],
    ["angler", () => ({ angler: users.X.id })],
    ["display_name", () => ({ display_name: "Someone" })],
    ["withdrawn_by", () => ({ withdrawn_by: users.K.id })],
  ])("R-ENT-U-11: a withdraw that also sets %s is refused, for M and for K", async (_field, extra) => {
    const mine = await placed(world.events.E1.id);
    const other = await placed(world.events.E1.id);

    expect(REFUSED).toContain(await statusOf(update(mine.client, mine.entry.id, { withdrawn: true, ...extra() })));
    expect(REFUSED).toContain(await statusOf(update(await as("K"), other.entry.id, { withdrawn: true, withdraw_reason: "x", ...extra() })));
    for (const id of [mine.entry.id, other.entry.id]) {
      const now = await entryNow(id);
      expect(now.withdrawn).toBe(false);
      expect(now.event).toBe(world.events.E1.id);
    }
  });

  it("R-ENT-U-12: S (backup judge, not organizer) may not withdraw M", async () => {
    const { entry } = await placed(world.events.E1.id);

    expect(REFUSED).toContain(await statusOf(update(await as("S"), entry.id, { withdrawn: true, withdraw_reason: "x" })));
    expect((await entryNow(entry.id)).withdrawn).toBe(false);
  });

  it("R-ENT-U-13: K withdraws their own entry without a reason; withdrawn_by = K", async () => {
    const k = entryOf(world, "E2.K");
    try {
      expect(await update(await as("K"), k.id, { withdrawn: true })).toMatchObject({ withdrawn: true, withdrawn_by: users.K.id });
      expect(await rowsOf(k.id, "withdraw")).toHaveLength(1);
    } finally {
      await pocketbase().superuser.collection("entries").update(k.id, { withdrawn: false, withdrawn_by: "" });
    }
  });

  it("R-ENT-U-14: in EC, K withdraws M with a reason and reinstates W; one withdraw and one rejoin row", async () => {
    const m = await placed(world.events.EC.id);
    const w = await placed(world.events.EC.id, { withdrawn: true, by: "K", reason: "Paused" });
    const k = await as("K");

    await update(k, m.entry.id, { withdrawn: true, withdraw_reason: "Left the club" });
    await update(k, w.entry.id, { withdrawn: false });

    expect((await rowsOf(m.entry.id)).map((row) => row.action)).toEqual(["withdraw"]);
    expect((await rowsOf(w.entry.id)).map((row) => row.action)).toEqual(["rejoin"]);
  });

  it("R-ENT-D-01: M and K may not delete an entry", async () => {
    const { client, entry } = await placed(world.events.E1.id);

    expect(REFUSED).toContain(await statusOf(client.collection("entries").delete(entry.id)));
    expect(REFUSED).toContain(await statusOf((await as("K")).collection("entries").delete(entry.id)));
    expect((await entryNow(entry.id)).id).toBe(entry.id);
  });

  it("withdrawing an entry that is already withdrawn changes nothing and writes no row (the rule for the angler, the hook for K)", async () => {
    const { client, entry } = await placed(world.events.E1.id, { withdrawn: true, by: "self" });

    expect(await statusOf(update(client, entry.id, { withdrawn: true }))).toBe(404);
    expect(await statusOf(update(await as("K"), entry.id, { withdrawn: true, withdraw_reason: "Again" }))).toBe(400);
    expect(await entryNow(entry.id)).toMatchObject({ withdrawn_by: entry.withdrawn_by, withdraw_reason: "" });
    expect(await rowsOf(entry.id)).toEqual([]);
  });

  it("a member poking at W's hidden withdrawn entry gets the rule's answer, not the hook's (no 400 that says it exists)", async () => {
    const w = entryOf(world, "E1.W");
    const m = await as("M");

    expect(await statusOf(update(m, w.id, { withdrawn: true }))).toBe(await statusOf(update(m, "doesnotexist123", { withdrawn: true })));
  });

  it("R-AUD-H-04: refused withdraws and rejoins write no audit row", async () => {
    const before = (await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems;
    const { entry } = await placed(world.events.E1.id);

    await statusOf(update(await as("S"), entry.id, { withdrawn: true, withdraw_reason: "x" }));
    await statusOf(update(await as("W"), entryOf(world, "E1.W").id, { withdrawn: false }));
    await statusOf(update(actAsAnon(pocketbase()), entry.id, { withdrawn: true }));

    // placed() writes one join row for the entry it makes; nothing else may appear.
    expect((await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems).toBe(before + 1);
  });
});
