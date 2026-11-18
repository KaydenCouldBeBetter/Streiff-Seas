// ORG-01 to ORG-06 and ORG-10 (web/src/lib/eventAdmin.ts): Manage's view, the tournament form's
// body, Open, Extend, Close, Finalize and adding a species, against the fixture world and the
// events hooks (S4 steps 1 to 5). Pure checks first, then against PocketBase.

import { randomUUID } from "node:crypto";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { clubInputToIso } from "../web/src/lib/clubTime";
import {
  EMPTY_FORM,
  addSpecies,
  eventBody,
  eventFormFromRecord,
  formErrors,
  loadManage,
  managePhase,
  openChecklist,
  refusalCopy,
  retryEventChange,
  sendEventChange,
  type EventForm,
} from "../web/src/lib/eventAdmin";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { seedWorld, type World } from "./harness/world";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const rec = (fields: Record<string, unknown>) => ({ id: "ev", collectionId: "", collectionName: "events", ...fields }) as RecordModel;

describe("pure", () => {
  it("phase by the server's clock: live before and after the final deadline", () => {
    const deadline = new Date(Date.UTC(2027, 7, 17));
    expect(managePhase("live", deadline, deadline.getTime())).toBe("live:open");
    expect(managePhase("live", deadline, deadline.getTime() + 1)).toBe("live:over");
    expect(managePhase("closed", deadline, 0)).toBe("closed");
  });

  it("the Open checklist is the hook's four conditions (R-EVT-U-25)", () => {
    const complete = rec({ starts_at: "2027-07-04 10:00:00.000Z", ends_at: "2027-08-16 00:00:00.000Z", species: ["s"], judge: "k", backup_judge: "n", code_word_on: true, code_word: "OAK" });
    expect(openChecklist(complete).every((item) => item.done)).toBe(true);
    const failing = (fields: Record<string, unknown>) => openChecklist(rec({ ...complete, ...fields })).filter((item) => !item.done).map((item) => item.id);
    expect(failing({ ends_at: "2027-07-04 10:00:00.000Z" })).toEqual(["window"]);
    expect(failing({ starts_at: "" })).toEqual(["window"]);
    expect(failing({ species: [] })).toEqual(["species"]);
    expect(failing({ backup_judge: "" })).toEqual(["backup_judge"]);
    expect(failing({ backup_judge: "k" })).toEqual(["backup_judge"]);
    expect(failing({ code_word: "  " })).toEqual(["code_word"]);
    expect(failing({ code_word_on: false, code_word: "" })).toEqual([]);
  });

  const form: EventForm = {
    ...EMPTY_FORM,
    name: "Summer Bass 2027",
    startsAt: "2027-07-04T06:00",
    endsAt: "2027-08-15T20:00",
    species: ["s2", "s1"],
    judge: "k",
    backupJudge: "n",
  };

  it("a new draft sends every field as Eastern UTC times, status draft, and never a hook-set field", () => {
    expect(eventBody(form, "new")).toEqual({
      status: "draft",
      name: "Summer Bass 2027",
      starts_at: "2027-07-04T10:00:00.000Z",
      ends_at: "2027-08-16T00:00:00.000Z",
      metric: "weight",
      best_n: 10,
      species: ["s1", "s2"],
      judge: "k",
      backup_judge: "n",
      code_word_on: false,
      code_word: "",
    });
  });

  it("an edit sends only the changed fields the status allows (ORG-03a, 03b)", () => {
    const changed = { ...form, name: "Renamed", metric: "length" as const, endsAt: "2027-08-16T20:00", codeWord: "OAK", codeWordOn: true };
    expect(eventBody(changed, "draft", form)).toEqual({ name: "Renamed", metric: "length", ends_at: "2027-08-17T00:00:00.000Z", code_word: "OAK", code_word_on: true });
    // Live: metric is locked, so it isn't sent even though the form holds it.
    expect(eventBody(changed, "live", form)).toEqual({ name: "Renamed", ends_at: "2027-08-17T00:00:00.000Z", code_word: "OAK", code_word_on: true });
    expect(eventBody({ ...changed, backupJudge: "o" }, "closed", form)).toEqual({ backup_judge: "o" });
    expect(eventBody(form, "draft", form)).toEqual({});
  });

  it("form errors: name, judge = backup, best N, and a live end that moves earlier or after fishing ended", () => {
    expect(formErrors({ ...form, name: " " }, "new")).toEqual({ name: "Give the tournament a name." });
    expect(Object.keys(formErrors({ ...form, backupJudge: "k" }, "draft")).sort()).toEqual(["backupJudge", "judge"]);
    expect(formErrors({ ...form, bestN: "0" }, "draft")).toEqual({ bestN: "A whole number, 1 or more." });
    expect(formErrors({ ...form, endsAt: "2027-08-14T20:00" }, "live", form)).toEqual({ endsAt: "The end can only move later." });
    expect(formErrors({ ...form, endsAt: "2027-08-16T20:00" }, "live", form, false)).toEqual({ endsAt: "Fishing has ended, so the end can't move now." });
    expect(formErrors({ ...form, backupJudge: "" }, "live", form)).toEqual({ backupJudge: "Choose a backup judge." });
    // A draft may be saved incomplete (Gap 11).
    expect(formErrors({ ...EMPTY_FORM, name: "Later", judge: "k" }, "new")).toEqual({});
  });

  it("the form reads a record back in Eastern time", () => {
    expect(eventFormFromRecord(rec({ name: "X", starts_at: "2027-07-04 10:00:00.000Z", ends_at: "", metric: "length", best_n: 5, species: ["a"], judge: "k", backup_judge: "", code_word_on: false, code_word: "" }))).toEqual({
      ...EMPTY_FORM,
      name: "X",
      startsAt: "2027-07-04T06:00",
      metric: "length",
      bestN: "5",
      species: ["a"],
      judge: "k",
    });
  });
});

