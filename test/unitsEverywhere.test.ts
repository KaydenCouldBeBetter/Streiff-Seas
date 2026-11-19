// Display units reach every view (Kayden, decisions.md 2026-11-18; R-USR-U-01): the member saves
// them on Profile as the screen does (saveProfile), and every loader a screen reads through then
// shows weights that way: the leaderboard, the tournament list, My catches with each catch's
// history, an angler's page, the judge's home, queue and review. Against a PocketBase booted from
// pb_migrations/ and pb_hooks/ with the fixture world. Also draftAfterSave, Profile's form after
// a save (units save as soon as they're chosen).

import { beforeAll, describe, expect, it } from "vitest";
import { loadLeaderboard } from "../web/src/lib/leaderboard";
import { loadTournament } from "../web/src/lib/liveTournament";
import { loadMyCatches } from "../web/src/lib/loadMyCatches";
import { loadAnglerCatches } from "../web/src/lib/loadAnglerCatches";
import { loadJudging, loadQueue } from "../web/src/lib/judging";
import { loadReview } from "../web/src/lib/judgeReview";
import { loadTournaments } from "../web/src/lib/tournaments";
import { draftAfterSave, saveProfile, unitsOf, type DisplayUnits } from "../web/src/lib/profile";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureUsers } from "./harness/users";
import { catchOf, entryOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

/**
 * Every weight a loader returned, wherever it sits: a { value, unit } pair, or text such as the
 * queue's "3 lb 7.0 oz · Smallmouth" ("oz") or "3.44 lb · Smallmouth" ("lb").
 */
function weightUnits(data: unknown): string[] {
  const found: string[] = [];
  JSON.stringify(data, (key, value) => {
    if (key === "unit" && (value === "lb" || value === "oz")) found.push(value);
    else if (typeof value === "string") {
      for (const _ of value.matchAll(/\b\d+ lb \d+\.\d oz\b/g)) found.push("oz");
      for (const _ of value.matchAll(/\b\d+\.\d\d lb\b/g)) found.push("lb");
    }
    return value;
  });
  return found;
}

/** K (organizer, E1's judge, angler in E1) saves the units on Profile, then reads every view. */
async function everyView(units: DisplayUnits) {
  const pb = await actAs(pocketbase(), users.K);
  const saved = await saveProfile(pb, users.K.id, { display_units: units });
  expect(saved.kind).toBe("saved");
  const shown = unitsOf(saved.kind === "saved" ? saved.user : {});
  expect(shown).toBe(units);

  const e1 = world.events.E1.id;
  const tournament = await loadTournament(pb, users.K.id, e1);
  expect(tournament).not.toBeNull();
  const now = Date.now();
  return {
    leaderboard: await loadLeaderboard(pb, e1, users.K.id, shown, now),
    tournaments: await loadTournaments(pb, users.K.id, shown),
    myCatches: await loadMyCatches(pb, tournament!, users.K.id, shown, now),
    anglerPage: await loadAnglerCatches(pb, entryOf(world, "E1.M").id, users.K.id, shown),
    judging: await loadJudging(pb, users.K.id, shown),
    queue: await loadQueue(pb, e1, users.K.id, shown),
    review: await loadReview(pb, catchOf(world, "E1.M.pending").id, users.K.id, shown),
  };
}

describe("display units reach every view", () => {
  for (const [units, unit, other] of [
    ["lb_oz", "oz", "lb"],
    ["lb", "lb", "oz"],
  ] as const) {
    it(`after saving ${units} on Profile, every weight shows in ${unit === "oz" ? "pounds and ounces" : "decimal pounds"}`, async () => {
      const views = await everyView(units);
      for (const [name, data] of Object.entries(views)) {
        const found = weightUnits(data);
        // The tournament list carries no measurement; every other view shows at least one weight.
        if (name !== "tournaments") expect(found.length, name).toBeGreaterThan(0);
        expect(found.filter((u) => u === other), `${name} still shows ${other}`).toEqual([]);
      }
    });
  }

  it("switches back and forth: the second save wins everywhere", async () => {
    await everyView("lb_oz");
    const views = await everyView("lb");
    expect(weightUnits(views.leaderboard)).not.toContain("oz");
    expect(weightUnits(views.myCatches)).not.toContain("oz");
  });
});

describe("draftAfterSave", () => {
  it("keeps a name still being typed when only the units were saved", () => {
    const draft = draftAfterSave({ name: "Kayden R", units: "lb_oz" }, { display_units: "lb_oz" }, { name: "Kayden", display_units: "lb_oz" });
    expect(draft).toEqual({ name: "Kayden R", units: "lb_oz" });
  });

  it("takes both saved values when both were sent (Save changes)", () => {
    const draft = draftAfterSave({ name: "Kayden R ", units: "lb" }, { name: "Kayden R", display_units: "lb" }, { name: "Kayden R", display_units: "lb" });
    expect(draft).toEqual({ name: "Kayden R", units: "lb" });
  });

  it("keeps a units choice still unsaved when only the name was saved", () => {
    const draft = draftAfterSave({ name: "Kayden R", units: "lb_oz" }, { name: "Kayden R" }, { name: "Kayden R", display_units: "lb" });
    expect(draft).toEqual({ name: "Kayden R", units: "lb_oz" });
  });
});
