// RULES-01a Club rules (features.json S1 step 14): the page follows the scoring.md version in force,
// and "This tournament" shows the live event's own values (screens.md Gap 37, Gap 28).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CLUB_RULES, RULES_IN_FORCE, RULES_VERSION, thisTournament } from "../web/src/lib/clubRules";
import { loadLiveTournament, type LiveTournament } from "../web/src/lib/liveTournament";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureUsers } from "./harness/users";
import { seedWorld, type World } from "./harness/world";

describe("the rules text", () => {
  it("names the scoring.md version in force, so a rule change can't leave this page behind", async () => {
    const doc = await readFile(path.join(REPO_ROOT, "docs", "scoring.md"), "utf8");
    const status = /^\*\*Status:\*\* v([\d.]+), \*\*in force from (\d+) (\w{3}) (\d{4})\*\*/m.exec(doc);
    if (!status) throw new Error("scoring.md has no Status line");
    const [, version, day, month, year] = status;

    expect(RULES_VERSION).toBe(version);
    expect(RULES_IN_FORCE).toBe(`${month} ${day}, ${year}`);
  });

  it("has the five club-wide sections of the Figma frames, each with lines", () => {
    expect(CLUB_RULES.map((section) => section.title)).toEqual(["What counts", "Proof photos", "Code word", "Submitting", "Photo limits"]);
    for (const section of CLUB_RULES) expect(section.items.length, section.title).toBeGreaterThan(0);
  });

  it("states the photo field limits the server enforces: JPEG, 5 MB, 4 photos", () => {
    const limits = CLUB_RULES.find((section) => section.title === "Photo limits")?.items.join(" ");

    expect(limits).toContain("JPEG, up to 5 MB each");
    expect(limits).toContain("At most 4 photos per catch");
  });
});

describe("This tournament", () => {
  // Figma 120:9358's values: Jul 4, 6:00 AM to Aug 15, 8:00 PM club time (EDT, UTC-4).
  const frame: LiveTournament = {
    submit: {
      eventId: "e",
      name: "Summer Bass",
      metric: "weight",
      endsAt: new Date("2027-08-16T00:00:00Z"),
      submitDeadline: new Date("2027-08-17T00:00:00Z"),
      codeWord: "MAPLE",
      species: [
        { id: "a", name: "Largemouth bass" },
        { id: "b", name: "Smallmouth bass" },
      ],
    },
    startsAt: new Date("2027-07-04T10:00:00Z"),
    bestN: 10,
    rulesLine: "",
    entry: { kind: "active", id: "x" },
    deadlineExtMin: 0,
  };

  it("matches the frame's rows", () => {
    expect(thisTournament(frame)).toEqual([
      { label: "Species", value: "Largemouth, smallmouth" },
      { label: "Scored by", value: "Weight · best 10" },
      { label: "Window", value: "Jul 4, 6:00 AM – Aug 15, 8:00 PM" },
      { label: "Final deadline", value: "Mon, Aug 16, 8:00 PM" },
      { label: "Code word", value: "On" },
    ]);
  });

  it("never shows the code word itself, and says Off when there is none", () => {
    expect(JSON.stringify(thisTournament(frame))).not.toContain("MAPLE");
    expect(thisTournament({ ...frame, submit: { ...frame.submit, codeWord: null } }).at(-1)).toEqual({ label: "Code word", value: "Off" });
  });

  it("notes an extended deadline in whole hours (Gap 28), and reads a missing extension as none", () => {
    const deadline = (t: LiveTournament) => thisTournament(t).find((fact) => fact.label === "Final deadline");

    expect(deadline({ ...frame, deadlineExtMin: 180 })).toEqual({
      label: "Final deadline",
      value: "Mon, Aug 16, 8:00 PM",
      note: "extended by 3 h after an outage",
    });
    const { deadlineExtMin: _unused, ...unextended } = frame;
    expect(deadline(unextended)).not.toHaveProperty("note");
  });

  it("scores a length tournament by length", () => {
    expect(thisTournament({ ...frame, submit: { ...frame.submit, metric: "length" } })[1]).toEqual({ label: "Scored by", value: "Length · best 10" });
  });
});

describe("the live tournament's extension, read from PocketBase", () => {
  const pocketbase = usePocketBase();
  let users: FixtureUsers;
  let world: World;

  beforeAll(async () => {
    users = await createFixtureUsers(pocketbase());
    world = await seedWorld(pocketbase(), users);
  });

  it("reads deadline_ext_min: 0 as seeded, then the organizer's 3 hours", async () => {
    const m = await actAs(pocketbase(), users.M);
    const first = await loadLiveTournament(m, users.M.id);
    expect(first?.deadlineExtMin).toBe(0);

    // Set by the superuser: the organizer's extend rule (R-EVT-U-12) comes with S4.
    const extended = await pocketbase().superuser.collection("events").update(world.events.E1.id, { deadline_ext_min: 180 });
    expect(extended.deadline_ext_min).toBe(180);
    const live = await loadLiveTournament(m, users.M.id);

    expect(live?.submit.eventId).toBe(world.events.E1.id);
    expect(live?.deadlineExtMin).toBe(180);
  });
});
