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
  /** The fishing window opens (events.starts_at). */
  startsAt: Date;
  endsAt: Date;
  submitDeadline: Date;
  /**
   * The fixed facts of the "Dates and rules" panel on a wide window (Figma 220:951). Names are
   * shown as the leaderboard shows them; the code word is only said to be on or off.
   */
  rules: {
    scoring: string;
    species: string;
    judge: string;
    backupJudge: string;
    codeWord: "On" | "Off";
  };
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
  // 6:00 AM Eastern (EDT) on Sun 4 Jul 2027.
  startsAt: new Date("2027-07-04T10:00:00Z"),
  // 8:00 PM Eastern (EDT) on Sun 15 Aug 2027; the deadline is ends_at + 24 h.
  endsAt: new Date("2027-08-16T00:00:00Z"),
  submitDeadline: new Date("2027-08-17T00:00:00Z"),
  rules: { scoring: "Weight · best 10", species: "Largemouth, Smallmouth", judge: "Kayden R.", backupJudge: "Sam P.", codeWord: "On" },
  standing: { place: 4, tied: false, total: "18.42", unit: "lb", counted: 7, bestN: 10 },
  catches: { submitted: 9, pending: 1, rejected: 1 },
};
