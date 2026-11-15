// My catches from the server (web/src/lib/loadMyCatches.ts), against a PocketBase booted from
// pb_migrations/ and pb_hooks/ with the fixture world. The world's hooks wrote one `create` row
// per catch; the judge's rows (reject, correct, approve) and a retract are added here by the
// superuser, since judging isn't built yet (S3).

import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { timelineEntries } from "../web/src/lib/catchTimeline";
import { loadLiveTournament, type LiveTournament } from "../web/src/lib/liveTournament";
import { actorOf, loadMyCatches, myCatchesPhase, type MyCatchesData } from "../web/src/lib/loadMyCatches";
import { myCatchState, myCatchesSubtitle } from "../web/src/lib/myCatches";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, seedWorld, type CatchKey, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

const SNAPSHOT_FIELDS = ["species", "weight_hoz", "length_q", "status", "reason", "photo", "photo_captured_at", "flags", "rev"];

function snapshot(record: RecordModel, changes: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, record[field]])), ...changes };
}

/** One audit row on a world catch, written by the superuser as a hook would. */
async function auditRow(key: CatchKey, action: string, actor: FixtureName, before: Record<string, unknown>, after: Record<string, unknown>) {
  const record = catchOf(world, key);
  return pocketbase()
    .superuser.collection("audit_log")
    .create({ actor: users[actor].id, action, event: world.events.E1.id, catch: record.id, target_id: record.id, before, after });
}

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);

  const rejected = catchOf(world, "E1.M.rejected");
  await auditRow("E1.M.rejected", "reject", "K", snapshot(rejected, { status: "pending", reason: "" }), snapshot(rejected));

  // K corrected M's catch from 0.10 lb heavier (160 hundredths of an ounce) and approved it.
  const verified = catchOf(world, "E1.M.verified");
  const entered = Number(verified.weight_hoz) + 160;
  await auditRow(
    "E1.M.verified",
    "correct",
    "K",
    snapshot(verified, { status: "pending", reason: "", weight_hoz: entered }),
    snapshot(verified, { reason: "Scale readout" }),
  );

  // S, the backup judge, approved K's catch.
  const kVerified = catchOf(world, "E1.K.verified");
  await auditRow("E1.K.verified", "approve", "S", snapshot(kVerified, { status: "pending" }), snapshot(kVerified));

  const retracted = catchOf(world, "E1.Y.retracted");
  await auditRow("E1.Y.retracted", "retract", "Y", snapshot(retracted, { status: "pending" }), snapshot(retracted));
});

async function load(who: FixtureName, units: "lb" | "lb_oz" = "lb"): Promise<{ tournament: LiveTournament; data: MyCatchesData }> {
  const pb = await actAs(pocketbase(), users[who]);
  const tournament = await loadLiveTournament(pb, users[who].id);
  if (!tournament) throw new Error("no live tournament");
  return { tournament, data: await loadMyCatches(pb, tournament, users[who].id, units, Date.now()) };
}

const byId = (data: MyCatchesData, key: CatchKey) => {
  const found = data.catches.find((c) => c.id === catchOf(world, key).id);
  if (!found) throw new Error(`${key} is not in the list`);
  return found;
};

