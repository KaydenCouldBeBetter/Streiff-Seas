// S4 steps 1, 3, 4, 5 and 7: the organizer creates, edits, opens, closes and finalizes tournaments
// (docs/security.md "events" Create, Update and Hooks; R-EVT-C-01 to C-10, R-EVT-U-01 to U-18,
// U-20 to U-29, R-EVT-D-01, R-AUD-H-03, H-05; the final lock R-EVT-U-05, R-ENT-U-10, R-CAT-U-12;
// scoring.md example 23). The step-down (R-EVT-U-19) is in test/stepDown.test.ts.
//
// Against a PocketBase booted from pb_migrations/ and pb_hooks/ with the fixture world. A request
// the rules or hooks refuse leaves the world as it was, so refusals use the world's events; every
// change that lands is made on an event of its own, so no test depends on another's order.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { refusedFields, statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, newUser, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, photo, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
/** A PocketBase date ("2026-11-17 10:00:00.000Z") as ms; NaN for an empty one. */
const ms = (value: unknown) => (value === "" ? Number.NaN : new Date(String(value).replace(" ", "T")).getTime());

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

/** Every events field (security.md "Audit snapshots"). PocketBase stores JSON with its keys sorted, so compare sorted. */
const EVENT_FIELDS = [
  "name", "status", "starts_at", "ends_at", "deadline_ext_min", "submit_deadline", "metric", "best_n",
  "judge", "backup_judge", "species", "code_word_on", "code_word", "code_word_prev", "code_word_changed_at",
];

/** A complete draft body, as the New tournament screen sends it, judge K, backup judge N. */
function draftBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    name: `Draft ${randomUUID().slice(0, 8)}`,
    status: "draft",
    starts_at: iso(now + 10 * DAY),
    ends_at: iso(now + 40 * DAY),
    metric: "weight",
    best_n: 10,
    judge: users.K.id,
    backup_judge: users.N.id,
    species: [world.species.largemouth.id, world.species.smallmouth.id],
    code_word_on: false,
    code_word: "",
    ...overrides,
  };
}

const createDraft = async (who: FixtureName = "K", overrides: Record<string, unknown> = {}) =>
  (await as(who)).collection("events").create(draftBody(overrides));

/**
 * An event of its own in any state, written as the superuser (which the events hooks pass through),
 * with entries for the judge K and the backup judge, as the create hook would have made them.
 */
async function eventIn(
  status: "live" | "closed",
  window: { starts?: number; ends: number; deadline?: number },
  extra: Record<string, unknown> = {},
): Promise<RecordModel> {
  const { superuser } = pocketbase();
  const starts = window.starts ?? window.ends - 30 * DAY;
  const event = await superuser.collection("events").create({
    ...draftBody(),
    status,
    starts_at: iso(starts),
    ends_at: iso(window.ends),
    deadline_ext_min: 0,
    submit_deadline: iso(window.deadline ?? window.ends + DAY),
    ...extra,
  });
  for (const who of [event.judge as string, event.backup_judge as string]) {
    if (who !== "") await superuser.collection("entries").create({ event: event.id, angler: who });
  }
  return event;
}

/** A live event whose window is open: started 7 days ago, ends in 20. */
const openLive = (extra: Record<string, unknown> = {}) => eventIn("live", { starts: Date.now() - 7 * DAY, ends: Date.now() + 20 * DAY }, extra);

const read = (id: string) => pocketbase().superuser.collection("events").getOne(id);

/** The audit rows about this event (its own rows: open, close, finalize, event_edit), oldest first. */
async function eventRows(eventId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter("target_id = {:id}", { id: eventId }), sort: "created,id" });
}

async function entriesIn(eventId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("entries").getFullList({ filter: superuser.filter("event = {:event}", { event: eventId }), sort: "created" });
}

async function joinRowsOf(entryId: string): Promise<RecordModel[]> {
  const { superuser } = pocketbase();
  return superuser.collection("audit_log").getFullList({ filter: superuser.filter('target_id = {:id} && action = "join"', { id: entryId }) });
}

