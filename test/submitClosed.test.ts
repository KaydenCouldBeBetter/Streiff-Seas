// SUB-01e Submit: not available (screens.md): why Submit a catch can't open, for the pop-up
// (lib/liveTournament.ts submitClosed). Found 2026-11-18: the sidebar's Submit did nothing visible
// with no tournament open. Pure; no PocketBase.

import { describe, expect, it } from "vitest";
import { backToTournamentLabel, leaderboardBack, submitClosed, type EntryState, type LiveTournament, type TournamentStatus } from "../web/src/lib/liveTournament";

const STARTS = new Date("2026-10-01T10:00:00Z");
const ENDS = new Date("2026-11-12T05:00:00Z");
const DEADLINE = new Date("2026-11-13T05:00:00Z");
const DURING = new Date("2026-10-20T12:00:00Z").getTime();

function tournament(status: TournamentStatus, entry: EntryState = { kind: "active", id: "en" }): LiveTournament {
  return {
    status,
    startsAt: STARTS,
    entry,
    bestN: 5,
    rulesLine: "",
    submit: { eventId: "ev", name: "Fall Bass 2026", endsAt: ENDS, submitDeadline: DEADLINE } as LiveTournament["submit"],
  };
}

describe("submitClosed", () => {
  it("is null when submitting is open: live, joined, inside the window", () => {
    expect(submitClosed("ready", tournament("live"), DURING)).toBeNull();
  });

  it("says so while the tournament is still loading, with no way on yet", () => {
    expect(submitClosed("loading", null, DURING)).toMatchObject({ title: "Still loading", next: null });
  });

  it("says there's no live tournament and leads to Tournaments", () => {
    expect(submitClosed("none", null, DURING)).toMatchObject({ title: "No tournament is live", next: "tournaments" });
  });

  it("says the read failed and leads to Tournaments", () => {
    expect(submitClosed("error", null, DURING)).toMatchObject({ title: "Couldn't load the tournament", next: "tournaments" });
  });

  it("names a draft", () => {
    const closed = submitClosed("ready", tournament("draft"), DURING);
    expect(closed).toMatchObject({ title: "Not open yet", next: "tournament" });
    expect(closed?.message).toContain("Fall Bass 2026 is still a draft");
  });

  it("names a closed or final tournament and leads to Tournaments, where another may be live", () => {
    expect(submitClosed("ready", tournament("closed"), DURING)).toMatchObject({ title: "Submitting has closed", next: "tournaments" });
    const final = submitClosed("ready", tournament("final"), DURING);
    expect(final).toMatchObject({ title: "Submitting has closed", next: "tournaments" });
    expect(final?.message).toContain("is final");
  });

  it("asks a member who hasn't joined to join, on the tournament's page", () => {
    expect(submitClosed("ready", tournament("live", { kind: "none" }), DURING)).toMatchObject({ title: "Join first", next: "tournament" });
  });

  it("tells apart withdrawing yourself and being withdrawn", () => {
    const self = submitClosed("ready", tournament("live", { kind: "withdrawn", id: "en", bySelf: true, reason: "" }), DURING);
    expect(self).toMatchObject({ title: "You've withdrawn", next: "tournament" });
    expect(self?.message).toContain("Rejoin");
    const removed = submitClosed("ready", tournament("live", { kind: "withdrawn", id: "en", bySelf: false, reason: "" }), DURING);
    expect(removed).toMatchObject({ title: "Your entry was withdrawn" });
    expect(removed?.message).not.toContain("Rejoin");
  });

  it("gives the start time before the tournament starts", () => {
    const closed = submitClosed("ready", tournament("live"), STARTS.getTime() - 60_000);
    expect(closed).toMatchObject({ title: "Not open yet", next: "tournament" });
    expect(closed?.message).toMatch(/^Submitting opens when Fall Bass 2026 starts, \w{3}, Oct 1, /);
  });

  it("gives the deadline once it has passed", () => {
    const closed = submitClosed("ready", tournament("live"), DEADLINE.getTime() + 60_000);
    expect(closed).toMatchObject({ title: "Submitting has closed", next: "tournament" });
    expect(closed?.message).toMatch(/^The submit deadline for Fall Bass 2026 passed \w{3}, Nov 13, /);
  });
});

describe("backToTournamentLabel", () => {
  it("names a tournament that isn't live, so My catches and the board lead back to it", () => {
    expect(backToTournamentLabel(tournament("final"))).toBe("Fall Bass 2026");
    expect(backToTournamentLabel(tournament("closed"))).toBe("Fall Bass 2026");
    expect(backToTournamentLabel(tournament("draft"))).toBe("Fall Bass 2026");
  });

  it("is null for the live tournament, where those tabs are top-level, and with none open", () => {
    expect(backToTournamentLabel(tournament("live"))).toBeNull();
    expect(backToTournamentLabel(null)).toBeNull();
  });
});

describe("leaderboardBack", () => {
  it("leads back to Profile when a Past results row opened the board (PRF-01c → LB-01g)", () => {
    expect(leaderboardBack("profile", tournament("final"))).toEqual({ label: "Profile", to: "profile" });
  });

  it("otherwise leads to a tournament that isn't live, and nowhere from the live board", () => {
    expect(leaderboardBack("tournament", tournament("final"))).toEqual({ label: "Fall Bass 2026", to: "tournament" });
    expect(leaderboardBack("tournament", tournament("live"))).toBeNull();
    expect(leaderboardBack("tournament", null)).toBeNull();
  });
});
