// LB-02 Angler's catches: the view model the screen renders. Pure: no DOM, no PocketBase.
//
// Wiring: the target angler's catches in one event come from the catches list rule (M0-03),
// newest first; their place, total and counted fish from their leaderboard row; `inBest`
// from scoring (S2a). Until then the screen runs on lib/sampleAnglerCatches.ts.

import { formatClubClock, formatClubTime, placeLabel, sameClubDay } from "./format";
import type { LeaderboardRow } from "./sampleLeaderboard";
import type { MyCatchView } from "./myCatches";

/** One catch as other members see it: no reason, decision or correction on the list. */
export type AnglerCatchView = Pick<MyCatchView, "id" | "species" | "measurement" | "status" | "created" | "capturedAt" | "photos" | "inBest">;

/**
 * Pending and verified only, for every viewer: judges and the organizer can read more through
 * the API, but LB-02 is the same page for everyone (screens.md LB-02c; decisions.md 2026-10-05).
 */
export function shownOnAnglerPage(catches: readonly AnglerCatchView[]): AnglerCatchView[] {
  return catches.filter((c) => c.status === "pending" || c.status === "verified");
}

/** The facts card: "1st · 27.15 lb" and "10 of 10 · 12 catches shown" (Figma 60:2831). */
export function anglerFacts(row: LeaderboardRow, unit: string, bestN: number, shown: number): { place: string; counted: string } {
  const noun = shown === 1 ? "catch" : "catches";
  return {
    place: `${placeLabel(row.place, row.tied)} · ${row.total} ${unit}`,
    counted: `${row.counted} of ${bestN} · ${shown} ${noun} shown`,
  };
}

/**
 * "Submitted Sat, Jul 10, 7:42 AM · photo 6:58 AM": the photo time is added when the first
 * photo carried one, with its date only when it was taken on another day (screens.md Gap 23).
 * The photo part is joined with no-break spaces so it never wraps inside the time.
 */
export function catchTimes(c: Pick<AnglerCatchView, "created" | "capturedAt">): string {
  const submitted = `Submitted ${formatClubTime(c.created)}`;
  if (!c.capturedAt) return submitted;
  const photo = sameClubDay(c.created, c.capturedAt) ? formatClubClock(c.capturedAt) : formatClubTime(c.capturedAt);
  return `${submitted} · ${`photo ${photo}`.replaceAll(" ", "\u00a0")}`;
}