const auditCount = async () => (await pocketbase().superuser.collection("audit_log").getList(1, 1)).totalItems;

/** Asserts the update is refused with `status`, and that the event and the audit log are unchanged. */
async function expectRefused(client: PocketBase, eventId: string, body: Record<string, unknown>, status: number): Promise<void> {
  const before = await read(eventId);
  const rows = await auditCount();
  expect(await statusOf(client.collection("events").update(eventId, body)), JSON.stringify(body)).toBe(status);
  expect(await read(eventId)).toEqual(before);
  expect(await auditCount()).toBe(rows);
}

/** Updates as K and returns the one new audit row the change wrote. */
async function changeAsK(eventId: string, body: Record<string, unknown>): Promise<{ event: RecordModel; row: RecordModel }> {
  const before = (await eventRows(eventId)).length;
  const event = await (await as("K")).collection("events").update(eventId, body);
  const rows = await eventRows(eventId);
  expect(rows).toHaveLength(before + 1);
  const row = rows.at(-1);
  if (row === undefined) throw new Error("no row");
  return { event, row };
}

/** A code block under a bold heading in docs/security.md's "### events" section. */
async function documentedRule(heading: string): Promise<string> {
  const doc = await readFile(path.join(REPO_ROOT, "docs", "security.md"), "utf8");
  const start = doc.indexOf("\n### events\n");
  const end = doc.indexOf("\n### ", start + 1);
  const section = doc.slice(start, end < 0 ? undefined : end);
  const block = new RegExp(`\\*\\*${heading}\\*\\*\\n\`\`\`\\n([\\s\\S]*?)\\n\`\`\``).exec(section);
  if (block?.[1] === undefined) throw new Error(`security.md ### events has no ${heading} block`);
  return block[1];
}

describe("events: the rules", () => {
  it("stores the create and update rules exactly as security.md writes them, and leaves delete locked", async () => {
    const stored = await pocketbase().superuser.collections.getOne("events");

    expect(stored.createRule).toBe(await documentedRule("Create"));
    expect(stored.updateRule).toBe(await documentedRule("Update"));
    expect(stored.deleteRule).toBeNull();
  });

  it("R-EVT-D-01: K can't delete an event", async () => {
    expect(await statusOf((await as("K")).collection("events").delete(world.events.ED.id))).toBe(403);
    expect((await read(world.events.ED.id)).id).toBe(world.events.ED.id);
  });
});

