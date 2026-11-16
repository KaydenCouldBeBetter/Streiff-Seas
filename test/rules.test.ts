// The docs/security.md matrix rows that open a rule, one test per row ID, against a
// PocketBase booted from pb_migrations/. Rules still locked are swept in schema.test.ts.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { refusedFields, statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, newUser, type FixtureName, type FixtureUsers } from "./harness/users";
import { CATCH_KEYS, catchOf, entryOf, parseCatchKey, seedWorld, type CatchKey, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
});

/** How many users records hold this email, read as the superuser. */
async function usersWithEmail(email: string): Promise<number> {
  const { superuser } = pocketbase();
  return (await superuser.collection("users").getList(1, 1, { filter: superuser.filter("email = {:email}", { email }) })).totalItems;
}

describe("users create", () => {
  it("R-USR-C-01: anon signs up as a member, unverified, with the email hidden", async () => {
    const body = newUser({ name: "Dana Ruiz" });
    const created = await actAsAnon(pocketbase()).collection("users").create(body);
    const stored = await pocketbase().superuser.collection("users").getOne(created.id);

    expect(stored).toMatchObject({ email: body.email, name: "Dana Ruiz", role: "member", verified: false, emailVisibility: false });
  });

  // A rule refusal on create is a 400 with no field named, as PocketBase gives it.
  it.each([
    ["R-USR-C-04", "as an organizer", { role: "organizer" }],
    ["R-USR-C-05", "already verified", { verified: true }],
    ["R-USR-C-06", "with the email visible", { emailVisibility: true }],
    ["R-USR-C-06", "with the email visibility sent as false", { emailVisibility: false }],
    ["R-USR-C-07", "with no role", { role: undefined }],
  ])("%s: anon may not sign up %s", async (_id, _case, overrides: Record<string, unknown>) => {
    const body = newUser(overrides);
    // newUser() fills in a role; a role given as undefined means leave it out.
    if ("role" in overrides && overrides.role === undefined) delete body.role;

    expect(await statusOf(actAsAnon(pocketbase()).collection("users").create(body))).toBe(400);
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });

  it("R-USR-C-08: anon may not sign up with a member's email, and the member is left as they were", async () => {
    const { superuser } = pocketbase();
    const before = await superuser.collection("users").getOne(users.M.id);

    expect(await refusedFields(actAsAnon(pocketbase()).collection("users").create(newUser({ email: before.email, name: "Someone Else" })))).toEqual({
      email: "validation_not_unique",
    });
    expect(await superuser.collection("users").getOne(users.M.id)).toEqual(before);
  });

  it.each([" Dana", "Dana ", "Dana  Ruiz", " "])("R-USR-C-09: anon may not sign up with the name %j", async (name) => {
    const body = newUser({ name });

    expect(await refusedFields(actAsAnon(pocketbase()).collection("users").create(body))).toEqual({ name: expect.stringMatching(/^validation_/) });
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });

  it.each([
    ["R-USR-C-02", "M" as const],
    ["R-USR-C-03", "K" as const],
  ])("%s: %s, signed in, may not create a user", async (_id, who) => {
    const body = newUser({ email: `${randomUUID()}@example.test` });

    expect(await statusOf((await actAs(pocketbase(), users[who])).collection("users").create(body))).toBe(400);
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });
});

/** A member of its own, created through the superuser, so a test may change them freely. */
async function ownMember(name = "Test Member") {
  return pocketbase().superuser.collection("users").create(newUser({ name, emailVisibility: false, verified: true }));
}

