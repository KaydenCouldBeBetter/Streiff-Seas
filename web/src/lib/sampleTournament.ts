// Sample data for the EVT-02d skeleton, matching the Figma frame (66:5726). Nothing here
// comes from PocketBase: events, entries and catches can't be read through the API until
// M0-03 opens their list and view rules. Replace this module with real reads then; the
// standing (place, total, counted) comes from the leaderboard (S2a scoring, S2b).

export interface TournamentView {
  name: string;
  /** events.status: EVT-02d is the live:window row, so always live here. */
  status: "live";
  /** "Weight · best 10 · Largemouth and smallmouth": metric, best_n and species names. */
  rulesLine: string;
  endsAt: Date;
  submitDeadline: Date;
  standing: {
    place: number;
    tied: boolean;
    /** Already rounded for display in the viewer's units (scoring.md: display rounding). */
    total: string;
    unit: string;
    counted: number;
    bestN: number;
  };
  /** The viewer's own catches in this event, by status. */
  catches: {
    submitted: number;
    pending: number;
    rejected: number;
  };
}

export const SAMPLE_TOURNAMENT: TournamentView = {
  name: "Summer Bass 2027",
  status: "live",
  rulesLine: "Weight · best 10 · Largemouth and smallmouth",
  // 8:00 PM Eastern (EDT) on Sun 15 Aug 2027; the deadline is ends_at + 24 h.
  endsAt: new Date("2027-08-16T00:00:00Z"),
  submitDeadline: new Date("2027-08-17T00:00:00Z"),
  standing: { place: 4, tied: false, total: "18.42", unit: "lb", counted: 7, bestN: 10 },
  catches: { submitted: 9, pending: 1, rejected: 1 },
};