describe("create", () => {
  it("R-EVT-C-01: K creates a draft; submit_deadline is ends_at + 24 h and the extension 0", async () => {
    const body = draftBody();
    const created = await (await as("K")).collection("events").create(body);

    expect(created).toMatchObject({ status: "draft", deadline_ext_min: 0, judge: users.K.id, backup_judge: users.N.id });
    expect(ms(created.submit_deadline)).toBe(ms(body.ends_at) + DAY);
  });

  it("a draft may be saved incomplete: no dates, no species, no backup judge; no deadline yet", async () => {
    const created = await createDraft("K", { starts_at: "", ends_at: "", species: [], backup_judge: "" });
    expect(created).toMatchObject({ status: "draft", submit_deadline: "", species: [] });
  });

  it.each([["M"], ["S"]] as const)("R-EVT-C-02: %s can't create an event", async (who) => {
    const name = `By ${who} ${randomUUID().slice(0, 6)}`;
    expect(await statusOf(createDraft(who, { name }))).toBe(400);
    expect((await pocketbase().superuser.collection("events").getFullList({ filter: `name = "${name}"` }))).toEqual([]);
  });

  it.each([
    ["R-EVT-C-03", "with status live", { status: "live" }],
    ["R-EVT-C-04", "with submit_deadline", { submit_deadline: iso(Date.now() + 50 * DAY) }],
    ["R-EVT-C-05", "with judge = backup_judge", { backup_judge: "K" }],
    ["R-EVT-C-06", "with deadline_ext_min", { deadline_ext_min: 60 }],
    ["R-EVT-C-07", "with a member (M) as judge", { judge: "M", backup_judge: "N" }],
    ["R-EVT-C-10", "with code_word_prev", { code_word_prev: "OAK" }],
    ["R-EVT-C-10", "with code_word_changed_at", { code_word_changed_at: iso(Date.now()) }],
  ] as const)("%s: K can't create a draft %s", async (_id, _case, raw) => {
    const overrides: Record<string, unknown> = { ...raw };
    for (const field of ["judge", "backup_judge"] as const) {
      const who = overrides[field];
      if (typeof who === "string" && who in users) overrides[field] = users[who as FixtureName].id;
    }
    const name = `Refused ${randomUUID().slice(0, 6)}`;
    const rows = await auditCount();
    expect(await statusOf(createDraft("K", { ...overrides, name }))).toBe(400);
    expect(await pocketbase().superuser.collection("events").getFullList({ filter: `name = "${name}"` })).toEqual([]);
    expect(await auditCount()).toBe(rows);
  });

  it("R-EVT-C-08: a draft with judge K and backup judge S enters both, one join row each by the organizer; members can't list them yet", async () => {
    // O creates it, so the join rows' actor is the organizer who created the event, not the judge.
    const created = await createDraft("O", { backup_judge: users.S.id });
    const entries = await entriesIn(created.id);

    expect(entries.map((entry) => entry.angler).sort()).toEqual([users.K.id, users.S.id].sort());
    for (const entry of entries) {
      const who = entry.angler === users.K.id ? users.K : users.S;
      expect(entry).toMatchObject({ display_name: who.name, withdrawn: false, withdraw_reason: "", withdrawn_by: "" });
      expect(entry.created).not.toBe("");
      const joins = await joinRowsOf(entry.id);
      expect(joins).toHaveLength(1);
      expect(joins[0]).toMatchObject({ actor: users.O.id, event: created.id, catch: "", before: null, after: { withdrawn: false, withdraw_reason: "", withdrawn_by: "" } });
    }
    // R-ENT-L-02: entries in a draft stay hidden from members.
    const m = await as("M");
    expect(await m.collection("entries").getFullList({ filter: `event = "${created.id}"` })).toEqual([]);
    // No row for the event itself: creating a tournament is recorded by its join rows (decisions.md 2026-11-17).
    expect(await eventRows(created.id)).toEqual([]);
  });

  it("R-EVT-C-09: a draft with no backup judge enters the judge only", async () => {
    const created = await createDraft("K", { backup_judge: "" });
    const entries = await entriesIn(created.id);
    expect(entries.map((entry) => entry.angler)).toEqual([users.K.id]);
  });

  it("R-ENT-C-08 still holds for an automatic entry: K joining the new draft's event again fails", async () => {
    const created = await createDraft("K");
    const { superuser } = pocketbase();
    expect(await statusOf(superuser.collection("entries").create({ event: created.id, angler: users.K.id }))).toBe(400);
    expect(await entriesIn(created.id)).toHaveLength(2);
  });
});

