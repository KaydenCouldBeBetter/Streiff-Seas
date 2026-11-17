// Sample data from the LB-01a skeleton, matching the Figma frame (66:5754). The app reads the
// real board (lib/leaderboard.ts, S2b); this stays for the LB-02 tests' sample angler pages.

import type { LeaderboardRow, LeaderboardView } from "./leaderboard";
import { SAMPLE_TOURNAMENT } from "./sampleTournament";

export type { LeaderboardRow, LeaderboardView } from "./leaderboard";

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
