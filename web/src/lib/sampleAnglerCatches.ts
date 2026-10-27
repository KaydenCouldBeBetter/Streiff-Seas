// Sample data for the LB-02a skeleton, one list per row of the LB-01a sample (Figma 60:2831
// for Dana R.). Each list agrees with its leaderboard row: the verified catches marked
// in best add up to the row's total, their count is the row's counted fish, and the pending
// count matches. Nothing here comes from PocketBase: other anglers' catches can't be read
// through the API until M0-03 opens the catches list rule. Replace this module with real
// reads then (see lib/anglerCatches.ts for where each field comes from).

import type { AnglerCatchView } from "./anglerCatches";

type Species = "Largemouth bass" | "Smallmouth bass";

/** [lb, species, status, in best, submitted (club time, EDT), photo time (same day, EDT)] */
type Row = [string, Species, "pending" | "verified", boolean, string, string?];

function catches(entryId: string, rows: Row[]): AnglerCatchView[] {
  return rows.map(([value, species, status, inBest, created, photoAt], i) => {
    const day = created.slice(0, 10);
    return {
      id: `${entryId}-catch-${i + 1}`,
      species,
      measurement: { value, unit: "lb" },
      status,
      created: new Date(`${created}:00-04:00`),
      capturedAt: photoAt ? new Date(`${day}T${photoAt}:00-04:00`) : undefined,
      photos: status === "pending" ? [{}, {}] : [{}, {}, {}],
      inBest,
    };
  });
}

// Keyed by the leaderboard row's entryId.
export const SAMPLE_ANGLER_CATCHES: Readonly<Record<string, readonly AnglerCatchView[]>> = {
  // Dana R.: 1st, 27.15 lb, 10 of 10, biggest 4.02 largemouth; two small verified fish not counted.
  "sample-1": catches("sample-1", [
    ["4.02", "Largemouth bass", "verified", true, "2027-07-10T07:42", "06:58"],
    ["3.80", "Smallmouth bass", "verified", true, "2027-07-09T18:12", "17:40"],
    ["3.15", "Largemouth bass", "verified", true, "2027-07-08T19:30"],
    ["2.90", "Largemouth bass", "verified", true, "2027-07-08T06:50", "06:31"],
    ["2.75", "Smallmouth bass", "verified", true, "2027-07-07T17:05"],
    ["2.50", "Largemouth bass", "verified", true, "2027-07-07T08:20"],
    ["2.40", "Largemouth bass", "verified", true, "2027-07-06T19:55"],
    ["1.20", "Largemouth bass", "verified", false, "2027-07-06T09:44", "09:30"],
    ["2.10", "Smallmouth bass", "verified", true, "2027-07-05T07:15"],
    ["1.90", "Largemouth bass", "verified", true, "2027-07-04T18:40"],
    ["1.63", "Largemouth bass", "verified", true, "2027-07-04T06:10"],
    ["1.50", "Smallmouth bass", "verified", false, "2027-07-03T20:05"],
  ]),
  // Marcus L.: T-2, 21.30 lb, 9 of 10, biggest 3.80 smallmouth, 1 pending.
  "sample-2": catches("sample-2", [
    ["2.75", "Largemouth bass", "pending", false, "2027-07-11T06:40", "06:22"],
    ["3.80", "Smallmouth bass", "verified", true, "2027-07-10T18:02", "17:51"],
    ["3.20", "Largemouth bass", "verified", true, "2027-07-09T07:48"],
    ["2.90", "Smallmouth bass", "verified", true, "2027-07-08T17:20"],
    ["2.60", "Largemouth bass", "verified", true, "2027-07-07T06:55", "06:40"],
    ["2.40", "Largemouth bass", "verified", true, "2027-07-06T18:15"],
    ["2.10", "Smallmouth bass", "verified", true, "2027-07-05T08:30"],
    ["1.80", "Largemouth bass", "verified", true, "2027-07-04T19:10"],
    ["1.50", "Largemouth bass", "verified", true, "2027-07-03T07:40"],
    ["1.00", "Smallmouth bass", "verified", true, "2027-07-02T18:25"],
  ]),
  // Kayden R. (Judge): T-2, 21.30 lb, 9 of 10, biggest 3.80 largemouth.
  "sample-3": catches("sample-3", [
    ["3.80", "Largemouth bass", "verified", true, "2027-07-10T06:35", "06:12"],
    ["3.10", "Smallmouth bass", "verified", true, "2027-07-09T19:05"],
    ["3.00", "Largemouth bass", "verified", true, "2027-07-08T07:25"],
    ["2.50", "Largemouth bass", "verified", true, "2027-07-07T18:45"],
    ["2.30", "Smallmouth bass", "verified", true, "2027-07-06T07:10", "06:55"],
    ["2.20", "Largemouth bass", "verified", true, "2027-07-05T17:30"],
    ["1.70", "Largemouth bass", "verified", true, "2027-07-04T08:05"],
    ["1.45", "Smallmouth bass", "verified", true, "2027-07-03T18:50"],
    ["1.25", "Largemouth bass", "verified", true, "2027-07-02T07:35"],
  ]),
  // Jordan B. (the viewer): 4th, 18.42 lb, 7 of 10, biggest 4.40 largemouth, 1 pending. The
  // first four match the MY-01 sample; their rejected and retracted catches aren't shown here.
  "sample-4": catches("sample-4", [
    ["3.44", "Largemouth bass", "pending", false, "2027-07-11T06:20", "06:02"],
    ["4.40", "Largemouth bass", "verified", true, "2027-07-10T07:42", "06:58"],
    ["4.02", "Smallmouth bass", "verified", true, "2027-07-09T17:15"],
    ["2.60", "Largemouth bass", "verified", true, "2027-07-08T07:05"],
    ["2.30", "Smallmouth bass", "verified", true, "2027-07-07T18:30"],
    ["1.20", "Smallmouth bass", "verified", true, "2027-07-06T09:44"],
    ["2.10", "Largemouth bass", "verified", true, "2027-07-05T19:20"],
    ["1.80", "Largemouth bass", "verified", true, "2027-07-04T07:55"],
  ]),
  // Priya N.: 5th, 16.05 lb, 4 of 10, biggest 5.10 largemouth, 1 pending.
  "sample-5": catches("sample-5", [
    ["2.30", "Smallmouth bass", "pending", false, "2027-07-11T07:15"],
    ["5.10", "Largemouth bass", "verified", true, "2027-07-09T06:45", "06:20"],
    ["4.20", "Largemouth bass", "verified", true, "2027-07-07T19:40"],
    ["3.75", "Smallmouth bass", "verified", true, "2027-07-05T08:10"],
    ["3.00", "Largemouth bass", "verified", true, "2027-07-03T18:05"],
  ]),
  // Sam P. (Backup judge): 6th, 12.80 lb, 6 of 10, biggest 3.10 smallmouth.
  "sample-6": catches("sample-6", [
    ["3.10", "Smallmouth bass", "verified", true, "2027-07-10T17:50", "17:32"],
    ["2.60", "Largemouth bass", "verified", true, "2027-07-09T07:20"],
    ["2.20", "Largemouth bass", "verified", true, "2027-07-07T18:10"],
    ["2.00", "Smallmouth bass", "verified", true, "2027-07-06T06:40"],
    ["1.60", "Largemouth bass", "verified", true, "2027-07-04T19:25"],
    ["1.30", "Largemouth bass", "verified", true, "2027-07-02T08:00"],
  ]),
};