describe("edit a draft", () => {
  it("R-EVT-U-01: K changes every field of a draft; one event_edit row with both snapshots; the deadline follows ends_at", async () => {
    const draft = await createDraft("K");
    const now = Date.now();
    const body = {
      name: "Renamed draft",
      starts_at: iso(now + 2 * DAY),
      ends_at: iso(now + 5 * DAY),
      metric: "length",
      best_n: 5,
      species: [world.species.walleye.id],
      backup_judge: users.O.id,
      code_word_on: true,
      code_word: "PINE",
    };
    const { event, row } = await changeAsK(draft.id, body);

    expect(event).toMatchObject({ ...body, starts_at: expect.any(String), ends_at: expect.any(String) });
    expect(ms(event.submit_deadline)).toBe(ms(body.ends_at) + DAY);
    // R-AUD-H-03, H-05: one row, every events field in both snapshots, and nothing else.
    expect(row).toMatchObject({ actor: users.K.id, action: "event_edit", event: draft.id, catch: "" });
    expect(Object.keys(row.before as object).sort()).toEqual([...EVENT_FIELDS].sort());
    expect(Object.keys(row.after as object).sort()).toEqual([...EVENT_FIELDS].sort());
    expect(row.before).toMatchObject({ name: draft.name, metric: "weight", backup_judge: users.N.id });
    expect(row.after).toMatchObject({ name: "Renamed draft", metric: "length", backup_judge: users.O.id, code_word_prev: "", code_word_changed_at: "" });
  });

  it("R-EVT-U-29: a code word change on a draft keeps no history", async () => {
    const draft = await createDraft("K", { code_word_on: true, code_word: "OAK" });
    const { event } = await changeAsK(draft.id, { code_word: "MAPLE" });
    expect(event).toMatchObject({ code_word: "MAPLE", code_word_prev: "", code_word_changed_at: "" });
  });

  it("R-EVT-U-17: K changes ED-like draft's backup judge from S to N: N entered with a join row, S's entry unchanged; back to S creates nothing", async () => {
    const draft = await createDraft("K", { backup_judge: users.S.id });
    const sEntry = (await entriesIn(draft.id)).find((entry) => entry.angler === users.S.id);

    await changeAsK(draft.id, { backup_judge: users.N.id });
    const afterFirst = await entriesIn(draft.id);
    const nEntry = afterFirst.find((entry) => entry.angler === users.N.id);
    expect(nEntry).toMatchObject({ display_name: users.N.name, withdrawn: false });
    expect(await joinRowsOf(nEntry?.id ?? "")).toEqual([expect.objectContaining({ actor: users.K.id })]);
    expect(afterFirst.find((entry) => entry.angler === users.S.id)).toEqual(sEntry);

    const rows = await auditCount();
    await (await as("K")).collection("events").update(draft.id, { backup_judge: users.S.id });
    expect(await entriesIn(draft.id)).toHaveLength(afterFirst.length);
    expect(await auditCount()).toBe(rows + 1); // the event_edit row only, no join
  });

  it("changing a draft's judge to another organizer (O) enters O", async () => {
    const draft = await createDraft("K");
    await changeAsK(draft.id, { judge: users.O.id });
    expect((await entriesIn(draft.id)).map((entry) => entry.angler)).toContain(users.O.id);
  });

  it("R-EVT-U-16 (ED): K can't make a member (M) the judge of a draft", async () => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events.ED.id, { judge: users.M.id }))).toEqual({ judge: "judge_not_organizer" });
    await expectRefused(await as("K"), world.events.ED.id, { judge: users.M.id }, 400);
  });

  it("R-EVT-U-11: K can't set judge = backup_judge on update", async () => {
    await expectRefused(await as("K"), world.events.ED.id, { backup_judge: users.K.id }, 400);
  });

  it.each([
    ["deadline_ext_min", { deadline_ext_min: 60 }, 404],
    ["code_word_prev", { code_word_prev: "OAK" }, 404],
    ["code_word_changed_at", { code_word_changed_at: iso(Date.now()) }, 404],
    ["submit_deadline", { submit_deadline: iso(Date.now()) }, 404],
  ] as const)("R-EVT-U-14, U-28: an update body setting %s on ED is refused by the rule", async (_field, body, status) => {
    await expectRefused(await as("K"), world.events.ED.id, body, status);
  });

  it("refuses an update that changes nothing, and writes no row", async () => {
    const draft = await createDraft("K");
    await expectRefused(await as("K"), draft.id, { name: draft.name }, 400);
  });

  it.each([["M"], ["S"]] as const)("R-EVT-U-02: %s can't update any event", async (who) => {
    const client = await as(who);
    for (const key of ["E1", "E2", "ED", "EC"] as const) {
      await expectRefused(client, world.events[key].id, { name: "Renamed" }, 404);
    }
  });
});

