// PRF-01c Profile stats read from PocketBase (web/src/lib/loadProfileStats.ts; decisions.md
// 2026-11-18 "Demo data on prod for grading", which replaced lib/sampleProfile.ts on the screen),
// against the docs/security.md fixture world, as each member through the real read rules.

import type { RecordModel } from "pocketbase";
import { beforeAll, describe, expect, it } from "vitest";
import { leaderboardFromRecords } from "../web/src/lib/leaderboard";
import { loadProfileStats, PROFILE_FORMAT, profileStatsFromRecords, type ProfileStatsData } from "../web/src/lib/loadProfileStats";
import { clubYear, computeStats } from "../web/src/lib/profileStats";
import { usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { catchOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();
let users: FixtureUsers;
let world: World;
const stats: Partial<Record<FixtureName, ProfileStatsData>> = {};

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
  for (const who of ["K", "N", "M", "W", "Y", "X"] as const) {
    stats[who] = await loadProfileStats(await actAs(pocketbase(), users[who]), users[who].id, Date.now());
  }
}, 60_000);

const of = (who: FixtureName) => stats[who]!;
const ids = (list: readonly { id: string }[]) => list.map((item) => item.id).sort();

describe("loadProfileStats: the member's own rows, through the read rules", () => {
  it("lists M's own catches in every status the rules show them, and nobody else's", () => {
    const m = of("M");
    expect(ids(m.input.catches)).toEqual(ids([catchOf(world, "E1.M.pending"), catchOf(world, "E1.M.verified"), catchOf(world, "E1.M.rejected")]));
    expect(m.input.events.map((e) => e.id)).toEqual([world.events.E1.id]);
    expect(m.input.entries).toEqual([{ eventId: world.events.E1.id, withdrawn: false }]);
    expect(m.input.finals).toEqual([]);
    expect(m.input.judging).toEqual([]);
  });

  it("includes Y's own retracted catch (R-CAT-L-11)", () => {
    const retracted = of("Y").input.catches.find((c) => c.status === "retracted");
    expect(retracted?.id).toBe(catchOf(world, "E1.Y.retracted").id);
  });

  it("includes W's catches on their withdrawn entry, marked as off the board (R-ENT-L-04, R-CAT-L-12)", () => {
    const w = of("W");
    expect(w.input.entries).toEqual([{ eventId: world.events.E1.id, withdrawn: true }]);
    expect(ids(w.input.catches)).toEqual(ids([catchOf(world, "E1.W.pending"), catchOf(world, "E1.W.verified")]));
    expect(w.input.catches.every((c) => c.entryWithdrawn)).toBe(true);
    const computed = computeStats(w.input, "all", w.season, "lb", PROFILE_FORMAT);
    expect(computed.counts).toMatchObject({ submitted: 2, verified: 1, pending: 1, counted: 0 });
  });

  it("carries species, capture time and the measurement of the event's metric", () => {
    const n = of("N");
    const length = n.input.catches.find((c) => c.id === catchOf(world, "EL.N.verified").id)!;
    expect(length).toMatchObject({ status: "verified", lengthQ: catchOf(world, "EL.N.verified").length_q });
    expect(length.weightHoz).toBeUndefined();
    expect(["Largemouth", "Smallmouth"]).toContain(length.species);
    expect(length.capturedAt?.getTime()).toBe(new Date(catchOf(world, "EL.N.verified").captured_at.replace(" ", "T")).getTime());
  });

  it("leaves out a draft, even for the organizer who can read it", () => {
    expect(of("K").input.events.map((e) => e.id)).not.toContain(world.events.ED.id);
  });

  it("names the tournaments a member judges now: live and closed only", () => {
    expect(of("K").input.judging.map((j) => j.role)).toEqual(["Judge", "Judge", "Judge", "Judge"]);
    expect(of("K").input.judging.map((j) => j.eventName).sort()).toEqual([world.events.E1, world.events.E2, world.events.EL, world.events.EC].map((e) => e.name).sort());
    expect(of("N").input.judging.map((j) => j.role)).toEqual(["Backup judge", "Backup judge", "Backup judge"]);
    expect(of("N").input.judging.map((j) => j.eventName).sort()).toEqual([world.events.E2.name, world.events.EC.name, world.events.EL.name].sort());
  });

  it("gives each final tournament the place the final board shows", async () => {
    const event = world.events.EF;
    for (const who of ["K", "N"] as const) {
      const client = await actAs(pocketbase(), users[who]);
      const board = leaderboardFromRecords({
        event,
        entries: await client.collection("entries").getFullList({ filter: `event = "${event.id}"` }),
        catches: await client.collection("catches").getFullList({ filter: `entry.event = "${event.id}"`, expand: "species" }),
        viewerId: users[who].id,
        units: "lb",
        nowMs: Date.now(),
      });
      const final = of(who).input.finals.find((f) => f.eventId === event.id);
      expect(final, who).toMatchObject({ place: board.view.you!.place, tied: board.view.you!.tied, fieldSize: board.view.rows.length });
      expect(final?.totalHoz, who).toBeGreaterThan(0);
    }
  });

  it("names the season by the club-time year of the clock it is given", () => {
    expect(of("M").season).toBe(clubYear(new Date()));
  });

  it("gives X, who fished nothing, an empty profile (PRF-01f)", () => {
    const x = of("X");
    expect(x.input).toEqual({ events: [], entries: [], catches: [], finals: [], judging: [] });
    const computed = computeStats(x.input, "season", x.season, "lb", PROFILE_FORMAT);
    expect(computed.past).toEqual([]);
    expect(computed.finishes.empty).toBe("No final results this season yet");
  });
});