describe("loadMyCatches", () => {
  it("lists M's own catches in E1, every status, newest first", async () => {
    const { tournament, data } = await load("M");

    expect(tournament.submit.eventId).toBe(world.events.E1.id);
    expect(data.catches.map((c) => c.id)).toEqual(["E1.M.rejected", "E1.M.verified", "E1.M.pending"].map((key) => catchOf(world, key as CatchKey).id));
    expect(data.catches.map((c) => c.status)).toEqual(["rejected", "verified", "pending"]);
    expect(data.context).toMatchObject({ eventName: "E1 Spring Bass", metric: "weight", bestN: 10, phase: "live:window", entry: "active" });
  });

  it("shapes each catch for the screens: species, measurement in the viewer's units, times, reason", async () => {
    const record = catchOf(world, "E1.M.pending");
    const lb = byId((await load("M")).data, "E1.M.pending");
    const lbOz = byId((await load("M", "lb_oz")).data, "E1.M.pending");

    expect(lb.species).toMatch(/^(Largemouth|Smallmouth) bass$/);
    expect(lb.measurement.unit).toBe("lb");
    expect(lbOz.measurement.unit).toBe("oz");
    expect(lb.created.toISOString()).toBe(new Date(String(record.created).replace(" ", "T")).toISOString());
    expect(lb.capturedAt?.toISOString()).toBe(new Date(String(record.captured_at).replace(" ", "T")).toISOString());
    expect(byId((await load("M")).data, "E1.M.rejected").reason).toBe("Readout not legible");
  });

  it("gives every photo a URL that loads with the file token, and the URL without it doesn't", async () => {
    const pending = byId((await load("M")).data, "E1.M.pending");

    expect(pending.photos).toHaveLength(2);
    for (const { url } of pending.photos) {
      const response = await fetch(new URL(String(url), pocketbase().url));
      expect(response.status, url).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
    }
    const bare = new URL(String(pending.photos[0]?.url), pocketbase().url);
    bare.searchParams.delete("token");
    expect((await fetch(bare)).status).toBe(404);
  });

  it("marks the verified catch in the best n from scoring, and the subtitle counts it", async () => {
    const { data } = await load("M");

    expect(byId(data, "E1.M.verified").inBest).toBe(true);
    expect(byId(data, "E1.M.pending").inBest).toBe(false);
    expect(myCatchesSubtitle(data.context, data.catches)).toBe("E1 Spring Bass · 3 catches · 1 counted");
  });

  it("reads the decision and the correction from the audit rows (MY-02f, MY-02g)", async () => {
    const { data } = await load("M");
    const verified = byId(data, "E1.M.verified");
    const rejected = byId(data, "E1.M.rejected");

    expect(verified.decision?.by).toBe("Judge");
    expect(verified.correction?.change).toMatch(/^Weight \d+\.\d\d → \d+\.\d\d lb$/);
    expect(myCatchState(verified, data.context).row).toBe("MY-02f");
    expect(rejected.decision?.by).toBe("Judge");
    expect(myCatchState(rejected, data.context).row).toBe("MY-02g");
    expect(myCatchState(byId(data, "E1.M.pending"), data.context)).toMatchObject({ row: "MY-02a", canEdit: true, canAddPhotos: true, canRetract: true });
  });

  it("gives each catch its history, the angler's own steps as You (MY-06a)", async () => {
    const { data } = await load("M");
    const rows = data.history[catchOf(world, "E1.M.verified").id] ?? [];

    expect(rows.map((row) => [row.action, row.actor])).toEqual([
      ["create", "You"],
      ["correct", "Judge"],
    ]);
    expect(rows[0]?.before).toBeNull();
    expect(timelineEntries(rows, "weight").map((entry) => entry.kind)).toEqual(["Corrected and approved", "Submitted"]);
    // No entry rows: M's own join row has no catch (R-AUD-L-03).
    expect(Object.values(data.history).flat().every((row) => row.action !== ("join" as string))).toBe(true);
  });

  it("labels the backup judge's decision on the judge's own catch", async () => {
    const { data } = await load("K");
    const verified = byId(data, "E1.K.verified");

    expect(verified.decision?.by).toBe("Backup judge");
    expect(data.history[verified.id]?.map((row) => row.actor)).toEqual(["You", "Backup judge"]);
  });

  it("shows Y's own retracted catch with the time it was retracted (MY-02h, R-AUD-L-09)", async () => {
    const { data } = await load("Y");
    const retracted = byId(data, "E1.Y.retracted");

    expect(retracted.retractedAt).toBeInstanceOf(Date);
    expect(myCatchState(retracted, data.context).row).toBe("MY-02h");
    expect(data.history[retracted.id]?.map((row) => row.action)).toEqual(["create", "retract"]);
  });

  it("shows W's catches on the entry the organizer withdrew, none counted (MY-02d)", async () => {
    const { data } = await load("W");

    expect(data.context.entry).toBe("withdrawn-by-K");
    expect(data.catches.map((c) => c.id).sort()).toEqual([catchOf(world, "E1.W.pending").id, catchOf(world, "E1.W.verified").id].sort());
    expect(data.catches.every((c) => !c.inBest)).toBe(true);
    expect(myCatchState(byId(data, "E1.W.pending"), data.context).row).toBe("MY-02d");
  });

  it("has nothing to show before joining", async () => {
    const { data } = await load("X");

    expect(data.context.entry).toBe("none");
    expect(data.catches).toEqual([]);
  });
});

describe("myCatchesPhase", () => {
  const at = (iso: string) => new Date(iso);
  const tournament = {
    startsAt: at("2027-07-01T12:00:00Z"),
    submit: { endsAt: at("2027-07-31T12:00:00Z"), submitDeadline: at("2027-08-01T12:00:00Z") },
  } as LiveTournament;

  it.each([
    ["2027-07-01T11:59:59Z", "live:pre"],
    ["2027-07-01T12:00:00Z", "live:window"],
    ["2027-07-31T12:00:00Z", "live:window"],
    ["2027-07-31T12:00:01Z", "live:late"],
    ["2027-08-01T12:00:00Z", "live:late"],
    ["2027-08-01T12:00:01Z", "live:over"],
  ])("at %s is %s", (now, phase) => {
    expect(myCatchesPhase(tournament, at(now).getTime())).toBe(phase);
  });
});

describe("actorOf", () => {
  const people = { me: "me", judge: "judge", backupJudge: "backup" };

  it("names the viewer, the judge and the backup judge, and everyone else Organizer", () => {
    expect(actorOf("me", people)).toBe("You");
    expect(actorOf("judge", people)).toBe("Judge");
    expect(actorOf("backup", people)).toBe("Backup judge");
    expect(actorOf("someone", people)).toBe("Organizer");
    expect(actorOf("", people)).toBe("Organizer");
  });

  it("names the viewer You even when they judge the event", () => {
    expect(actorOf("judge", { ...people, me: "judge" })).toBe("You");
  });
});