describe("open (draft → live)", () => {
  it("R-EVT-U-06: K opens a complete draft; one open row", async () => {
    const draft = await createDraft("K", { starts_at: iso(Date.now() - HOUR) });
    const { event, row } = await changeAsK(draft.id, { status: "live" });

    expect(event.status).toBe("live");
    expect(row).toMatchObject({ actor: users.K.id, action: "open", before: expect.objectContaining({ status: "draft" }), after: expect.objectContaining({ status: "live" }) });
  });

  it.each([
    ["starts_at not before ends_at", (now: number) => ({ starts_at: iso(now + 20 * DAY), ends_at: iso(now + 20 * DAY) })],
    ["no species", () => ({ species: [] })],
    ["no backup judge", () => ({ backup_judge: "" })],
    ["code_word_on with an empty code_word", () => ({ code_word_on: true, code_word: "" })],
    ["code_word_on with a code word of spaces", () => ({ code_word_on: true, code_word: "   " })],
  ] as const)("R-EVT-U-25: Open is refused with %s; the event stays a draft", async (_case, broken) => {
    const draft = await createDraft("K", broken(Date.now()));
    expect(await refusedFields((await as("K")).collection("events").update(draft.id, { status: "live" }))).toEqual({ status: "open_incomplete" });
    await expectRefused(await as("K"), draft.id, { status: "live" }, 400);
  });

  it("refuses a status change sent together with another field (each step on its own, one row each)", async () => {
    const draft = await createDraft("K");
    expect(await refusedFields((await as("K")).collection("events").update(draft.id, { status: "live", name: "And renamed" }))).toEqual({ status: "status_alone" });
  });

  it.each([
    ["ED", "closed"],
    ["ED", "final"],
    ["E1", "final"],
  ] as const)("R-EVT-U-09: %s can't skip to %s", async (key, status) => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events[key].id, { status }))).toEqual({ status: "status_step" });
    await expectRefused(await as("K"), world.events[key].id, { status }, 400);
  });
});

