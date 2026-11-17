// The leaderboard (features.json S2b; web/src/lib/leaderboard.ts): the board shaped from records in
// memory (scoring.md examples 1, 5, 11 and 16; who appears; roles; display units), then read
// against a PocketBase booted from pb_migrations/ and pb_hooks/ with the security.md fixture world
// (R-CAT-L-02, L-07, R-ENT-L-03, R-USR-U-01, U-06), and the realtime case R-CAT-L-09.
//
// The world's E1 catches weigh 4000 + 100 × their index in CATCH_KEYS: the verified ones are
// M 4,100, Y 4,400, K 4,800, S 5,000 and W 5,300 (W's entry is withdrawn). The tests that change
// the world (a rename, a rejection) run last.

import type { RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leaderboardFromRecords, leaderboardSubtitle, loadLeaderboard, shortSpecies, weekOf, type LeaderboardData } from "../web/src/lib/leaderboard";
import type { DisplayUnits } from "../web/src/lib/profile";
import { usePocketBase } from "./harness/pocketbase";
import { openRealtime, type RealtimeClient } from "./harness/realtime";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type EventKey, type World } from "./harness/world";

const pocketbase = usePocketBase();

// ---------------------------------------------------------------------------------------------
// From records in memory.

const DAY = 24 * 3600_000;
const STARTS = Date.parse("2027-07-04T10:00:00Z");

/** Decimal pounds as stored: hundredths of an ounce (scoring.md §4). */
const hoz = (lb: number) => Math.round(lb * 1600);

const LARGEMOUTH = { id: "sp-l", name: "largemouth bass" };
const SMALLMOUTH = { id: "sp-s", name: "smallmouth bass" };

function event(overrides: Record<string, unknown> = {}): RecordModel {
  return {
    id: "ev1",
    collectionId: "events",
    collectionName: "events",
    name: "Summer Bass 2027",
    status: "live",
    metric: "weight",
    best_n: 10,
    starts_at: new Date(STARTS).toISOString().replace("T", " "),
    ends_at: new Date(STARTS + 42 * DAY).toISOString().replace("T", " "),
    judge: "u-judge",
    backup_judge: "u-backup",
    ...overrides,
  };
}

function entry(id: string, angler: string, displayName: string, withdrawn = false): RecordModel {
  return { id, collectionId: "entries", collectionName: "entries", angler, display_name: displayName, withdrawn };
}

let catchSeq = 0;
function fish(entryId: string, lb: number, status = "verified", species = LARGEMOUTH): RecordModel {
  catchSeq++;
  return {
    id: `c${String(catchSeq).padStart(3, "0")}`,
    collectionId: "catches",
    collectionName: "catches",
    entry: entryId,
    status,
    weight_hoz: hoz(lb),
    length_q: 0,
    species: species.id,
    expand: { species: { ...species, collectionId: "species", collectionName: "species" } },
  };
}

function board(entries: RecordModel[], catches: RecordModel[], units: DisplayUnits = "lb", viewerId = "u-viewer", ev = event()): LeaderboardData {
  return leaderboardFromRecords({ event: ev, entries, catches, viewerId, units, nowMs: STARTS + 15 * DAY });
}

// scoring.md example 1: A's 12 fish.
const EXAMPLE_1 = [2.1, 3.45, 1.2, 4.02, 2.88, 1.75, 3.1, 2.4, 0.95, 1.6, 2.05, 3.8];

