// Sample data for the PRF-01c stats, matching the Figma frames (184:9982, 188:10339, 188:10448,
// 188:10553, 185:10439, 185:10548). Nothing here comes from PocketBase: the member's own
// entries, catches and the events they entered can't be read through the API until M0-03 opens
// those reads, and each final tournament's place comes from web/src/lib/scoring.ts (S2a) over
// its final standings. Replace this module with those then.
//
// SAMPLE_FORMAT stands in for scoring.ts's display rounding (scoring.md section 4): decimal
// pounds to 0.01, pounds and ounces with ounces to 0.1, lengths in whole and quarter inches.

import type { DisplayUnits } from "./profile";
import type { Display, FinalResult, MeasureFormat, ProfileStatsInput, StatsCatch, StatsEntry, StatsEvent } from "./profileStats";

/** The season the toggle's first option names: the current club-time year. */
export const SAMPLE_SEASON = 2027;

const at = (iso: string) => new Date(iso);

const EVENTS: StatsEvent[] = [
  { id: "sb27", name: "Summer Bass 2027", startsAt: at("2027-07-03T06:00:00-04:00"), metric: "weight" },
  { id: "wo27", name: "Walleye Open 2027", startsAt: at("2027-07-10T06:00:00-04:00"), metric: "length" },
  { id: "fb26", name: "Fall Bass 2026", startsAt: at("2026-09-12T06:00:00-04:00"), metric: "length" },
  { id: "sb26", name: "Summer Bass 2026", startsAt: at("2026-06-20T06:00:00-04:00"), metric: "weight" },
  { id: "fb25", name: "Fall Bass 2025", startsAt: at("2025-09-13T06:00:00-04:00"), metric: "length" },
  { id: "sb25", name: "Summer Bass 2025", startsAt: at("2025-06-21T06:00:00-04:00"), metric: "weight" },
];

const ENTRIES: StatsEntry[] = EVENTS.map((event) => ({ eventId: event.id, withdrawn: false }));

/** A verified catch with a photo time; it was submitted two hours after it was taken. */
function taken(id: string, eventId: string, species: string, takenAt: string, size: { weightHoz?: number; lengthQ?: number }): StatsCatch {
  const capturedAt = at(takenAt);
  return { id, eventId, species, status: "verified", entryWithdrawn: false, created: new Date(capturedAt.getTime() + 2 * 3_600_000), capturedAt, ...size };
}

const CATCHES: StatsCatch[] = [
  // Season 2027: 12 verified fish (7 largemouth, 3 walleye, 2 smallmouth), six weeks from Jul 4.
  taken("c01", "sb27", "Largemouth", "2027-07-05T06:10:00-04:00", { weightHoz: 5200 }),
  taken("c02", "sb27", "Largemouth", "2027-07-09T08:20:00-04:00", { weightHoz: 4800 }),
  taken("c03", "sb27", "Largemouth", "2027-07-12T06:40:00-04:00", { weightHoz: 5600 }),
  taken("c04", "wo27", "Walleye", "2027-07-14T07:30:00-04:00", { lengthQ: 80 }),
  taken("c05", "sb27", "Largemouth", "2027-07-17T19:05:00-04:00", { weightHoz: 6080 }),
  taken("c06", "sb27", "Smallmouth", "2027-07-20T12:15:00-04:00", { weightHoz: 4000 }),
  taken("c07", "sb27", "Largemouth", "2027-07-26T05:50:00-04:00", { weightHoz: 4400 }),
  taken("c08", "wo27", "Walleye", "2027-07-28T09:45:00-04:00", { lengthQ: 82 }),
  taken("c09", "sb27", "Largemouth", "2027-07-31T15:30:00-04:00", { weightHoz: 5000 }),
  taken("c10", "sb27", "Largemouth", "2027-08-02T10:10:00-04:00", { weightHoz: 4960 }),
  // The one without a photo time: counted in the weekly chart by its submit time, left out of Time of day.
  { id: "c11", eventId: "sb27", species: "Smallmouth", status: "verified", entryWithdrawn: false, created: at("2027-08-05T20:00:00-04:00"), weightHoz: 3200 },
  taken("c12", "wo27", "Walleye", "2027-08-09T18:20:00-04:00", { lengthQ: 86 }),
  // The other three of the season's 15 submitted catches.
  { id: "c13", eventId: "sb27", species: "Largemouth", status: "pending", entryWithdrawn: false, created: at("2027-08-10T07:30:00-04:00"), capturedAt: at("2027-08-10T06:45:00-04:00"), weightHoz: 4200 },
  { id: "c14", eventId: "sb27", species: "Smallmouth", status: "rejected", entryWithdrawn: false, created: at("2027-07-22T18:00:00-04:00"), capturedAt: at("2027-07-22T16:30:00-04:00"), weightHoz: 2800 },
  { id: "c15", eventId: "wo27", species: "Walleye", status: "retracted", entryWithdrawn: false, created: at("2027-07-30T19:00:00-04:00"), capturedAt: at("2027-07-30T17:40:00-04:00"), lengthQ: 76 },
  // Earlier seasons, for the All time bests.
  taken("o01", "sb26", "Largemouth", "2026-06-27T07:20:00-04:00", { weightHoz: 7392 }),
  taken("o02", "sb26", "Smallmouth", "2026-07-04T06:30:00-04:00", { weightHoz: 5100 }),
  taken("o03", "fb26", "Walleye", "2026-09-19T08:05:00-04:00", { lengthQ: 84 }),
  taken("o04", "fb25", "Smallmouth", "2025-09-20T09:00:00-04:00", { lengthQ: 89 }),
  taken("o05", "sb25", "Largemouth", "2025-06-28T06:15:00-04:00", { weightHoz: 4700 }),
];

const FINALS: FinalResult[] = [
  { eventId: "fb26", place: 3, tied: false, fieldSize: 12, totalQ: 633 },
  { eventId: "sb26", place: 2, tied: true, fieldSize: 11, totalHoz: 38496 },
  { eventId: "fb25", place: 4, tied: false, fieldSize: 10, totalQ: 567 },
  { eventId: "sb25", place: 6, tied: false, fieldSize: 9, totalHoz: 25408 },
];

export const SAMPLE_PROFILE_STATS: ProfileStatsInput = {
  events: EVENTS,
  entries: ENTRIES,
  catches: CATCHES,
  finals: FINALS,
  judging: [{ role: "Judge", eventName: "Summer Bass 2027" }],
};

function weight(hoz: number, units: DisplayUnits): Display {
  if (units === "lb") {
    const hundredths = Math.round(hoz / 16);
    return { value: `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`, unit: "lb" };
  }
  let pounds = Math.floor(hoz / 1600);
  let tenths = Math.round((hoz % 1600) / 10);
  if (tenths === 160) {
    pounds += 1;
    tenths = 0;
  }
  return { value: `${pounds} lb ${Math.floor(tenths / 10)}.${tenths % 10}`, unit: "oz" };
}

function length(quarters: number): Display {
  const whole = Math.floor(quarters / 4);
  const fraction = ["", "1/4", "1/2", "3/4"][quarters % 4]!;
  return { value: whole === 0 ? fraction : fraction === "" ? String(whole) : `${whole} ${fraction}`, unit: "in" };
}

export const SAMPLE_FORMAT: MeasureFormat = { weight, length };