describe("live edits", () => {
  it.each([
    ["metric", () => ({ metric: "length" })],
    ["best_n", () => ({ best_n: 5 })],
    ["species", () => ({ species: [world.species.largemouth.id] })],
    ["starts_at", () => ({ starts_at: iso(Date.now() - 8 * DAY) })],
  ] as const)("R-EVT-U-03: K can't change %s on E1 (live)", async (_field, body) => {
    await expectRefused(await as("K"), world.events.E1.id, body(), 404);
  });

  it("R-EVT-U-18: K can't change the judge of E1 (live), even to another organizer", async () => {
    await expectRefused(await as("K"), world.events.E1.id, { judge: users.O.id }, 404);
  });

  it("R-EVT-U-16 (E1): K can't make a member the judge of a live event (the rule's lock)", async () => {
    await expectRefused(await as("K"), world.events.E1.id, { judge: users.M.id }, 404);
  });

  it("R-EVT-U-20: K changes name, code_word_on and code_word on a live event, one event_edit row each", async () => {
    const live = await openLive();
    for (const body of [{ name: "Renamed live" }, { code_word_on: true }, { code_word: "OAK" }]) {
      const { row } = await changeAsK(live.id, body);
      expect(row).toMatchObject({ actor: users.K.id, action: "event_edit", after: expect.objectContaining(body) });
    }
  });

  it("R-EVT-U-27: changing the code word on a live event from OAK to MAPLE keeps OAK and when it changed", async () => {
    const live = await openLive({ code_word_on: true, code_word: "OAK" });
    const started = Date.now();
    const { event, row } = await changeAsK(live.id, { code_word: "MAPLE" });

    expect(event).toMatchObject({ code_word: "MAPLE", code_word_prev: "OAK" });
    expect(ms(event.code_word_changed_at)).toBeGreaterThanOrEqual(started - 1000);
    expect(ms(event.code_word_changed_at)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(row.after).toMatchObject({ code_word: "MAPLE", code_word_prev: "OAK" });
  });

  it("R-EVT-U-28: an update body setting code_word_prev or code_word_changed_at on E1 is refused", async () => {
    await expectRefused(await as("K"), world.events.E1.id, { code_word_prev: "ELM" }, 404);
    await expectRefused(await as("K"), world.events.E1.id, { code_word_changed_at: iso(Date.now()) }, 404);
  });

  it("R-EVT-U-04: K changes a live event's backup judge; the new backup judge is entered; audited", async () => {
    const live = await openLive();
    const { event, row } = await changeAsK(live.id, { backup_judge: users.O.id });

    expect(event.backup_judge).toBe(users.O.id);
    expect((await entriesIn(live.id)).map((entry) => entry.angler)).toContain(users.O.id);
    expect(row).toMatchObject({ action: "event_edit", before: expect.objectContaining({ backup_judge: users.N.id }), after: expect.objectContaining({ backup_judge: users.O.id }) });
  });

  it("refuses clearing the backup judge of a live event (the judge's catches would have no judge)", async () => {
    const live = await openLive();
    expect(await refusedFields((await as("K")).collection("events").update(live.id, { backup_judge: "" }))).toEqual({ backup_judge: "backup_required" });
  });

  it("R-EVT-U-04, U-21: K moves ends_at later while the window is open; the deadline is recomputed", async () => {
    const live = await openLive();
    const later = ms(live.ends_at) + 2 * DAY;
    const { event, row } = await changeAsK(live.id, { ends_at: iso(later) });

    expect(ms(event.ends_at)).toBe(later);
    expect(ms(event.submit_deadline)).toBe(later + DAY);
    expect(row).toMatchObject({ action: "event_edit" });
  });

  it("R-EVT-U-22: K can't move ends_at earlier on E1", async () => {
    const earlier = ms(world.events.E1.ends_at) - DAY;
    expect(await refusedFields((await as("K")).collection("events").update(world.events.E1.id, { ends_at: iso(earlier) }))).toEqual({ ends_at: "ends_at_earlier" });
    await expectRefused(await as("K"), world.events.E1.id, { ends_at: iso(earlier) }, 400);
  });

  it("R-EVT-U-22: K can't move ends_at later once the window has closed (live, past ends_at)", async () => {
    const over = await eventIn("live", { ends: Date.now() - HOUR });
    const later = Date.now() + DAY;
    expect(await refusedFields((await as("K")).collection("events").update(over.id, { ends_at: iso(later) }))).toEqual({ ends_at: "ends_at_window_closed" });
    await expectRefused(await as("K"), over.id, { ends_at: iso(later) }, 400);
  });
});

describe("outage extension", () => {
  it("R-EVT-U-12, scoring.md example 23: K raises the extension to 3 h after an outage; the deadline moves, ends_at doesn't", async () => {
    const live = await eventIn("live", { ends: Date.now() - 12 * HOUR });
    const { event, row } = await changeAsK(live.id, { deadline_ext_min: 180 });

    expect(event.deadline_ext_min).toBe(180);
    expect(event.ends_at).toBe(live.ends_at);
    expect(ms(event.submit_deadline)).toBe(ms(live.ends_at) + DAY + 3 * HOUR);
    expect(row).toMatchObject({ action: "event_edit", before: expect.objectContaining({ deadline_ext_min: 0 }), after: expect.objectContaining({ deadline_ext_min: 180 }) });
  });

  it("R-EVT-U-13: K can't lower the extension", async () => {
    const live = await eventIn("live", { ends: Date.now() - 12 * HOUR });
    await (await as("K")).collection("events").update(live.id, { deadline_ext_min: 180 });
    expect(await refusedFields((await as("K")).collection("events").update(live.id, { deadline_ext_min: 120 }))).toEqual({ deadline_ext_min: "ext_lower" });
    await expectRefused(await as("K"), live.id, { deadline_ext_min: 0 }, 400);
  });

  it("R-EVT-U-14: K can't set the extension on ED or EC", async () => {
    await expectRefused(await as("K"), world.events.ED.id, { deadline_ext_min: 60 }, 404);
    await expectRefused(await as("K"), world.events.EC.id, { deadline_ext_min: 60 }, 404);
  });

  it("R-EVT-U-15: K can't set an extension that isn't whole hours on E1", async () => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events.E1.id, { deadline_ext_min: 90 }))).toEqual({ deadline_ext_min: "ext_not_hours" });
    await expectRefused(await as("K"), world.events.E1.id, { deadline_ext_min: 90 }, 400);
  });

  it("R-EVT-U-26, R-CAT-C-17: raising the extension after the deadline passed reopens joining and submitting; a fish after ends_at is still flagged", async () => {
    // The window closed 25 h ago, so the final deadline (ends_at + 24 h) passed an hour ago.
    const live = await eventIn("live", { ends: Date.now() - 25 * HOUR });
    const joiner = await pocketbase().superuser.collection("users").create(newUser({ name: "Late Joiner", emailVisibility: false, verified: true }));
    const client = await actAs(pocketbase(), joiner);
    const join = () => client.collection("entries").create({ event: live.id, angler: joiner.id });
    expect(await statusOf(join())).toBe(400);

    await (await as("K")).collection("events").update(live.id, { deadline_ext_min: 180 });

    const entry = await join();
    const capturedAt = iso(Date.now() - 2 * HOUR); // after ends_at
    const form = new FormData();
    for (const [key, value] of Object.entries({
      entry: entry.id,
      species: world.species.largemouth.id,
      weight_hoz: "5500",
      client_uuid: randomUUID(),
      captured_at: capturedAt,
      photo_captured_at: JSON.stringify([capturedAt, capturedAt]),
    })) {
      form.set(key, value);
    }
    form.append("photo", await photo("clean-1.jpg"));
    form.append("photo", await photo("clean-2.jpg"));
    const caught = await client.collection("catches").create(form);

    expect(caught.status).toBe("pending");
    expect(caught.flags).toContain("after_window");
  });
});