describe("leaderboardFromRecords", () => {
  it("shows total, counted fish, biggest fish with its species and pending count (scoring.md examples 1 and 3)", () => {
    const data = board(
      [entry("A", "u-a", "Angler A")],
      [...EXAMPLE_1.map((lb, i) => fish("A", lb, "verified", i === 3 ? SMALLMOUTH : LARGEMOUTH)), fish("A", 6, "pending")],
    );

    expect(data.view.rows).toEqual([
      {
        entryId: "A",
        place: 1,
        tied: false,
        displayName: "Angler A",
        isViewer: false,
        total: "27.15",
        counted: 10,
        biggest: { size: "4.02", species: "Smallmouth" },
        pending: 1,
      },
    ]);
    expect(data.view.unit).toBe("lb");
    expect(data.view.bestN).toBe(10);
  });

  it("shows A's total as 27 lb 2.4 oz in pounds and ounces, with every score and ranking unchanged (scoring.md example 16, R-USR-U-01)", () => {
    const entries = [entry("A", "u-a", "Angler A"), entry("B", "u-b", "Angler B")];
    const catches = [...EXAMPLE_1.map((lb) => fish("A", lb)), ...[5.1, 4.8, 3.95, 2.2].map((lb) => fish("B", lb))];

    const lb = board(entries, catches, "lb");
    const oz = board(entries, catches, "lb_oz");

    expect(lb.view.rows.map((row) => [row.entryId, row.place, row.total])).toEqual([
      ["A", 1, "27.15"],
      ["B", 2, "16.05"],
    ]);
    expect(oz.view.unit).toBe("oz");
    expect(oz.view.rows.map((row) => [row.entryId, row.place, row.total])).toEqual([
      ["A", 1, "27 lb 2.4"],
      ["B", 2, "16 lb 0.8"],
    ]);
    // Only the words differ: places, counts and order are the same.
    const shape = (data: LeaderboardData) => data.view.rows.map(({ entryId, place, tied, counted, pending }) => ({ entryId, place, tied, counted, pending }));
    expect(shape(oz)).toEqual(shape(lb));
  });

  it("shows example 5's readings as 3.44, 3.43, 2.97 and as 3 lb 7.0 oz, 3 lb 6.9 oz, 2 lb 15.5 oz, in the stored order (scoring.md example 5)", () => {
    const entries = [entry("P", "u-p", "P"), entry("Q", "u-q", "Q"), entry("R", "u-r", "R")];
    const stored = (entryId: string, weightHoz: number) => ({ ...fish(entryId, 0), weight_hoz: weightHoz });
    const catches = [stored("P", 5500), stored("Q", 5488), stored("R", 4750)];

    expect(board(entries, catches, "lb").view.rows.map((row) => [row.entryId, row.biggest?.size])).toEqual([
      ["P", "3.44"],
      ["Q", "3.43"],
      ["R", "2.97"],
    ]);
    expect(board(entries, catches, "lb_oz").view.rows.map((row) => [row.entryId, row.biggest?.size])).toEqual([
      ["P", "3 lb 7.0"],
      ["Q", "3 lb 6.9"],
      ["R", "2 lb 15.5"],
    ]);
  });

  it("marks shared places and skips the next one (scoring.md example 11)", () => {
    const entries = ["K", "I", "J", "L"].map((id) => entry(id, `u-${id}`, id));
    const catches = [fish("K", 9), fish("I", 3), fish("I", 2), fish("J", 2), fish("J", 3), fish("L", 4)];

    expect(board(entries, catches).view.rows.map((row) => [row.entryId, row.place, row.tied])).toEqual([
      ["K", 1, false],
      ["I", 2, true],
      ["J", 2, true],
      ["L", 4, false],
    ]);
  });

  it("lists only anglers with a pending or verified catch on a non-withdrawn entry (R-CAT-L-02, L-07, R-ENT-L-03)", () => {
    const entries = [
      entry("A", "u-a", "Verified only"),
      entry("B", "u-b", "Pending only"),
      entry("C", "u-c", "Rejected only"),
      entry("D", "u-d", "Retracted only"),
      entry("W", "u-w", "Withdrawn", true),
      entry("E", "u-e", "No catches"),
    ];
    const catches = [fish("A", 2), fish("B", 3, "pending"), fish("C", 4, "rejected"), fish("D", 5, "retracted"), fish("W", 6), fish("W", 1, "pending")];

    const data = board(entries, catches);

    expect(data.view.rows.map((row) => [row.displayName, row.place, row.total, row.counted, row.biggest, row.pending])).toEqual([
      ["Verified only", 1, "2.00", 1, { size: "2.00", species: "Largemouth" }, 0],
      ["Pending only", 2, "0.00", 0, null, 1],
    ]);
  });

  it("tags the judge and backup judge, marks the viewer's row and gives it to Your place", () => {
    const entries = [entry("J", "u-judge", "Kayden"), entry("S", "u-backup", "Sam"), entry("V", "u-viewer", "Me")];
    const data = board(entries, [fish("J", 3), fish("S", 2), fish("V", 1)]);

    expect(data.view.rows.map((row) => [row.displayName, row.role, row.isViewer])).toEqual([
      ["Kayden", "Judge", false],
      ["Sam", "Backup judge", false],
      ["Me", undefined, true],
    ]);
    expect(data.view.you?.entryId).toBe("V");
  });

  it("has no Your place for a withdrawn viewer, and counts the viewer's own catches for the tournament page (LB-01e, EVT-02d)", () => {
    const entries = [entry("A", "u-a", "A"), entry("V", "u-viewer", "Me", true)];
    const catches = [fish("A", 2), fish("V", 5), fish("V", 1, "pending"), fish("V", 1, "rejected"), fish("V", 1, "retracted")];

    const data = board(entries, catches);

    expect(data.view.you).toBeNull();
    expect(data.view.rows.map((row) => row.entryId)).toEqual(["A"]);
    expect(data.mine).toEqual({ submitted: 4, pending: 1, rejected: 1 });
  });

  it("shows a length tournament in inches and quarters", () => {
    const ev = event({ metric: "length" });
    const lengthFish = (entryId: string, q: number) => ({ ...fish(entryId, 0), weight_hoz: 0, length_q: q });
    const data = board([entry("A", "u-a", "A")], [lengthFish("A", 70), lengthFish("A", 59)], "lb_oz", "u-viewer", ev);

    expect(data.metric).toBe("length");
    expect(data.view.unit).toBe("in");
    expect(data.view.rows[0]).toMatchObject({ total: "32 1/4", biggest: { size: "17 1/2" } });
    expect(data.view.subtitle).toBe("Length · best 10 · Week 3 of 6 · 1 angler");
  });

  it("passes the event's status through, for the badge (Gap 25)", () => {
    expect(board([], [], "lb", "u", event({ status: "final" })).status).toBe("final");
    expect(board([], [], "lb", "u", event({ status: "closed" })).status).toBe("closed");
    expect(board([], [], "lb", "u", event()).status).toBe("live");
  });
});