describe("users update", () => {
  it("R-USR-U-01: a member changes their own name and display units", async () => {
    const member = await ownMember("Dana Ruiz");
    const client = await actAs(pocketbase(), member);

    await client.collection("users").update(member.id, { name: "Dana R.", display_units: "lb_oz" });

    expect(await pocketbase().superuser.collection("users").getOne(member.id)).toMatchObject({ name: "Dana R.", display_units: "lb_oz" });
  });

  it.each([
    ["R-USR-U-02", "make themself an organizer", { role: "organizer" }],
    ["R-USR-U-03", "change their email", { email: "someone.else@example.test" }],
    ["R-USR-U-03", "send verified as true", { verified: true }],
    ["R-USR-U-03", "send verified as false", { verified: false }],
  ])("%s: a member may not %s", async (_id, _case, body: Record<string, unknown>) => {
    const member = await ownMember();
    const before = await pocketbase().superuser.collection("users").getOne(member.id);

    expect(await statusOf((await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "Changed Name", ...body }))).toBe(404);
    // Refused whole: not even the name moved.
    expect(await pocketbase().superuser.collection("users").getOne(member.id)).toEqual(before);
  });

  it.each([true, false])("R-USR-U-08: a member may not send emailVisibility %s", async (emailVisibility) => {
    const member = await ownMember();
    const before = await pocketbase().superuser.collection("users").getOne(member.id);

    expect(
      await statusOf((await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "Changed Name", emailVisibility })),
    ).toBe(404);
    // Refused whole, as for U-02 and U-03: not even the name moved.
    expect(await pocketbase().superuser.collection("users").getOne(member.id)).toEqual(before);
  });

  it("R-USR-U-04: a member may not update another member's record", async () => {
    const mine = await ownMember();
    const theirs = await ownMember("Other Member");
    const before = await pocketbase().superuser.collection("users").getOne(theirs.id);

    expect(await statusOf((await actAs(pocketbase(), mine)).collection("users").update(theirs.id, { name: "Hacked" }))).toBe(404);
    expect(await pocketbase().superuser.collection("users").getOne(theirs.id)).toEqual(before);
  });

  it("R-USR-U-05: the organizer may not change a member's role", async () => {
    const member = await ownMember();

    expect(await statusOf((await actAs(pocketbase(), users.K)).collection("users").update(member.id, { role: "organizer" }))).toBe(404);
    expect((await pocketbase().superuser.collection("users").getOne(member.id)).role).toBe("member");
  });

  it("R-USR-U-06: a new name reaches the member's entries in live and closed tournaments, not in a final one", async () => {
    const { superuser } = pocketbase();
    const member = await ownMember("Before Name");
    const other = await ownMember("Other Member");
    const entryIn = async (status: string, angler: { id: string }, displayName: string) => {
      const event = await superuser.collection("events").create({ name: `Event ${status}`, status, metric: "weight", best_n: 10, judge: users.K.id });
      return superuser.collection("entries").create({ event: event.id, angler: angler.id, display_name: displayName });
    };
    const live = await entryIn("live", member, "Before Name");
    const closed = await entryIn("closed", member, "Before Name");
    const final = await entryIn("final", member, "Before Name");
    const othersLive = await entryIn("live", other, "Other Member");
    const displayName = async (id: string) => (await superuser.collection("entries").getOne(id)).display_name;

    // A change to display_units alone leaves every entry as it was.
    await (await actAs(pocketbase(), member)).collection("users").update(member.id, { display_units: "lb_oz" });
    expect(await displayName(live.id)).toBe("Before Name");

    await (await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "After Name" });

    expect(await displayName(live.id)).toBe("After Name");
    expect(await displayName(closed.id)).toBe("After Name");
    expect(await displayName(final.id)).toBe("Before Name");
    expect(await displayName(othersLive.id)).toBe("Other Member");
    expect((await superuser.collection("users").getOne(member.id)).name).toBe("After Name");
  });

  it("R-USR-U-06: a name refused by the field leaves the entries alone", async () => {
    const { superuser } = pocketbase();
    const member = await ownMember("Before Name");
    const event = await superuser.collection("events").create({ name: "Event live", status: "live", metric: "weight", best_n: 10, judge: users.K.id });
    const entry = await superuser.collection("entries").create({ event: event.id, angler: member.id, display_name: "Before Name" });

    await statusOf((await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "Bad  Name" }));

    expect((await superuser.collection("entries").getOne(entry.id)).display_name).toBe("Before Name");
  });

  it.each([" Dana", "Dana ", "Dana  Ruiz", " "])("R-USR-U-07: a member may not rename themself %j", async (name) => {
    const member = await ownMember("Dana Ruiz");

    expect(await refusedFields((await actAs(pocketbase(), member)).collection("users").update(member.id, { name }))).toEqual({
      name: expect.stringMatching(/^validation_/),
    });
    expect((await pocketbase().superuser.collection("users").getOne(member.id)).name).toBe("Dana Ruiz");
  });
});