describe("close (live → closed)", () => {
  it("R-EVT-U-07: K can't close E1 before submit_deadline", async () => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events.E1.id, { status: "closed" }))).toEqual({ status: "close_too_early" });
    await expectRefused(await as("K"), world.events.E1.id, { status: "closed" }, 400);
  });

  it("K closes a live event once its deadline has passed; one close row; the deadline is unchanged", async () => {
    // A deadline set apart from ends_at (an extension already applied by hand) doesn't move on close.
    const over = await eventIn("live", { ends: Date.now() - 3 * DAY, deadline: Date.now() - HOUR });
    const { event, row } = await changeAsK(over.id, { status: "closed" });

    expect(event.status).toBe("closed");
    expect(event.submit_deadline).toBe(over.submit_deadline);
    expect(row).toMatchObject({ actor: users.K.id, action: "close", after: expect.objectContaining({ status: "closed" }) });
  });

  it("R-EVT-U-10: K can't take EC back to live", async () => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events.EC.id, { status: "live" }))).toEqual({ status: "status_step" });
    await expectRefused(await as("K"), world.events.EC.id, { status: "live" }, 400);
  });
});

describe("closed edits", () => {
  it("R-EVT-U-23: K changes a closed event's backup judge from N to S; no entry and no join row; one event_edit row", async () => {
    const closed = await eventIn("closed", { ends: Date.now() - 3 * DAY, deadline: Date.now() - 2 * DAY });
    const entries = await entriesIn(closed.id);
    const rows = await auditCount();

    const { row } = await changeAsK(closed.id, { backup_judge: users.S.id });

    expect(await entriesIn(closed.id)).toEqual(entries);
    expect(await auditCount()).toBe(rows + 1);
    expect(row).toMatchObject({ action: "event_edit", after: expect.objectContaining({ backup_judge: users.S.id }) });
  });

  it.each([
    ["name", () => ({ name: "Renamed closed" })],
    ["code_word_on", () => ({ code_word_on: true })],
    ["code_word", () => ({ code_word: "ELM" })],
    ["ends_at", () => ({ ends_at: iso(Date.now() + DAY) })],
    ["judge", () => ({ judge: users.O.id })],
  ] as const)("R-EVT-U-24: K can't change %s on EC", async (_field, body) => {
    await expectRefused(await as("K"), world.events.EC.id, body(), 404);
  });
});