describe("subtitle", () => {
  it("counts the week inside the fishing window only", () => {
    const start = new Date(STARTS);
    const end = new Date(STARTS + 42 * DAY);
    expect(weekOf(start, end, STARTS - 1)).toBeNull();
    expect(weekOf(start, end, STARTS)).toBe("Week 1 of 6");
    expect(weekOf(start, end, STARTS + 7 * DAY - 1)).toBe("Week 1 of 6");
    expect(weekOf(start, end, STARTS + 7 * DAY)).toBe("Week 2 of 6");
    expect(weekOf(start, end, STARTS + 42 * DAY)).toBe("Week 6 of 6");
    expect(weekOf(start, end, STARTS + 42 * DAY + 1)).toBeNull();
    // A window that isn't whole weeks rounds up.
    expect(weekOf(start, new Date(STARTS + 40 * DAY), STARTS + 39 * DAY)).toBe("Week 6 of 6");
  });

  it("reads as the Figma frame does", () => {
    expect(leaderboardSubtitle("weight", 10, "Week 3 of 6", 14)).toBe("Weight · best 10 · Week 3 of 6 · 14 anglers");
    expect(leaderboardSubtitle("weight", 10, null, 0)).toBe("Weight · best 10 · 0 anglers");
    expect(shortSpecies("largemouth bass")).toBe("Largemouth");
    expect(shortSpecies("walleye")).toBe("Walleye");
  });
});

// ---------------------------------------------------------------------------------------------
// Against the fixture world.

let users: FixtureUsers;
let world: World;
const open: RealtimeClient[] = [];

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

afterAll(() => {
  for (const client of open.splice(0)) client.close();
});

async function read(who: FixtureName, key: EventKey = "E1", units: DisplayUnits = "lb"): Promise<LeaderboardData> {
  return loadLeaderboard(await actAs(pocketbase(), users[who]), world.events[key].id, users[who].id, units, Date.now());
}

/** E1's board as every viewer should see it. */
const E1_ROWS = [
  { displayName: "Sam", role: "Backup judge", place: 1, total: "3.13", counted: 1, biggest: { size: "3.13", species: "Largemouth" }, pending: 0 },
  { displayName: "Kayden", role: "Judge", place: 2, total: "3.00", counted: 1, biggest: { size: "3.00", species: "Largemouth" }, pending: 1 },
  { displayName: "Angler Y", place: 3, total: "2.75", counted: 1, biggest: { size: "2.75", species: "Largemouth" }, pending: 1 },
  { displayName: "Angler M", place: 4, total: "2.56", counted: 1, biggest: { size: "2.56", species: "Smallmouth" }, pending: 1 },
];

const shown = (data: LeaderboardData) =>
  data.view.rows.map(({ displayName, role, place, total, counted, biggest, pending }) => ({ displayName, ...(role && { role }), place, total, counted, biggest, pending }));

