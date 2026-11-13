// web/src/lib/liveBoard.ts: what the bare live page (M0-03, /#live) loads, run as members
// against the security.md fixture world, and the formatting it does on its own.

import { beforeAll, describe, expect, it } from "vitest";
import { buildBoard, fetchLiveBoard, lengthText, parsePbDate, statusWord, weightText } from "../web/src/lib/liveBoard";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName } from "./harness/users";
import { CATCH_KEYS, catchOf, parseCatchKey, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let world: World;

beforeAll(async () => {
  world = await seedWorld(pocketbase(), await createFixtureUsers(pocketbase()));
});

/** The world's catch ids that a viewer should see on the page, per live event. */
function expectedRows(keep: (angler: FixtureName) => boolean): Record<string, string[]> {
  const rows: Record<string, string[]> = {};
  for (const key of CATCH_KEYS) {
    const { event, angler, status } = parseCatchKey(key);
    if (!["E1", "E2", "EL"].includes(event) || (status !== "pending" && status !== "verified") || !keep(angler)) continue;
    (rows[world.events[event].id] ??= []).push(catchOf(world, key).id);
  }
  for (const ids of Object.values(rows)) ids.sort();
  return rows;
}

describe("fetchLiveBoard", () => {
  it("gives M each live tournament, in start then name order, with its pending and verified catches on non-withdrawn entries", async () => {
    const board = await fetchLiveBoard(await actAs(pocketbase(), world.users.M));
    const { E1, E2, EL } = world.events;

    expect(board.events.map((event) => event.id)).toEqual([E1.id, E2.id, EL.id]);
    expect(board.events.map((event) => event.status)).toEqual(["live", "live", "live"]);
    const shown = Object.fromEntries(board.events.map((event) => [event.id, event.rows.map((row) => row.id).sort()]));
    expect(shown).toEqual(expectedRows((angler) => angler !== "W"));
  });

  it("names each catch's angler and species, and newest comes first", async () => {
    const board = await fetchLiveBoard(await actAs(pocketbase(), world.users.M));
    const e1 = board.events[0];
    const mine = e1?.rows.find((row) => row.id === catchOf(world, "E1.M.pending").id);

    expect(mine).toMatchObject({ angler: "Angler M", status: "Pending" });
    expect(["largemouth bass", "smallmouth bass"]).toContain(mine?.species);
    expect(mine?.measurement).toMatch(/^\d+\.\d\d lb$/);
    expect(mine?.submitted).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M$/);
    for (const event of board.events) {
      const times = event.rows.map((row) => row.createdMs);
      expect(times).toEqual([...times].sort((a, b) => b - a));
      for (const row of event.rows) expect(row.angler).not.toBe("—");
      for (const row of event.rows) expect(row.species).not.toBe("—");
    }
    // A length tournament shows inches.
    expect(board.events[2]?.rows[0]?.measurement).toMatch(/ in$/);
  });

  it("shows W their own catches on the withdrawn entry, as the rules return them", async () => {
    const board = await fetchLiveBoard(await actAs(pocketbase(), world.users.W));
    const shown = Object.fromEntries(board.events.map((event) => [event.id, event.rows.map((row) => row.id).sort()]));

    expect(shown).toEqual(expectedRows(() => true));
  });
});

describe("live page formatting", () => {
  it("shows weights in decimal pounds to 0.01 lb (scoring.md §4)", () => {
    expect(weightText(5500)).toBe("3.44 lb"); // 3 lb 7 oz
    expect(weightText(43440)).toBe("27.15 lb"); // scoring.md example 16's total
    expect(weightText(1600)).toBe("1.00 lb");
    expect(weightText(64)).toBe("0.04 lb");
  });

  it("shows lengths in quarter inches (scoring.md example 6)", () => {
    expect(lengthText(70)).toBe("17 1/2 in");
    expect(lengthText(59)).toBe("14 3/4 in");
    expect(lengthText(68)).toBe("17 in");
    expect(lengthText(1)).toBe("1/4 in");
  });

  it("uses the status words, never the badge's", () => {
    expect(["draft", "live", "closed", "final"].map(statusWord)).toEqual(["Draft", "Live", "Closed", "Final"]);
  });

  it("reads PocketBase's date format", () => {
    expect(parsePbDate("2026-07-11 13:05:00.000Z").toISOString()).toBe("2026-07-11T13:05:00.000Z");
  });

  it("has no sections when no tournament is live", () => {
    expect(buildBoard([], [])).toEqual({ events: [] });
  });
});
