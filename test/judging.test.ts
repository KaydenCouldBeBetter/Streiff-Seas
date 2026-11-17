// The judge's screens from the server (S3): web/src/lib/judging.ts (JDG-00 Judging home, JDG-01
// queue), judgeReview.ts (JDG-02), judgeDecision.ts (JDG-02 to JDG-05 sends and retries) and
// entriesAdmin.ts (ORG-08, ORG-09), against a PocketBase booted from pb_migrations/ and pb_hooks/
// with the fixture world; and flags.ts and the code word card, pure. The tests that change the
// world run last, each on catches it doesn't share.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { catchBaseOf } from "../web/src/lib/changeCatch";
import { flagLabel, flagSpoken, gapText, receiptGap, type FlagContext } from "../web/src/lib/flags";
import { loadEntries, retryEntryWithdrawn, setEntryWithdrawn } from "../web/src/lib/entriesAdmin";
import { decisionBody, retryDecision, sendDecision } from "../web/src/lib/judgeDecision";
import { codeWordCheck, loadReview } from "../web/src/lib/judgeReview";
import { judgesAny, loadJudging, loadQueue } from "../web/src/lib/judging";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type CatchKey, type World } from "./harness/world";

const pocketbase = usePocketBase();
const HOUR = 3600_000;

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);
const ids = (...keys: CatchKey[]) => keys.map((key) => catchOf(world, key).id);

// ---------------------------------------------------------------------------------------------

describe("flags", () => {
  const at = Date.parse("2027-07-10T10:00:00Z");
  const ctx = (overrides: Partial<FlagContext> = {}): FlagContext => ({
    capturedAt: new Date(at),
    created: new Date(at + 26 * HOUR + 20 * 60_000),
    photoTimes: [new Date(at), new Date(at + 31 * HOUR + 5 * 60_000)],
    ...overrides,
  });

  it("writes gaps in whole hours, or minutes under an hour, rounded down", () => {
    expect(gapText(26.9 * HOUR)).toBe("26 h");
    expect(gapText(37 * 60_000 + 59_000)).toBe("37 min");
    expect(gapText(-2 * HOUR)).toBe("2 h");
  });

  it("says how long after the photo a catch was received, or that the time is missing (scoring.md example 22)", () => {
    expect(receiptGap(new Date(at), new Date(at + 2 * HOUR))).toBe("2 h after photo");
    expect(receiptGap(null, new Date(at))).toBe("photo time missing");
  });

  it("labels each code as the Figma Flag chip does, with its code in the spoken name", () => {
    expect(flagLabel("late_submit", ctx())).toBe("late_submit · 26 h");
    expect(flagLabel("photo_added", ctx())).toBe("photo_added · added later");
    expect(flagLabel("extra_photo_far", ctx())).toBe("extra_photo_far · 31 h apart");
    expect(flagLabel("no_capture_time", ctx({ capturedAt: null }))).toBe("no_capture_time");
    expect(flagLabel("before_window", ctx())).toBe("before_window");
    expect(flagSpoken("late_submit", ctx())).toBe("Flag: late submit, 26 hours (late_submit)");
    expect(flagSpoken("no_capture_time", ctx())).toBe("Flag: no capture time (no_capture_time)");
  });
});

describe("codeWordCheck (JDG-02i; scoring.md example 27)", () => {
  const changed = "2027-07-10 11:00:00.000Z"; // Sat 7:00 AM club time
  const event = (extra: Record<string, unknown> = {}) => ({ id: "e", collectionId: "", collectionName: "events", code_word_on: true, code_word: "MAPLE", code_word_prev: "OAK", code_word_changed_at: changed, ...extra }) as RecordModel;

  it("is absent when the code word is off", () => {
    expect(codeWordCheck(event({ code_word_on: false }), new Date())).toBeNull();
  });

  it("is the current word when it never changed", () => {
    expect(codeWordCheck(event({ code_word_prev: "", code_word_changed_at: "" }), new Date())).toEqual({ kind: "one", word: "MAPLE" });
  });

  it("X: photo half an hour before the change shows both words, OAK in effect; Z: two days after, MAPLE alone", () => {
    const x = codeWordCheck(event(), new Date(Date.parse("2027-07-10T10:30:00Z")));
    expect(x).toMatchObject({ kind: "both", previous: "OAK", current: "MAPLE" });
    expect(x?.kind === "both" && x.explanation).toContain("OAK was in effect then; you decide if MAPLE is fine.");
    expect(codeWordCheck(event(), new Date(Date.parse("2027-07-12T14:00:00Z")))).toEqual({ kind: "one", word: "MAPLE" });
    expect(codeWordCheck(event(), new Date(Date.parse("2027-07-08T14:00:00Z")))).toEqual({ kind: "one", word: "OAK" });
  });

  it("shows both words when photo 1 has no capture time", () => {
    expect(codeWordCheck(event(), null)).toMatchObject({ kind: "both" });
  });
});