describe("loadLeaderboard", () => {
  it("gives M E1's board: pending and verified catches on non-withdrawn entries, W absent (R-CAT-L-02, L-07, R-ENT-L-03)", async () => {
    const data = await read("M");

    expect(data.eventId).toBe(world.events.E1.id);
    expect(data.status).toBe("live");
    expect(data.view.name).toBe("E1 Spring Bass");
    expect(data.view.subtitle).toBe("Weight · best 10 · Week 2 of 6 · 4 anglers");
    expect(shown(data)).toEqual(E1_ROWS);
    expect(data.view.rows.filter((row) => row.isViewer).map((row) => row.displayName)).toEqual(["Angler M"]);
    expect(data.view.you?.entryId).toBe(entryOf(world, "E1.M").id);
    expect(data.mine).toEqual({ submitted: 3, pending: 1, rejected: 1 });
  });

  it("gives K, who can read rejected, retracted and withdrawn records, the same board", async () => {
    const data = await read("K");

    expect(shown(data)).toEqual(E1_ROWS);
    expect(data.view.you?.displayName).toBe("Kayden");
  });

  it("gives W, whose entry is withdrawn, the same board without a place (LB-01e)", async () => {
    const data = await read("W");

    expect(shown(data)).toEqual(E1_ROWS);
    expect(data.view.you).toBeNull();
    expect(data.mine).toEqual({ submitted: 2, pending: 1, rejected: 0 });
  });

  it("shows the board in pounds and ounces for a member who chose them, with the same places (R-USR-U-01)", async () => {
    const lb = await read("M", "E1", "lb");
    const oz = await read("M", "E1", "lb_oz");

    expect(oz.view.unit).toBe("oz");
    expect(oz.view.rows.map((row) => row.total)).toEqual(["3 lb 2.0", "3 lb 0.0", "2 lb 12.0", "2 lb 9.0"]);
    expect(oz.view.rows.map((row) => [row.entryId, row.place])).toEqual(lb.view.rows.map((row) => [row.entryId, row.place]));
  });

  it("reads a length tournament and a final one", async () => {
    const length = await read("N", "EL");
    expect(length.metric).toBe("length");
    expect(length.view.unit).toBe("in");
    expect(length.view.rows.map((row) => row.displayName)).toEqual(["Angler N", "Kayden"]);

    const final = await read("N", "EF");
    expect(final.status).toBe("final");
    expect(final.view.rows.map((row) => row.displayName).sort()).toEqual(["Angler N", "Kayden"]);
  });
});

// These change the world, so they run last.
describe("the board as the world changes", () => {
  it("follows a rename in live and closed tournaments, not in a final one (R-USR-U-06)", async () => {
    const n = await actAs(pocketbase(), users.N);
    await n.collection("users").update(users.N.id, { name: "Nadia" });

    const names = async (key: EventKey) => (await read("N", key)).view.rows.map((row) => row.displayName).sort();
    expect(await names("E2")).toEqual(["Kayden", "Nadia"]);
    expect(await names("EC")).toEqual(["Kayden", "Nadia"]);
    expect(await names("EF")).toEqual(["Angler N", "Kayden"]);
  });

  it("sends M no event when another angler's catch is rejected, while K, who may read it, gets one; the next read drops it (R-CAT-L-09)", async () => {
    const m = await openRealtime(pocketbase().url);
    const k = await openRealtime(pocketbase().url);
    open.push(m, k);
    await m.subscribe(["catches/*"], (await actAs(pocketbase(), users.M)).authStore.token);
    await k.subscribe(["catches/*"], (await actAs(pocketbase(), users.K)).authStore.token);

    // The superuser stands in for K's reject until judging is built (S3).
    const yPending = catchOf(world, "E1.Y.pending");
    await pocketbase().superuser.collection("catches").update(yPending.id, { status: "rejected", reason: "Readout not legible" });

    const event = await k.next("catches/*", 3_000);
    expect(JSON.parse(event.data)).toMatchObject({ action: "update", record: { id: yPending.id, status: "rejected" } });
    // Every client was sent its events in the same pass; give M a moment anyway.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(m.events().map((e) => e.name)).toEqual(["PB_CONNECT"]);

    // Which is why every heartbeat refetches: the next read leaves Y's catch out.
    const y = (await read("M")).view.rows.find((row) => row.displayName === "Angler Y");
    expect(y?.pending).toBe(0);
  });
});
