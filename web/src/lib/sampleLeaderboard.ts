// Sample data for the LB-01a skeleton, matching the Figma frame (66:5754). Nothing here
// comes from PocketBase: entries and catches can't be read through the API until M0-03
// opens their list and view rules, and the standings come from web/src/lib/scoring.ts
// (S2a) over verified catches, live (S2b). Replace this module with those then.

import { SAMPLE_TOURNAMENT } from "./sampleTournament";

export interface LeaderboardRow {
  /** The entry's id; the row opens that angler's catches (LB-02). */
  entryId: string;
  place: number;
  /** A shared place: shown "T-2", and the next place is skipped. */
  tied: boolean;
  displayName: string;
  /** Judge and backup judge are named on their rows (decisions.md 2026-10-03). */
  role?: "Judge" | "Backup judge";
  /** The signed-in member's own row: tint, left bar and "(you)", never color alone. */
  isViewer: boolean;
  /** Already rounded for display in the viewer's units (scoring.md: display rounding). */
  total: string;
  /** Verified fish that count toward the total, of the event's best_n. */
  counted: number;
  biggest: { size: string; species: string } | null;
  pending: number;
}

export interface LeaderboardView {
  name: string;
  /** "Weight · best 10 · Week 3 of 6 · 14 anglers". */
  subtitle: string;
  unit: string;
  bestN: number;
  /** The viewer's row, for the "Your place" card; null when they have no row (LB-01e). */
  you: LeaderboardRow | null;
  rows: LeaderboardRow[];
}

const ROWS: LeaderboardRow[] = [
  { entryId: "sample-1", place: 1, tied: false, displayName: "Dana R.", isViewer: false, total: "27.15", counted: 10, biggest: { size: "4.02", species: "Largemouth" }, pending: 0 },
  { entryId: "sample-2", place: 2, tied: true, displayName: "Marcus L.", isViewer: false, total: "21.30", counted: 9, biggest: { size: "3.80", species: "Smallmouth" }, pending: 1 },
  { entryId: "sample-3", place: 2, tied: true, displayName: "Kayden R.", role: "Judge", isViewer: false, total: "21.30", counted: 9, biggest: { size: "3.80", species: "Largemouth" }, pending: 0 },
  { entryId: "sample-4", place: 4, tied: false, displayName: "Jordan B.", isViewer: true, total: "18.42", counted: 7, biggest: { size: "4.40", species: "Largemouth" }, pending: 1 },
  { entryId: "sample-5", place: 5, tied: false, displayName: "Priya N.", isViewer: false, total: "16.05", counted: 4, biggest: { size: "5.10", species: "Largemouth" }, pending: 1 },
  { entryId: "sample-6", place: 6, tied: false, displayName: "Sam P.", role: "Backup judge", isViewer: false, total: "12.80", counted: 6, biggest: { size: "3.10", species: "Smallmouth" }, pending: 0 },
];

export const SAMPLE_LEADERBOARD: LeaderboardView = {
  name: SAMPLE_TOURNAMENT.name,
  subtitle: "Weight · best 10 · Week 3 of 6 · 14 anglers",
  unit: "lb",
  bestN: 10,
  you: ROWS[3]!,
  rows: ROWS,
};