// ---------------------------------------------------------------------------------------------

describe("loadJudging (JDG-00a)", () => {
  it("gives K a section for every live or closed tournament K judges, never the draft or the final one", async () => {
    const sections = await loadJudging(await as("K"), users.K.id, "lb");
    // By start time, then name: EC started earliest.
    expect(sections.map((s) => [s.name, s.role, s.status])).toEqual([
      ["EC Closed", "Judge", "closed"],
      ["E1 Spring Bass", "Judge", "live"],
      ["E2 Second Live", "Judge", "live"],
      ["EL Length Live", "Judge", "live"],
    ]);
  });

  it("gives S only E1, as backup judge, counting only K's pending catch; N gets every other live or closed one", async () => {
    const s = await loadJudging(await as("S"), users.S.id, "lb");
    expect(s.map((x) => [x.name, x.role, x.pending])).toEqual([["E1 Spring Bass", "Backup judge", 1]]);
    expect(s[0]?.oldest.map((item) => item.id)).toEqual(ids("E1.K.pending"));

    const n = await loadJudging(await as("N"), users.N.id, "lb");
    expect(n.map((x) => x.role)).toEqual(["Backup judge", "Backup judge", "Backup judge"]);
  });

  it("shows the Judge tab to judges and backup judges only", async () => {
    expect(await judgesAny(await as("K"), users.K.id)).toBe(true);
    expect(await judgesAny(await as("S"), users.S.id)).toBe(true);
    expect(await judgesAny(await as("M"), users.M.id)).toBe(false);
    expect(await judgesAny(await as("O"), users.O.id)).toBe(false);
  });
});