describe("profileStatsFromRecords: final results", () => {
  const record = (fields: Record<string, unknown>) => fields as unknown as RecordModel;
  const final = record({ id: "f", name: "Fall", status: "final", starts_at: "2026-09-06 10:00:00.000Z", metric: "weight", judge: "j", backup_judge: "b" });
  const base = { events: [final], nowMs: Date.parse("2026-11-18T12:00:00Z") };
  const fish = (id: string, entry: string, weight: number) => record({ id, entry, status: "verified", weight_hoz: weight, created: "2026-09-07 10:00:00.000Z", expand: { species: { name: "largemouth bass" } } });

  it("shows a withdrawn entry as Withdrawn, with no place", () => {
    const data = profileStatsFromRecords({
      ...base,
      viewerId: "me",
      entries: [record({ id: "e1", event: "f", angler: "me", withdrawn: true }), record({ id: "e2", event: "f", angler: "other", withdrawn: false })],
      catches: [fish("c1", "e1", 3000), fish("c2", "e2", 2000)],
    });
    expect(data.input.finals).toEqual([{ eventId: "f", place: null, tied: false, fieldSize: 0 }]);
    expect(computeStats(data.input, "all", data.season, "lb", PROFILE_FORMAT).past).toEqual([{ eventId: "f", title: "Fall", detail: "Final · Withdrawn" }]);
  });

  it("leaves out a final where they got no fish on the board, and shares a tied place", () => {
    const entries = [
      record({ id: "e1", event: "f", angler: "me", withdrawn: false }),
      record({ id: "e2", event: "f", angler: "a", withdrawn: false }),
      record({ id: "e3", event: "f", angler: "b", withdrawn: false }),
    ];
    const none = profileStatsFromRecords({ ...base, viewerId: "me", entries, catches: [fish("c2", "e2", 2000)] });
    expect(none.input.finals).toEqual([]);
    expect(none.input.events.map((e) => e.id)).toEqual(["f"]);

    const tied = profileStatsFromRecords({ ...base, viewerId: "me", entries, catches: [fish("c1", "e1", 2000), fish("c2", "e2", 2000), fish("c3", "e3", 3000)] });
    expect(tied.input.finals).toEqual([{ eventId: "f", place: 2, tied: true, fieldSize: 3, totalHoz: 2000 }]);
    expect(computeStats(tied.input, "all", 2026, "lb", PROFILE_FORMAT).past[0]?.detail).toBe("Final · T-2 of 3 · 1.25 lb");
  });
});