describe("against PocketBase", () => {
  const pocketbase = usePocketBase();
  let users: FixtureUsers;
  let world: World;
  const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

  beforeAll(async () => {
    users = await createFixtureUsers(pocketbase());
    world = await seedWorld(pocketbase(), users);
  });

  /** A live event of its own, with its window and deadline as given, judge K, backup N. */
  async function liveEvent(ends: number, deadline = ends + DAY): Promise<RecordModel> {
    const event = await pocketbase().superuser.collection("events").create({
      name: `Live ${randomUUID().slice(0, 6)}`,
      status: "live",
      starts_at: new Date(ends - 30 * DAY).toISOString(),
      ends_at: new Date(ends).toISOString(),
      submit_deadline: new Date(deadline).toISOString(),
      deadline_ext_min: 0,
      metric: "weight",
      best_n: 10,
      judge: users.K.id,
      backup_judge: users.N.id,
      species: [world.species.largemouth.id],
    });
    for (const who of [users.K.id, users.N.id]) await pocketbase().superuser.collection("entries").create({ event: event.id, angler: who });
    return event;
  }

  it("Manage for E1: live, facts, counts with the pending split, people and species", async () => {
    const data = await loadManage(await as("K"), world.events.E1.id, users.K.id, Date.now());
    expect(data).toMatchObject({ status: "live", phase: "live:open", canOpen: false });
    expect(data.facts.map((fact) => fact.label)).toEqual(["Name", "Fishing window", "Final deadline", "Counts", "Species", "Judge", "Backup judge", "Code word"]);
    expect(data.facts.find((fact) => fact.label === "Code word")?.value).toBe("On · OAK");
    expect(data.facts.find((fact) => fact.label === "Judge")?.value).toBe(users.K.name);
    // E1: M, Y, K and W have pending catches (W's on a withdrawn entry still counts: it must be judged).
    expect(data.counts).toEqual({ entries: 4, pending: 4, pendingForJudge: 3, pendingForBackup: 1 });
    expect(data.people.filter((person) => person.organizer).map((person) => person.id).sort()).toEqual([users.K.id, users.O.id].sort());
    expect(data.species.map((item) => item.name)).toEqual(["Largemouth bass", "Smallmouth bass", "Walleye"]);
  });

  it("Manage for ED (draft, checklist met), EC (closed), EF (final)", async () => {
    const k = await as("K");
    const ed = await loadManage(k, world.events.ED.id, users.K.id, Date.now());
    expect(ed).toMatchObject({ phase: "draft", canOpen: true });
    expect((await loadManage(k, world.events.EC.id, users.K.id, Date.now())).phase).toBe("closed");
    expect((await loadManage(k, world.events.EF.id, users.K.id, Date.now())).phase).toBe("final");
  });

  it("create a draft through the form body; the judge and backup judge are entered; then open it", async () => {
    const k = await as("K");
    const now = Date.now();
    const toInput = (ms: number) => new Date(ms - 4 * HOUR).toISOString().slice(0, 16); // close enough: only order matters here
    const form: EventForm = {
      ...EMPTY_FORM,
      name: `Form Draft ${randomUUID().slice(0, 6)}`,
      startsAt: toInput(now - DAY),
      endsAt: toInput(now + 20 * DAY),
      species: [world.species.largemouth.id],
      judge: users.K.id,
      backupJudge: users.S.id,
    };
    const created = await sendEventChange(k, null, eventBody(form, "new"));
    if (created.kind !== "saved") throw new Error(`not saved: ${JSON.stringify(created)}`);
    expect(created.event.starts_at).not.toBe("");
    expect(Date.parse(String(created.event.starts_at).replace(" ", "T"))).toBe(Date.parse(clubInputToIso(form.startsAt)));
    const entries = await pocketbase().superuser.collection("entries").getFullList({ filter: `event = "${created.event.id}"` });
    expect(entries.map((entry) => entry.angler).sort()).toEqual([users.K.id, users.S.id].sort());

    expect((await loadManage(k, created.event.id, users.K.id, now)).canOpen).toBe(true);
    expect(await sendEventChange(k, created.event.id, { status: "live" })).toMatchObject({ kind: "saved" });
    // Retry of an Open that already landed sends nothing (ORG-01a's NOT SENT).
    expect(await retryEventChange(k, created.event.id, { status: "live" })).toEqual({ kind: "already-saved" });
  });

  it("refusals are explained: close too early (E1), finalize with pending (EC), an extension lowered, a step skipped", async () => {
    const k = await as("K");
    const early = await sendEventChange(k, world.events.E1.id, { status: "closed" });
    expect(early).toMatchObject({ kind: "refused", reason: "close_too_early" });
    if (early.kind === "refused") expect(refusalCopy(early.reason, early.event).message).toMatch(/^The final deadline is .+\. You can close once it has passed\.$/);

    expect(await sendEventChange(k, world.events.EC.id, { status: "final" })).toMatchObject({ kind: "refused", reason: "finalize_pending" });
    expect(await sendEventChange(k, world.events.ED.id, { status: "closed" })).toMatchObject({ kind: "refused", reason: "status_changed" });

    const live = await liveEvent(Date.now() - 12 * HOUR);
    expect(await sendEventChange(k, live.id, { deadline_ext_min: 180 })).toMatchObject({ kind: "saved" });
    const lowered = await sendEventChange(k, live.id, { deadline_ext_min: 120 });
    expect(lowered).toMatchObject({ kind: "refused", reason: "ext_lower" });
    if (lowered.kind === "refused") expect(refusalCopy(lowered.reason, lowered.event).message).toBe("The extension was already raised to 3 h. It can only go up.");
    // Retry of the 3 h total after a lost reply: it's already there (ORG-04c).
    expect(await retryEventChange(k, live.id, { deadline_ext_min: 180 })).toEqual({ kind: "already-saved" });
  });

  it("a rule refusal with no hook code (EF is final) is explained by reloading", async () => {
    expect(await sendEventChange(await as("K"), world.events.EF.id, { name: "Renamed" })).toMatchObject({ kind: "refused", reason: "final" });
  });

  it("close, then finalize once nothing is pending; Retry after each lands as already saved", async () => {
    const k = await as("K");
    const over = await liveEvent(Date.now() - 3 * DAY, Date.now() - HOUR);
    expect((await loadManage(k, over.id, users.K.id, Date.now())).phase).toBe("live:over");
    expect(await sendEventChange(k, over.id, { status: "closed" })).toMatchObject({ kind: "saved" });
    expect(await retryEventChange(k, over.id, { status: "closed" })).toEqual({ kind: "already-saved" });
    expect(await sendEventChange(k, over.id, { status: "final" })).toMatchObject({ kind: "saved" });
    expect(await retryEventChange(k, over.id, { status: "final" })).toEqual({ kind: "already-saved" });
  });

  it("species: K adds one (stored lower case); a duplicate is caught before sending, and by the server", async () => {
    const k = await as("K");
    const name = `Lake  Trout ${randomUUID().replace(/[^a-f]/g, "").slice(0, 4) || "x"}`;
    const saved = await addSpecies(k, name, []);
    expect(saved).toMatchObject({ kind: "saved" });
    if (saved.kind === "saved") expect(saved.name).toBe(name.replace(/\s+/g, " ").replace(/^l/, "L").replace(/ T/, " t"));
    expect(await addSpecies(k, "LARGEMOUTH  bass", [{ name: "Largemouth bass" }])).toEqual({ kind: "duplicate", existing: "Largemouth bass" });
    // A stale list: the server's unique index still catches it.
    expect(await addSpecies(k, "smallmouth bass", [])).toEqual({ kind: "duplicate", existing: "Smallmouth bass" });
    expect(await addSpecies(await as("M"), "perch", [])).toEqual({ kind: "not-accepted" });
    expect(await addSpecies(k, "   ", [])).toEqual({ kind: "invalid" });
  });
});