// ---------------------------------------------------------------------------------------------
// M0-03: the list and view rules of events, entries, catches and species (security.md v0.9 text),
// read against the security.md fixture world. Other tests in this file add events and entries
// of their own, so each list is compared exactly over the world's records, and every returned
// record is checked against the row's claim.

/** The list / view rule as docs/security.md writes it for one collection. */
async function documentedListRule(collection: string): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf(`\n### ${collection}\n`);
  if (start < 0) throw new Error(`security.md has no ### ${collection} section`);
  const end = doc.indexOf("\n### ", start + 1);
  const section = doc.slice(start, end < 0 ? undefined : end);
  const block = /\*\*List \/ view\*\*[^\n]*\n```\n([\s\S]*?)\n```/.exec(section);
  if (block?.[1] !== undefined) return block[1];
  const inline = /\*\*List \/ view:\*\* `([^`]*)`/.exec(section);
  if (inline?.[1] !== undefined) return inline[1];
  throw new Error(`security.md ### ${collection} has no list / view rule`);
}

const sorted = (ids: string[]) => [...ids].sort();
const idsOf = (records: { id: string }[]) => sorted(records.map((record) => record.id));

describe("live reads (M0-03)", () => {
  let world: World;

  beforeAll(async () => {
    world = await seedWorld(pocketbase(), users);
  });

  const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
  const all = (client: PocketBase, collection: string, filter = "") => client.collection(collection).getFullList({ filter });

  /** The ids in `records` that belong to the world's records of that kind. */
  function worldOnly(records: RecordModel[], world: Record<string, RecordModel | undefined>): string[] {
    const known = new Set(Object.values(world).map((record) => record?.id));
    return idsOf(records.filter((record) => known.has(record.id)));
  }

  /** The world's catches whose key passes the test. */
  function catchIds(keep: (key: ReturnType<typeof parseCatchKey>) => boolean): string[] {
    return sorted(CATCH_KEYS.filter((key) => keep(parseCatchKey(key))).map((key) => catchOf(world, key).id));
  }

  const catchId = (key: CatchKey) => catchOf(world, key).id;

  /** An anonymous list, straight over HTTP, so the status code is the one PocketBase sent. */
  async function anonList(collection: string): Promise<{ status: number; totalItems: number }> {
    const response = await fetch(`${pocketbase().url}/api/collections/${collection}/records`);
    const body = (await response.json()) as { totalItems: number };
    return { status: response.status, totalItems: body.totalItems };
  }

  it("stores each list and view rule exactly as security.md writes it", async () => {
    for (const name of ["events", "entries", "catches", "species"]) {
      const stored = await pocketbase().superuser.collections.getOne(name);
      const documented = await documentedListRule(name);

      expect(stored.listRule, name).toBe(documented);
      expect(stored.viewRule, name).toBe(documented);
    }
  });

  describe("events", () => {
    it("R-EVT-L-01: anon lists no events", async () => {
      expect(await anonList("events")).toEqual({ status: 200, totalItems: 0 });
    });

    it("R-EVT-L-02: M lists live, closed and final events, and no drafts", async () => {
      const listed = await all(await as("M"), "events");
      const { E1, E2, EL, EC, EF } = world.events;

      expect(worldOnly(listed, world.events)).toEqual(idsOf([E1, E2, EL, EC, EF]));
      expect(listed.filter((event) => event.status === "draft")).toEqual([]);
    });

    it("R-EVT-L-03: K lists every event, drafts included", async () => {
      const listed = await all(await as("K"), "events");

      expect(idsOf(listed)).toEqual(idsOf(await all(pocketbase().superuser, "events")));
      expect(idsOf(listed)).toContain(world.events.ED.id);
    });

    it("R-EVT-V-01: M may not view ED, a draft (and may view E1)", async () => {
      const m = await as("M");

      expect(await statusOf(m.collection("events").getOne(world.events.ED.id))).toBe(404);
      expect(await statusOf(m.collection("events").getOne(world.events.E1.id))).toBe("allowed");
    });
  });

  describe("entries", () => {
    it("R-ENT-L-01: anon lists no entries", async () => {
      expect(await anonList("entries")).toEqual({ status: 200, totalItems: 0 });
    });

    it("R-ENT-L-02: M lists the non-withdrawn entries in live, closed and final events", async () => {
      const listed = await all(await as("M"), "entries");
      const expected = Object.entries(world.entries)
        .filter(([key, entry]) => !key.startsWith("ED.") && entry.withdrawn === false)
        .map(([, entry]) => entry);
      const drafts = new Set((await all(pocketbase().superuser, "events", 'status = "draft"')).map((event) => event.id));

      expect(worldOnly(listed, world.entries)).toEqual(idsOf(expected));
      for (const entry of listed) {
        expect(drafts.has(entry.event), entry.id).toBe(false);
        expect(entry.withdrawn === false || entry.angler === users.M.id, entry.id).toBe(true);
      }
    });

    it("R-ENT-L-03: M doesn't see W's withdrawn entry", async () => {
      expect(idsOf(await all(await as("M"), "entries"))).not.toContain(entryOf(world, "E1.W").id);
    });

    it("R-ENT-L-04: W sees their own withdrawn entry", async () => {
      expect(idsOf(await all(await as("W"), "entries"))).toContain(entryOf(world, "E1.W").id);
    });

    // The row says "All"; the rule's first clause, `event.status != "draft"`, holds for the
    // organizer too, so "all" means every entry outside a draft (Kayden's call, 2026-11-13:
    // keep the v0.9 rule and read the row this way; decisions.md 2026-11-13 M0-03 row).
    it("R-ENT-L-05: K lists every entry outside a draft, withdrawn included", async () => {
      const listed = await all(await as("K"), "entries");
      const outsideDrafts = await all(pocketbase().superuser, "entries", 'event.status != "draft"');

      expect(idsOf(listed)).toEqual(idsOf(outsideDrafts));
      expect(idsOf(listed)).toContain(entryOf(world, "E1.W").id);
      expect(idsOf(listed)).not.toContain(entryOf(world, "ED.K").id);
      expect(idsOf(listed)).not.toContain(entryOf(world, "ED.N").id);
    });

    // Last of the entries tests: it withdraws K's own entries for a moment and puts them back.
    it("R-ENT-L-06: after K withdraws, S still sees K's E1 entry but not W's, and in E2 K's entry follows the member rule", async () => {
      const entries = pocketbase().superuser.collection("entries");
      const k1 = entryOf(world, "E1.K");
      const k2 = entryOf(world, "E2.K");
      try {
        for (const entry of [k1, k2]) await entries.update(entry.id, { withdrawn: true, withdrawn_by: users.K.id });

        const listed = idsOf(await all(await as("S"), "entries"));
        expect(listed).toContain(k1.id);
        expect(listed).not.toContain(entryOf(world, "E1.W").id);
        expect(listed).not.toContain(k2.id);
        // As for any member.
        expect(idsOf(await all(await as("M"), "entries"))).not.toContain(k2.id);
      } finally {
        for (const entry of [k1, k2]) await entries.update(entry.id, { withdrawn: false, withdrawn_by: "" });
      }
    });
  });

  describe("catches", () => {
    it("R-CAT-L-01: anon lists no catches", async () => {
      expect(await anonList("catches")).toEqual({ status: 200, totalItems: 0 });
    });

    it("R-CAT-L-02: M lists the pending and verified catches on non-withdrawn entries (and their own)", async () => {
      const listed = await all(await as("M"), "catches");
      const expected = catchIds(
        ({ angler, status }) => ((status === "pending" || status === "verified") && angler !== "W") || angler === "M",
      );

      expect(worldOnly(listed, world.catches)).toEqual(expected);
    });

    it("R-CAT-L-03: M doesn't see another angler's rejected catch", async () => {
      const listed = idsOf(await all(await as("M"), "catches"));

      expect(listed).not.toContain(catchId("E1.Y.rejected"));
      expect(listed).not.toContain(catchId("E1.K.rejected"));
    });

    it("R-CAT-L-04: M sees their own rejected catch, with its reason", async () => {
      const own = (await all(await as("M"), "catches")).find((record) => record.id === catchId("E1.M.rejected"));

      expect(own).toMatchObject({ status: "rejected", reason: "Readout not legible" });
    });

    it("R-CAT-L-05: K lists every catch in E1, rejected included", async () => {
      const filter = `entry.event = "${world.events.E1.id}"`;
      const listed = await all(await as("K"), "catches", filter);

      expect(idsOf(listed)).toEqual(idsOf(await all(pocketbase().superuser, "catches", filter)));
      expect(idsOf(listed)).toEqual(catchIds(({ event }) => event === "E1"));
    });

    it("R-CAT-L-06: S sees rejected catches in E1 only where the angler is K or S", async () => {
      const listed = await all(await as("S"), "catches", `entry.event = "${world.events.E1.id}"`);
      const expected = catchIds(
        ({ event, angler, status }) =>
          event === "E1" && (((status === "pending" || status === "verified") && angler !== "W") || angler === "K" || angler === "S"),
      );

      expect(idsOf(listed)).toEqual(expected);
      expect(listed.filter((record) => record.status === "rejected").map((record) => record.id).sort()).toEqual(
        sorted([catchId("E1.K.rejected"), catchId("E1.S.rejected")]),
      );
      // Outside E1, K's rejected catch is hidden from S as from any member.
      expect(idsOf(await all(await as("S"), "catches"))).not.toContain(catchId("E2.K.rejected"));
    });

    it("R-CAT-L-07: M doesn't see the catches on W's withdrawn entry", async () => {
      const listed = idsOf(await all(await as("M"), "catches"));

      expect(listed).not.toContain(catchId("E1.W.pending"));
      expect(listed).not.toContain(catchId("E1.W.verified"));
    });

    it("R-CAT-L-08: K, the organizer, lists every catch in every event", async () => {
      const listed = await all(await as("K"), "catches");

      expect(idsOf(listed)).toEqual(idsOf(await all(pocketbase().superuser, "catches")));
      expect(worldOnly(listed, world.catches)).toEqual(catchIds(() => true));
    });

    it("R-CAT-L-10: M doesn't see Y's retracted catch", async () => {
      expect(idsOf(await all(await as("M"), "catches"))).not.toContain(catchId("E1.Y.retracted"));
    });

    it("R-CAT-L-11: Y sees their own retracted catch", async () => {
      expect(idsOf(await all(await as("Y"), "catches"))).toContain(catchId("E1.Y.retracted"));
    });

    it("R-CAT-L-12: W sees their own catches on the withdrawn entry", async () => {
      const listed = idsOf(await all(await as("W"), "catches"));

      expect(listed).toContain(catchId("E1.W.pending"));
      expect(listed).toContain(catchId("E1.W.verified"));
    });

    it("R-CAT-V-01: M may not view another angler's rejected catch (and may view their verified one)", async () => {
      const m = await as("M");

      expect(await statusOf(m.collection("catches").getOne(catchId("E1.Y.rejected")))).toBe(404);
      expect(await statusOf(m.collection("catches").getOne(catchId("E1.Y.verified")))).toBe("allowed");
    });
  });

  describe("species", () => {
    it("R-SPC-L-01: anon lists no species", async () => {
      expect(await anonList("species")).toEqual({ status: 200, totalItems: 0 });
    });

    it.each([
      ["R-SPC-L-02", "M" as const],
      ["R-SPC-L-03", "K" as const],
    ])("%s: %s lists every species", async (_id, who) => {
      const listed = await all(await as(who), "species");

      expect(idsOf(listed)).toEqual(idsOf(await all(pocketbase().superuser, "species")));
      expect(idsOf(listed)).toContain(world.species.walleye.id);
    });
  });

  // S1: the audit_log list and view rule (R-AUD-L-01 to L-09). The world's model hooks wrote one
  // `create` row per catch and one `join` row per entry. This block adds, as the superuser, K's
  // reject and re-approve of S's verified catch (the security.md fixture behind R-AUD-L-07) and
  // one E1 `open` row. Judging and event hooks don't exist yet, so these rows are written by hand.
  describe("audit_log", () => {
    /** Every world row, as the superuser reads it. */
    let rows: RecordModel[];
    let worldRowIds: Set<string>;
    let openRow: RecordModel;

    /** A catch snapshot (security.md "Audit snapshots") of `record`, with `changes` applied. */
    function catchSnapshot(record: RecordModel, changes: Record<string, unknown>): Record<string, unknown> {
      const fields = ["species", "weight_hoz", "length_q", "status", "reason", "photo", "photo_captured_at", "flags", "rev"];
      return { ...Object.fromEntries(fields.map((field) => [field, record[field]])), ...changes };
    }

    beforeAll(async () => {
      const audit = pocketbase().superuser.collection("audit_log");
      const reApproved = catchOf(world, "E1.S.verified");
      const onCatch = { actor: users.K.id, event: world.events.E1.id, catch: reApproved.id, target_id: reApproved.id };
      const pending = { status: "pending", reason: "" };
      const rejected = { status: "rejected", reason: "Readout not legible" };
      const verified = { status: "verified", reason: "Second photo shows the readout" };
      await audit.create({ ...onCatch, action: "reject", before: catchSnapshot(reApproved, pending), after: catchSnapshot(reApproved, rejected) });
      await audit.create({ ...onCatch, action: "approve", before: catchSnapshot(reApproved, rejected), after: catchSnapshot(reApproved, verified) });
      // An event row: no `catch`. Its snapshots are cut down; only the row's visibility matters here.
      openRow = await audit.create({
        actor: users.K.id,
        action: "open",
        event: world.events.E1.id,
        target_id: world.events.E1.id,
        before: { status: "draft" },
        after: { status: "live" },
      });

      const catchIdSet = new Set(CATCH_KEYS.map((key) => catchOf(world, key).id));
      const entryIdSet = new Set(Object.values(world.entries).map((entry) => entry.id));
      rows = (await all(pocketbase().superuser, "audit_log")).filter(
        (row) => catchIdSet.has(row.catch) || (row.catch === "" && entryIdSet.has(row.target_id)) || row.id === openRow.id,
      );
      worldRowIds = new Set(rows.map((row) => row.id));
    });

    /** The world rows `who` lists. Other tests in this file add records, and so rows, of their own. */
    async function listedWorldRows(who: FixtureName, filter = ""): Promise<string[]> {
      return idsOf((await all(await as(who), "audit_log", filter)).filter((row) => worldRowIds.has(row.id)));
    }

    /** The world rows of the given catches; throws when a catch has none, so no check is empty. */
    function rowsOfCatches(ids: string[]): string[] {
      const wanted = new Set(ids);
      const found = rows.filter((row) => wanted.has(row.catch));
      for (const id of ids) {
        if (!found.some((row) => row.catch === id)) throw new Error(`catch ${id} has no audit row`);
      }
      return idsOf(found);
    }

    const rowsOf = (...keys: CatchKey[]) => rowsOfCatches(keys.map(catchId));
    const joinRowOf = (key: `${"E1"}.${FixtureName}`) => {
      const row = rows.find((candidate) => candidate.action === "join" && candidate.target_id === entryOf(world, key).id);
      if (row === undefined) throw new Error(`entry ${key} has no join row`);
      return row;
    };
    const visible = (status: string, angler: FixtureName) => (status === "pending" || status === "verified") && angler !== "W";
    const e1 = () => `event = "${world.events.E1.id}"`;

    it("stores the list and view rule exactly as security.md writes it", async () => {
      const stored = await pocketbase().superuser.collections.getOne("audit_log");
      const documented = await documentedListRule("audit_log");

      expect(stored.listRule).toBe(documented);
      expect(stored.viewRule).toBe(documented);
    });

    it("R-AUD-L-01: anon lists no audit rows", async () => {
      expect(await anonList("audit_log")).toEqual({ status: 200, totalItems: 0 });
    });

    it("R-AUD-L-02: M lists every row of own catches and of the other catches M can see", async () => {
      const expected = rowsOfCatches(catchIds(({ angler, status }) => visible(status, angler) || angler === "M"));

      expect(await listedWorldRows("M")).toEqual(expected);
      // An earlier rejection on a catch that's verified now is part of its history.
      expect(expected).toEqual(expect.arrayContaining(rowsOf("E1.S.verified", "E1.M.rejected")));
    });

    it("R-AUD-L-03: M lists no event or entry rows, own join row included", async () => {
      const listed = await all(await as("M"), "audit_log");

      expect(listed.filter((row) => row.catch === "")).toEqual([]);
      expect(idsOf(listed)).not.toContain(openRow.id);
      expect(idsOf(listed)).not.toContain(joinRowOf("E1.M").id);
    });

    it("R-AUD-L-04: K, the organizer, lists every row", async () => {
      const listed = idsOf(await all(await as("K"), "audit_log"));

      expect(listed).toEqual(idsOf(await all(pocketbase().superuser, "audit_log")));
      expect(listed).toContain(openRow.id);
      expect(listed).toContain(joinRowOf("E1.W").id);
    });

    it("R-AUD-L-05: in E1, S lists the rows of K's catches and own, plus what any member sees", async () => {
      const expected = rowsOfCatches(
        catchIds(({ event, angler, status }) => event === "E1" && (visible(status, angler) || angler === "K" || angler === "S")),
      );

      expect(await listedWorldRows("S", e1())).toEqual(expected);
      expect(expected).toEqual(expect.arrayContaining(rowsOf("E1.K.rejected", "E1.S.rejected")));

      const everywhere = await all(await as("S"), "audit_log");
      // S backs up K in E1 only: K's rejected catch in E2 stays hidden, as from any member.
      for (const id of rowsOf("E2.K.rejected")) expect(idsOf(everywhere)).not.toContain(id);
      expect(everywhere.filter((row) => row.catch === "")).toEqual([]);
    });

    it("R-AUD-L-06: M lists no rows of Y's rejected or retracted catch, or of W's catches", async () => {
      const listed = idsOf(await all(await as("M"), "audit_log"));

      for (const id of rowsOf("E1.Y.rejected", "E1.Y.retracted", "E1.W.pending", "E1.W.verified")) {
        expect(listed).not.toContain(id);
      }
    });

    it("R-AUD-L-07: M lists every row of S's re-approved catch, the reject row with its reason", async () => {
      const listed = await all(await as("M"), "audit_log", `catch = "${catchId("E1.S.verified")}"`);

      expect(listed.map((row) => row.action).sort()).toEqual(["approve", "create", "reject"]);
      expect(listed.find((row) => row.action === "reject")?.after).toMatchObject({ status: "rejected", reason: "Readout not legible" });
    });

    it("R-AUD-L-09: Y lists every row of own rejected and retracted catches", async () => {
      const listed = idsOf(await all(await as("Y"), "audit_log"));

      expect(listed).toEqual(expect.arrayContaining(rowsOf("E1.Y.rejected", "E1.Y.retracted")));
    });

    // Last of the audit tests: it makes S the judge of E1 for a moment and puts K back. The
    // superuser sets the fields directly, which is what the R-EVT-U-19 step-down leaves behind
    // (no events hook exists yet; S3 tests the step-down itself in its own file).
    it("R-AUD-L-08: after a step-down makes S the judge of E1, S lists every row of every E1 catch", async () => {
      const events = pocketbase().superuser.collection("events");
      try {
        await events.update(world.events.E1.id, { judge: users.S.id, backup_judge: users.N.id });

        const expected = rowsOfCatches(catchIds(({ event }) => event === "E1"));
        expect(await listedWorldRows("S", e1())).toEqual(expected);
        expect(expected).toEqual(expect.arrayContaining(rowsOf("E1.Y.rejected", "E1.M.rejected", "E1.W.pending")));
        // Still no event or entry rows: S isn't an organizer.
        expect((await all(await as("S"), "audit_log")).filter((row) => row.catch === "")).toEqual([]);
      } finally {
        await events.update(world.events.E1.id, { judge: users.K.id, backup_judge: users.S.id });
      }
    });
  });
});
