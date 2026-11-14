// The app's real sender and live-tournament reads (web/src/lib/sendCatch.ts, liveTournament.ts),
// against a PocketBase booted from pb_migrations/ and pb_hooks/ with the fixture world. The photo
// preparation is a pass-through here: the canvas re-encode is a DOM module, checked in a browser.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PocketBase, { ClientResponseError } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatchDraft } from "../web/src/lib/catchSender";
import { canJoin, canSubmit, joinTournament, livePhase, loadLiveTournament, rulesLine, type LiveTournament } from "../web/src/lib/liveTournament";
import { catchBody, createCatchSender, failureKind, type PreparedPhoto } from "../web/src/lib/sendCatch";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, newUser, type FixtureName, type FixtureUsers } from "./harness/users";
import { entryOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();
const HOUR = 3600_000;

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

async function photo(name: "clean-1.jpg" | "clean-2.jpg"): Promise<File> {
  return new File([await readFile(path.join(REPO_ROOT, "test", "fixtures", name))], name, { type: "image/jpeg" });
}

async function draft(overrides: Partial<CatchDraft> = {}): Promise<CatchDraft> {
  return {
    clientUuid: randomUUID(),
    eventId: world.events.E1.id,
    species: { id: world.species.largemouth.id, name: "Largemouth bass" },
    weightHoz: 5500,
    photos: [
      { file: await photo("clean-1.jpg"), previewUrl: "" },
      { file: await photo("clean-2.jpg"), previewUrl: "" },
    ],
    enteredMeasurement: "3 lb 7 oz",
    ...overrides,
  };
}

const capturedAt = new Date(Date.now() - HOUR);
const passThrough = async (file: File): Promise<PreparedPhoto> => ({ file, capturedAt });

function sender(pb: PocketBase, entryId: string, units: "lb" | "lb_oz" = "lb", prepare = passThrough) {
  return createCatchSender({ pb, entryId, metric: "weight", units, prepare });
}

const noProgress = () => {};

async function catchesWithUuid(uuid: string) {
  const { superuser } = pocketbase();
  return superuser.collection("catches").getFullList({ filter: superuser.filter("client_uuid = {:uuid}", { uuid }) });
}

describe("createCatchSender", () => {
  it("R-CAT-C-01: sends M's catch; Received, in decimal pounds, with the server's species name and receive time", async () => {
    const before = Date.now();
    const result = await sender(await as("M"), entryOf(world, "E1.M").id)(await draft(), noProgress);

    expect(result.kind).toBe("received");
    if (result.kind !== "received") return;
    expect(result.catch).toMatchObject({ species: "Largemouth bass", measurement: { value: "3.44", unit: "lb" }, photoCount: 2 });
    expect(result.catch.created.getTime()).toBeGreaterThanOrEqual(before - 5000);
    const stored = await pocketbase().superuser.collection("catches").getOne(result.catch.id);
    expect(stored).toMatchObject({ status: "pending", rev: 1, weight_hoz: 5500, flags: [] });
    expect(new Date(String(stored.captured_at).replace(" ", "T")).getTime()).toBe(capturedAt.getTime());
  });

  it("shows the stored weight in pounds and ounces when that is the member's setting (scoring.md example 5)", async () => {
    const result = await sender(await as("M"), entryOf(world, "E1.M").id, "lb_oz")(await draft(), noProgress);

    expect(result.kind === "received" && result.catch.measurement).toEqual({ value: "3 lb 7.0", unit: "oz" });
  });

  it("reports progress photo by photo", async () => {
    const seen: number[] = [];
    await sender(await as("M"), entryOf(world, "E1.M").id)(await draft(), (progress) => seen.push(progress.photo));

    expect(seen).toEqual([1, 2]);
  });

  it("R-CAT-C-10: a resend of the same draft answers already-received and leaves one record", async () => {
    const send = sender(await as("M"), entryOf(world, "E1.M").id);
    const one = await draft();

    const first = await send(one, noProgress);
    const again = await send(one, noProgress);

    expect(first.kind).toBe("received");
    expect(again.kind).toBe("already-received");
    expect(await catchesWithUuid(one.clientUuid)).toHaveLength(1);
  });

  it("decisions.md 'No reply': the first attempt landed but its reply was lost; the retry finds it", async () => {
    const client = await as("M");
    const one = await draft();
    const entryId = entryOf(world, "E1.M").id;
    // The first attempt, as the server saw it.
    await client.collection("catches").create(catchBody(one, entryId, "weight", one.photos.map((p) => ({ file: p.file, capturedAt }))));

    const retry = await sender(client, entryId)(one, noProgress);

    expect(retry.kind).toBe("already-received");
    expect(await catchesWithUuid(one.clientUuid)).toHaveLength(1);
  });

  it("R-CAT-C-14: W's withdrawn entry is refused: not-accepted (SUB-02e), and nothing is stored", async () => {
    const one = await draft();
    const result = await sender(await as("W"), entryOf(world, "E1.W").id)(one, noProgress);

    expect(result.kind).toBe("not-accepted");
    expect(await catchesWithUuid(one.clientUuid)).toEqual([]);
  });

  it("no reply at all (server unreachable) is not-sent (SUB-02c), so Retry is offered", async () => {
    const offline = new PocketBase("http://127.0.0.1:9");
    offline.autoCancellation(false);

    expect((await sender(offline, "x")(await draft(), noProgress)).kind).toBe("not-sent");
  });

  it("a photo the browser can't decode is not-accepted, and nothing is stored", async () => {
    const one = await draft();
    const broken = async (): Promise<PreparedPhoto> => {
      throw new Error("decode");
    };

    expect((await sender(await as("M"), entryOf(world, "E1.M").id, "lb", broken)(one, noProgress)).kind).toBe("not-accepted");
    expect(await catchesWithUuid(one.clientUuid)).toEqual([]);
  });

  it("sends no capture time when the photos have none; the server flags no_capture_time and, for photo 2, extra_photo_no_time", async () => {
    const none = async (file: File): Promise<PreparedPhoto> => ({ file, capturedAt: null });
    const result = await sender(await as("M"), entryOf(world, "E1.M").id, "lb", none)(await draft(), noProgress);

    expect(result.kind).toBe("received");
    const stored = await pocketbase().superuser.collection("catches").getOne(result.kind === "received" ? result.catch.id : "");
    expect(stored.flags).toEqual(["no_capture_time", "extra_photo_no_time"]);
  });
});

describe("failureKind", () => {
  const error = (status: number) => new ClientResponseError({ status, response: {} });

  it.each([
    [0, "not-sent"],
    [408, "not-sent"],
    [429, "not-sent"],
    [500, "not-sent"],
    [503, "not-sent"],
    [400, "not-accepted"],
    [403, "not-accepted"],
    [404, "not-accepted"],
  ])("status %i is %s", (status, kind) => {
    expect(failureKind(error(status))).toBe(kind);
  });

  it("anything that isn't a PocketBase response is not-sent", () => {
    expect(failureKind(new TypeError("fetch failed"))).toBe("not-sent");
  });
});

describe("loadLiveTournament and joinTournament", () => {
  it("M sees E1, the first live event by start time, with their active entry", async () => {
    const live = await loadLiveTournament(await as("M"), users.M.id);

    expect(live?.submit).toMatchObject({ eventId: world.events.E1.id, name: "E1 Spring Bass", metric: "weight", codeWord: "OAK" });
    expect(live?.submit.species.map((s) => s.name)).toEqual(["Largemouth bass", "Smallmouth bass"]);
    expect(live?.rulesLine).toBe("Weight · best 10 · Largemouth and smallmouth");
    expect(live?.entry).toEqual({ kind: "active", id: entryOf(world, "E1.M").id });
  });

  it("W sees their entry withdrawn by the organizer, with the reason (EVT-02j)", async () => {
    const live = await loadLiveTournament(await as("W"), users.W.id);

    expect(live?.entry).toEqual({ kind: "withdrawn", id: entryOf(world, "E1.W").id, bySelf: false, reason: "Not fishing this one" });
  });

  it("R-ENT-C-01: a new member has no entry, joins, and then has an active one", async () => {
    const user = await pocketbase().superuser.collection("users").create(newUser({ name: "New Joiner", emailVisibility: false, verified: true }));
    const client = await actAs(pocketbase(), user);

    const before = await loadLiveTournament(client, user.id);
    expect(before?.entry).toEqual({ kind: "none" });

    const joined = await joinTournament(client, world.events.E1.id, user.id);
    expect(joined.kind).toBe("joined");

    const after = await loadLiveTournament(client, user.id);
    expect(after?.entry).toEqual({ kind: "active", id: joined.kind === "joined" ? joined.id : "" });
  });

  it("R-ENT-C-03: joining twice is not-accepted", async () => {
    expect((await joinTournament(await as("M"), world.events.E1.id, users.M.id)).kind).toBe("not-accepted");
  });
});

describe("tournament rules (pure)", () => {
  const at = (ms: number) => new Date(ms);
  const base = (entry: LiveTournament["entry"]): LiveTournament => ({
    submit: { eventId: "e", name: "E", metric: "weight", endsAt: at(2000), submitDeadline: at(3000), codeWord: null, species: [] },
    startsAt: at(1000),
    bestN: 10,
    rulesLine: "",
    entry,
  });

  it("phases: before starts_at is pre, up to submit_deadline is window, after is over", () => {
    expect(livePhase(base({ kind: "none" }), 999)).toBe("pre");
    expect(livePhase(base({ kind: "none" }), 1000)).toBe("window");
    expect(livePhase(base({ kind: "none" }), 3000)).toBe("window");
    expect(livePhase(base({ kind: "none" }), 3001)).toBe("over");
  });

  it("joining: open with no entry until the deadline (R-ENT-C-05); never with an entry (R-ENT-C-03)", () => {
    expect(canJoin(base({ kind: "none" }), 500)).toBe(true);
    expect(canJoin(base({ kind: "none" }), 3001)).toBe(false);
    expect(canJoin(base({ kind: "active", id: "x" }), 1500)).toBe(false);
  });

  it("submitting: only an active entry inside the window (R-CAT-C-06, C-07, C-14)", () => {
    expect(canSubmit(base({ kind: "active", id: "x" }), 1500)).toBe(true);
    expect(canSubmit(base({ kind: "active", id: "x" }), 999)).toBe(false);
    expect(canSubmit(base({ kind: "active", id: "x" }), 3001)).toBe(false);
    expect(canSubmit(base({ kind: "withdrawn", id: "x", bySelf: true, reason: "" }), 1500)).toBe(false);
    expect(canSubmit(base({ kind: "none" }), 1500)).toBe(false);
  });

  it("the rules line lists species the way the Figma frame does", () => {
    expect(rulesLine("weight", 10, ["largemouth bass", "smallmouth bass"])).toBe("Weight · best 10 · Largemouth and smallmouth");
    expect(rulesLine("length", 5, ["walleye"])).toBe("Length · best 5 · Walleye");
  });
});