describe("loadQueue (JDG-01)", () => {
  it("gives K every E1 catch but K's own, retracted ones left out, each filter in its order; W's catches marked withdrawn (R-CAT-L-05)", async () => {
    const queue = await loadQueue(await as("K"), world.events.E1.id, users.K.id, "lb");

    expect(queue.role).toBe("Judge");
    expect(queue.lists.pending.map((i) => i.id)).toEqual(ids("E1.M.pending", "E1.Y.pending", "E1.W.pending"));
    expect(queue.lists.verified.map((i) => i.id).sort()).toEqual(ids("E1.M.verified", "E1.Y.verified", "E1.S.verified", "E1.W.verified").sort());
    expect(queue.lists.rejected.map((i) => i.id).sort()).toEqual(ids("E1.M.rejected", "E1.Y.rejected", "E1.S.rejected").sort());
    expect(queue.lists.pending.find((i) => i.id === catchOf(world, "E1.W.pending").id)?.entryWithdrawn).toBe(true);
    expect(queue.lists.rejected[0]?.reason).toBe("Readout not legible");

    const first = queue.lists.pending[0]!;
    expect(first.name).toBe("Angler M");
    expect(first.summary).toMatch(/^\d+\.\d\d lb · (Largemouth|Smallmouth) · 2 photos$/);
    expect(first.received).toMatch(/^Received [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M · \d+ (h|min) after photo$/);
    expect(first.thumbnailUrl).toMatch(/[?&]token=/);
  });

  it("gives S only K's E1 catches (R-CAT-L-06); O, who judges nothing, has no role", async () => {
    const s = await loadQueue(await as("S"), world.events.E1.id, users.S.id, "lb");
    expect(s.role).toBe("Backup judge");
    expect(s.lists.pending.map((i) => i.id)).toEqual(ids("E1.K.pending"));
    expect(s.lists.verified.map((i) => i.id)).toEqual(ids("E1.K.verified"));
    expect(s.lists.rejected.map((i) => i.id)).toEqual(ids("E1.K.rejected"));

    const o = await loadQueue(await as("O"), world.events.E1.id, users.O.id, "lb");
    expect(o.role).toBeNull();
    expect(o.lists.pending).toEqual([]);
  });
});

describe("loadReview (JDG-02)", () => {
  const review = async (who: FixtureName, key: CatchKey) => loadReview(await as(who), catchOf(world, key).id, users[who].id, "lb");

  it("K reviews M's pending catch (02a): photos labelled, facts, the code word, the history", async () => {
    const data = await review("K", "E1.M.pending");

    expect(data.row).toBe("JDG-02a");
    expect(data.anglerName).toBe("Angler M");
    expect(data.eventName).toBe("E1 Spring Bass");
    expect(data.photos.map((p) => p.label)).toEqual(["1 · Holding the fish", "2 · On the scale"]);
    expect(data.photos[0]?.url).toMatch(/[?&]token=/);
    expect(data.photos[0]?.note).toMatch(/^Taken /);
    expect(data.codeWord).toEqual({ kind: "one", word: "OAK" });
    expect(data.photoToReceived).toMatch(/^\d+ (h|min)$/);
    expect(data.speciesChoices.map((c) => c.name)).toEqual(["Largemouth bass", "Smallmouth bass"]);
    expect(data.history.map((row) => [row.action, row.actor])).toEqual([["create", "Angler"]]);
  });

  it("names each other row: decided (02d), own (02f), outside the backup scope (02g), retracted (02e), final (02h)", async () => {
    expect((await review("K", "E1.M.verified")).row).toBe("JDG-02d");
    expect((await review("K", "E1.K.pending")).row).toBe("JDG-02f");
    expect((await review("S", "E1.M.pending")).row).toBe("JDG-02g");
    expect((await review("K", "E1.Y.retracted")).row).toBe("JDG-02e");
    expect((await review("K", "EF.N.verified")).row).toBe("JDG-02h");
    expect((await review("S", "E1.K.pending")).row).toBe("JDG-02a");
  });
});

// ---------------------------------------------------------------------------------------------
// These change the world.

async function freshPending(who: FixtureName = "M"): Promise<RecordModel> {
  const client = await as(who);
  const capturedAt = new Date(Date.now() - HOUR).toISOString();
  const body = new FormData();
  body.set("entry", entryOf(world, `E1.${who}`).id);
  body.set("species", world.species.largemouth.id);
  body.set("weight_hoz", "5500");
  body.set("client_uuid", randomUUID());
  body.set("captured_at", capturedAt);
  body.set("photo_captured_at", JSON.stringify([capturedAt, capturedAt]));
  for (const name of ["clean-1.jpg", "clean-2.jpg"]) body.append("photo", new File([await readFile(path.join(REPO_ROOT, "test", "fixtures", name))], name, { type: "image/jpeg" }));
  return client.collection("catches").create(body);
}

describe("decisions (judgeDecision.ts)", () => {
  it("builds each body with the loaded rev and only what it changes", () => {
    const base = { id: "c", rev: 3, speciesId: "s", weightHoz: 5500, lengthQ: 0, photoCount: 2, photoCapturedAt: [] };
    expect(decisionBody(base, { kind: "approve" })).toEqual({ rev: 3, status: "verified" });
    expect(decisionBody(base, { kind: "reject", reason: " Blurry " })).toEqual({ rev: 3, status: "rejected", reason: "Blurry" });
    expect(decisionBody(base, { kind: "correct", fields: { weight_hoz: 5400 }, reason: "Scale" })).toEqual({ rev: 3, weight_hoz: 5400, reason: "Scale" });
    expect(decisionBody(base, { kind: "rejudge", to: "rejected", reason: "Wrong fish" })).toEqual({ rev: 3, status: "rejected", reason: "Wrong fish" });
  });

  it("approves; the queue's Verified filter puts it first with its decided time", async () => {
    const record = await freshPending();
    const k = await as("K");
    expect(await sendDecision(k, catchBaseOf(record), "pending", { kind: "approve" })).toEqual({ kind: "saved" });

    const queue = await loadQueue(k, world.events.E1.id, users.K.id, "lb");
    expect(queue.lists.verified[0]?.id).toBe(record.id);
    expect(queue.lists.verified[0]?.decidedAt).toBeInstanceOf(Date);
  });

  it("a correction shows as Corrected in the Verified filter, and the review says the judge decided (02d)", async () => {
    const record = await freshPending();
    const k = await as("K");
    expect(await sendDecision(k, catchBaseOf(record), "pending", { kind: "correct", fields: { weight_hoz: 5400 }, reason: "Scale reads 3.38" })).toEqual({ kind: "saved" });

    expect((await loadQueue(k, world.events.E1.id, users.K.id, "lb")).lists.verified.find((i) => i.id === record.id)?.corrected).toBe(true);
    const data = await loadReview(k, record.id, users.K.id, "lb");
    expect(data.row).toBe("JDG-02d");
    expect(data.decision).toMatchObject({ by: "you", corrected: true });
  });

  it("JDG-02b: after the angler edits, the stale decision comes back as changed, with the catch as it is now", async () => {
    const record = await freshPending();
    await (await as("M")).collection("catches").update(record.id, { rev: 1, weight_hoz: 5488 });

    const result = await sendDecision(await as("K"), catchBaseOf(record), "pending", { kind: "approve" });
    expect(result).toMatchObject({ kind: "changed", reloaded: { rev: 2, weightHoz: 5488 } });
  });

  it("JDG-02c: a catch retracted meanwhile comes back as retracted", async () => {
    const record = await freshPending();
    await (await as("M")).collection("catches").update(record.id, { rev: 1, status: "retracted" });

    expect(await sendDecision(await as("K"), catchBaseOf(record), "pending", { kind: "reject", reason: "Blurry" })).toEqual({ kind: "retracted" });
  });

  it("JDG-02j: Retry finds a decision that already landed and sends nothing; one that didn't, it sends", async () => {
    const landed = await freshPending();
    const k = await as("K");
    await k.collection("catches").update(landed.id, { rev: 1, status: "rejected", reason: "Blurry" });
    expect(await retryDecision(k, catchBaseOf(landed), "pending", { kind: "reject", reason: "Blurry" }, users.K.id)).toEqual({ kind: "already-saved" });

    const fresh = await freshPending();
    expect(await retryDecision(k, catchBaseOf(fresh), "pending", { kind: "approve" }, users.K.id)).toEqual({ kind: "saved" });
    expect((await pocketbase().superuser.collection("catches").getOne(fresh.id)).status).toBe("verified");
  });

  it("a request that never reaches the server is NOT SENT", async () => {
    const record = await freshPending();
    const k = await as("K");
    k.beforeSend = (url, options) => ({ url: url.replace(/^http:\/\/[^/]+/, "http://127.0.0.1:9"), options });
    expect(await sendDecision(k, catchBaseOf(record), "pending", { kind: "approve" })).toEqual({ kind: "not-sent" });
  });
});

describe("entries (ORG-08, ORG-09)", () => {
  it("K lists every E1 entry, W's withdrawal with when, by whom and why; K first, then the backup judge", async () => {
    const data = await loadEntries(await as("K"), world.events.E1.id, users.K.id);

    expect(data.rows.map((row) => row.name)).toEqual(["Kayden", "Sam", "Angler M", "Angler W", "Angler Y"]);
    expect(data.rows[0]).toMatchObject({ isYou: true, role: "Judge", detail: "Judge · entered when created" });
    const w = data.rows.find((row) => row.name === "Angler W");
    expect(w).toMatchObject({ withdrawn: true, reason: "Not fishing this one", withdrawnBySelf: false });
    expect(w?.withdrawnLine).toBe("Withdrawn by you");
    expect(data.withdrawnCount).toBe(1);
  });

  it("K withdraws M only with a reason (R-ENT-U-07, U-08), reinstates W (U-09), and Retry finds a change already made", async () => {
    const k = await as("K");
    expect(await setEntryWithdrawn(k, entryOf(world, "E1.M").id, true, "")).toEqual({ kind: "not-accepted" });
    expect(await setEntryWithdrawn(k, entryOf(world, "E1.M").id, true, "Not a member this season")).toEqual({ kind: "saved" });
    expect(await retryEntryWithdrawn(k, entryOf(world, "E1.M").id, true, "Not a member this season")).toEqual({ kind: "already-saved" });
    expect(await setEntryWithdrawn(k, entryOf(world, "E1.W").id, false, "")).toEqual({ kind: "saved" });

    const rows = (await loadEntries(k, world.events.E1.id, users.K.id)).rows;
    expect(rows.find((row) => row.name === "Angler M")).toMatchObject({ withdrawn: true, reason: "Not a member this season" });
    expect(rows.find((row) => row.name === "Angler M")?.withdrawnLine).toMatch(/^Withdrawn [A-Z][a-z]{2}, .* by you$/);
    expect(rows.find((row) => row.name === "Angler W")?.withdrawn).toBe(false);
  });
});
