// LB-01's realtime badge by events.status (Gap 25; screens.md LB-01a, b, c, g). Found 2026-11-18:
// an organizer's draft tournament showed "Live" on its leaderboard. Pure; no PocketBase.

import { describe, expect, it } from "vitest";
import { showsBoardBadge, type LiveTournament } from "../web/src/lib/liveTournament";

const tournament = (status: LiveTournament["status"]) => ({ status }) as LiveTournament;

describe("showsBoardBadge", () => {
  it("shows the badge on a live board (LB-01a)", () => {
    expect(showsBoardBadge(tournament("live"))).toBe(true);
  });

  it("shows the badge on a closed board, which still changes as catches are judged (LB-01b, c)", () => {
    expect(showsBoardBadge(tournament("closed"))).toBe(true);
  });

  it("shows no badge on a draft, which isn't live", () => {
    expect(showsBoardBadge(tournament("draft"))).toBe(false);
  });

  it("shows no badge on a final board (LB-01g)", () => {
    expect(showsBoardBadge(tournament("final"))).toBe(false);
  });

  it("reads a hand-built tournament without a status as live, as statusOf does", () => {
    expect(showsBoardBadge(tournament(undefined))).toBe(true);
  });
});