describe("finalize (closed → final)", () => {
  it("R-EVT-U-08: K can't finalize EC while N's catch is pending", async () => {
    expect(await refusedFields((await as("K")).collection("events").update(world.events.EC.id, { status: "final" }))).toEqual({ status: "finalize_pending" });
    await expectRefused(await as("K"), world.events.EC.id, { status: "final" }, 400);
  });

  it("K finalizes a closed event with nothing pending (a retracted catch doesn't block it); one finalize row", async () => {
    const closed = await eventIn("closed", { ends: Date.now() - 3 * DAY, deadline: Date.now() - 2 * DAY });
    const entry = (await entriesIn(closed.id)).find((candidate) => candidate.angler === users.N.id);
    const capturedAt = iso(Date.now() - 4 * DAY);
    await pocketbase().superuser.collection("catches").create({
      entry: entry?.id,
      species: world.species.largemouth.id,
      weight_hoz: 4000,
      photo: [await photo("clean-1.jpg"), await photo("clean-2.jpg")],
      captured_at: capturedAt,
      photo_captured_at: [capturedAt, capturedAt],
      client_uuid: randomUUID(),
      rev: 2,
      status: "retracted",
      flags: [],
    });

    const { event, row } = await changeAsK(closed.id, { status: "final" });
    expect(event.status).toBe("final");
    expect(row).toMatchObject({ actor: users.K.id, action: "finalize", before: expect.objectContaining({ status: "closed" }), after: expect.objectContaining({ status: "final" }) });
  });
});

describe("final lock (S4 step 7, invariant 7)", () => {
  it("R-EVT-U-05: K can't change anything on EF, its status included", async () => {
    for (const body of [{ name: "Renamed final" }, { status: "closed" }, { backup_judge: users.S.id }, { code_word: "ELM" }]) {
      await expectRefused(await as("K"), world.events.EF.id, body, 404);
    }
  });

  it("R-ENT-U-10: neither K (organizer) nor N (the angler) can change an EF entry", async () => {
    const entry = entryOf(world, "EF.N");
    expect(await statusOf((await as("K")).collection("entries").update(entry.id, { withdrawn: true, withdraw_reason: "Testing the lock" }))).toBe(404);
    expect(await statusOf((await as("N")).collection("entries").update(entry.id, { withdrawn: true }))).toBe(404);
    expect(await pocketbase().superuser.collection("entries").getOne(entry.id)).toMatchObject({ withdrawn: false });
  });

  it("R-CAT-U-12: neither K (judge) nor N (angler or backup judge) can change an EF catch", async () => {
    const nCatch = catchOf(world, "EF.N.verified");
    const kCatch = catchOf(world, "EF.K.verified");
    expect(await statusOf((await as("K")).collection("catches").update(nCatch.id, { status: "rejected", reason: "Too late", rev: nCatch.rev }))).toBe(404);
    expect(await statusOf((await as("N")).collection("catches").update(kCatch.id, { status: "rejected", reason: "Too late", rev: kCatch.rev }))).toBe(404);
    expect(await statusOf((await as("N")).collection("catches").update(nCatch.id, { weight_hoz: 9999, rev: nCatch.rev }))).toBe(404);
    expect(await pocketbase().superuser.collection("catches").getOne(nCatch.id)).toMatchObject({ status: "verified", weight_hoz: nCatch.weight_hoz });
  });
});

describe("audit rows (R-AUD-H-03, H-05)", () => {
  it("every event row written in this file holds exactly the events snapshot fields", async () => {
    const { superuser } = pocketbase();
    const rows = await superuser.collection("audit_log").getFullList({ filter: 'action = "open" || action = "close" || action = "finalize" || action = "event_edit"' });
    const written = rows.filter((row) => row.actor !== "");
    expect(written.length).toBeGreaterThan(10);
    for (const row of written) {
      expect(Object.keys(row.before as object).sort(), row.id).toEqual([...EVENT_FIELDS].sort());
      expect(Object.keys(row.after as object).sort(), row.id).toEqual([...EVENT_FIELDS].sort());
      expect(row.target_id).toBe(row.event);
      expect(row.catch).toBe("");
    }
  });
});
