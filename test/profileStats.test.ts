// web/src/lib/profileStats.ts: the PRF-01c numbers. The sample reproduces every figure on the
// Figma frames (184:9982, 188:10339, 188:10448, 188:10553, 185:10439, 185:10548).

import { describe, expect, it } from "vitest";
import {
  CHART_CHIPS,
  clubYear,
  computeStats,
  countTicks,
  finishLabel,
  parseChartId,
  placeTicks,
  timeBucket,
  weekLabel,
  weekStart,
  type ProfileStatsInput,
  type StatsCatch,
} from "../web/src/lib/profileStats";
import { SAMPLE_FORMAT, SAMPLE_PROFILE_STATS, SAMPLE_SEASON } from "../web/src/lib/sampleProfile";

const season = computeStats(SAMPLE_PROFILE_STATS, "season", SAMPLE_SEASON, "lb", SAMPLE_FORMAT);
const allTime = computeStats(SAMPLE_PROFILE_STATS, "all", SAMPLE_SEASON, "lb", SAMPLE_FORMAT);

describe("Season 2027 on the PRF-01c frame", () => {
  it("shows the two best tiles", () => {
    expect(season.heaviest).toEqual({ value: "3.80", unit: "lb", species: "Largemouth", eventName: "Summer Bass 2027" });
    expect(season.longest).toEqual({ value: "21 1/2", unit: "in", species: "Walleye", eventName: "Walleye Open 2027" });
  });

  it("charts 12 verified fish by species, largest first, bars measured from zero", () => {
    expect(season.species.subtitle).toBe("Season 2027 · 12 fish");
    expect(season.species.bars.map((b) => [b.label, b.count])).toEqual([
      ["Largemouth", 7],
      ["Walleye", 3],
      ["Smallmouth", 2],
    ]);
    expect(season.species.bars.map((b) => Math.round(b.share * 326))).toEqual([326, 140, 93]);
    expect(season.species.summary).toBe("Largemouth 7 fish, walleye 3, smallmouth 2.");
  });

  it("charts the weekly line from Jul 4 to Aug 8", () => {
    expect(season.weekly.points.map((p) => [p.label, p.count])).toEqual([
      ["Jul 4", 2],
      ["Jul 11", 3],
      ["Jul 18", 1],
      ["Jul 25", 3],
      ["Aug 1", 2],
      ["Aug 8", 1],
    ]);
    expect(season.weekly.ticks).toEqual([0, 2, 4]);
    expect(season.weekly.subtitle).toBe("Season 2027 · by the week the photo was taken");
  });

  it("charts time of day from the photo's capture time and says how many fish had one", () => {
    expect(season.timeOfDay.columns.map((c) => [c.label, c.count])).toEqual([
      ["Dawn", 3],
      ["Morning", 4],
      ["Midday", 1],
      ["Afternoon", 1],
      ["Evening", 2],
    ]);
    expect(season.timeOfDay.subtitle).toBe("Season 2027 · 11 of 12 fish had a photo time");
  });

  it("has no final result yet, so Finishes says so", () => {
    expect(season.finishes.points).toEqual([]);
    expect(season.finishes.empty).toBe("No final results this season yet");
  });

  it("counts 15 catches: 12 verified, 1 pending, 1 rejected, 1 retracted, in 2 tournaments, 12 counted", () => {
    expect(season.counts).toEqual({ submitted: 15, verified: 12, pending: 1, rejected: 1, retracted: 1, tournaments: 2, counted: 12 });
  });
});

describe("All time on the PRF-01c frames", () => {
  it("shows the all-time bests", () => {
    expect(allTime.heaviest).toMatchObject({ value: "4.62", unit: "lb", species: "Largemouth", eventName: "Summer Bass 2026" });
    expect(allTime.longest).toMatchObject({ value: "22 1/4", unit: "in", species: "Smallmouth", eventName: "Fall Bass 2025" });
  });

  it("plots your place in each final tournament, oldest first, shared places as T-n, 1st at the top", () => {
    expect(allTime.finishes.points.map((p) => [p.label, p.text])).toEqual([
      ["Sum 25", "6th"],
      ["Fall 25", "4th"],
      ["Sum 26", "T-2"],
      ["Fall 26", "3rd"],
    ]);
    expect(allTime.finishes.ticks).toEqual([1, 3, 5, 7]);
    expect(allTime.finishes.subtitle).toBe("All time · your place in each final tournament. Higher is better.");
    expect(allTime.finishes.summary).toBe("Finishes: Sum 25 6th, Fall 25 4th, Sum 26 Tied for 2nd, Fall 26 3rd.");
  });

  it("lists past results newest first, whatever the scope", () => {
    expect(season.past).toEqual(allTime.past);
    expect(allTime.past.map((p) => [p.title, p.detail])).toEqual([
      ["Fall Bass 2026", "Final · 3rd of 12 · 158 1/4 in"],
      ["Summer Bass 2026", "Final · T-2 of 11 · 24.06 lb"],
      ["Fall Bass 2025", "Final · 4th of 10 · 141 3/4 in"],
      ["Summer Bass 2025", "Final · 6th of 9 · 15.88 lb"],
    ]);
  });
});

describe("display units", () => {
  it("show the same fish in pounds and ounces, and change no count or chart", () => {
    const ounces = computeStats(SAMPLE_PROFILE_STATS, "season", SAMPLE_SEASON, "lb_oz", SAMPLE_FORMAT);

    expect(ounces.heaviest).toMatchObject({ value: "3 lb 12.8", unit: "oz" });
    expect(ounces.longest).toEqual(season.longest);
    // Only weights are worded differently: the best tile and the weight totals in Past results.
    expect({ ...ounces, heaviest: null, past: [] }).toEqual({ ...season, heaviest: null, past: [] });
    expect(ounces.past.map((p) => p.title)).toEqual(season.past.map((p) => p.title));
  });

  it("show a past weight total in pounds and ounces", () => {
    const ounces = computeStats(SAMPLE_PROFILE_STATS, "all", SAMPLE_SEASON, "lb_oz", SAMPLE_FORMAT);

    expect(ounces.past[1]!.detail).toBe("Final · T-2 of 11 · 24 lb 1.0 oz");
  });
});

describe("nothing to show", () => {
  const empty: ProfileStatsInput = { events: [], entries: [], catches: [], finals: [], judging: [] };
  const none = computeStats(empty, "season", 2027, "lb", SAMPLE_FORMAT);

  it("reads None yet for every tile and chart", () => {
    expect(none.heaviest).toBeNull();
    expect(none.longest).toBeNull();
    expect([none.species.empty, none.weekly.empty, none.timeOfDay.empty]).toEqual(["None yet", "None yet", "None yet"]);
    expect(none.finishes.empty).toBe("No final results this season yet");
    expect(computeStats(empty, "all", 2027, "lb", SAMPLE_FORMAT).finishes.empty).toBe("No final results yet");
    expect(none.counts).toEqual({ submitted: 0, verified: 0, pending: 0, rejected: 0, retracted: 0, tournaments: 0, counted: 0 });
    expect(none.past).toEqual([]);
  });

  it("leaves out a season with no tournament", () => {
    const other = computeStats(SAMPLE_PROFILE_STATS, "season", 2030, "lb", SAMPLE_FORMAT);

    expect(other.counts.submitted).toBe(0);
    expect(other.heaviest).toBeNull();
  });
});

describe("what counts", () => {
  const base: StatsCatch = { id: "x", eventId: "sb27", species: "Largemouth", status: "verified", entryWithdrawn: false, created: new Date("2027-07-05T12:00:00-04:00"), weightHoz: 4000 };
  const input = (catches: StatsCatch[], entries = SAMPLE_PROFILE_STATS.entries): ProfileStatsInput => ({ ...SAMPLE_PROFILE_STATS, catches, entries, finals: [] });

  it("keeps pending, rejected and retracted catches out of bests and charts but in the status counts", () => {
    const stats = computeStats(input([base, { ...base, id: "p", status: "pending", weightHoz: 9000 }, { ...base, id: "r", status: "rejected", weightHoz: 9000 }]), "all", 2027, "lb", SAMPLE_FORMAT);

    expect(stats.heaviest?.value).toBe("2.50");
    expect(stats.species.bars).toHaveLength(1);
    expect(stats.counts).toMatchObject({ submitted: 3, verified: 1, pending: 1, rejected: 1 });
  });

  it("counts a verified catch on a withdrawn entry as verified but not as counted toward totals", () => {
    const stats = computeStats(input([base, { ...base, id: "w", entryWithdrawn: true }]), "all", 2027, "lb", SAMPLE_FORMAT);

    expect(stats.counts).toMatchObject({ verified: 2, counted: 1 });
  });

  it("gives a tie for the best to the earlier catch", () => {
    const earlier = { ...base, id: "early", species: "Smallmouth", created: new Date("2027-07-01T12:00:00-04:00") };
    const stats = computeStats(input([base, earlier]), "all", 2027, "lb", SAMPLE_FORMAT);

    expect(stats.heaviest?.species).toBe("Smallmouth");
  });

  it("shows Withdrawn instead of a place when the entry is withdrawn", () => {
    const stats = computeStats(
      { ...SAMPLE_PROFILE_STATS, finals: [{ eventId: "fb26", place: null, tied: false, fieldSize: 12 }] },
      "all",
      2027,
      "lb",
      SAMPLE_FORMAT,
    );

    expect(stats.past).toEqual([{ eventId: "fb26", title: "Fall Bass 2026", detail: "Final · Withdrawn" }]);
    expect(stats.finishes.points).toEqual([]);
  });
});

describe("club time", () => {
  it("starts a week on Sunday in club time, not UTC", () => {
    // Sat Jul 10 2027, 9 PM in New York is already Sunday Jul 11 in UTC: still the week of Jul 4.
    expect(weekLabel(weekStart(new Date("2027-07-10T21:00:00-04:00")))).toBe("Jul 4");
    expect(weekLabel(weekStart(new Date("2027-07-11T00:30:00-04:00")))).toBe("Jul 11");
  });

  it("keeps a week whole across the November clock change", () => {
    // Clocks went back on Sun Nov 7 2027: the week of Nov 7 is 7 calendar days, 169 hours long.
    const sunday = weekStart(new Date("2027-11-07T12:00:00-05:00"));

    expect(weekLabel(sunday)).toBe("Nov 7");
    expect(weekLabel(weekStart(new Date("2027-11-13T23:30:00-05:00")))).toBe("Nov 7");
    expect(weekLabel(weekStart(new Date("2027-11-14T00:10:00-05:00")))).toBe("Nov 14");
  });

  it("zero-fills a week with no fish between the first and the last", () => {
    const gap: StatsCatch[] = [
      { id: "a", eventId: "sb27", species: "Largemouth", status: "verified", entryWithdrawn: false, created: new Date("2027-07-05T12:00:00-04:00"), weightHoz: 100 },
      { id: "b", eventId: "sb27", species: "Largemouth", status: "verified", entryWithdrawn: false, created: new Date("2027-07-20T12:00:00-04:00"), weightHoz: 100 },
    ];
    const stats = computeStats({ ...SAMPLE_PROFILE_STATS, catches: gap }, "all", 2027, "lb", SAMPLE_FORMAT);

    expect(stats.weekly.points.map((p) => p.count)).toEqual([1, 0, 1]);
  });

  it("puts a time of day in its bucket at each boundary", () => {
    const hour = (h: string) => timeBucket(new Date(`2027-07-05T${h}-04:00`));

    expect([hour("06:59:00"), hour("07:00:00"), hour("10:59:00"), hour("11:00:00"), hour("13:59:00"), hour("14:00:00"), hour("16:59:00"), hour("17:00:00")]).toEqual([
      "Dawn",
      "Morning",
      "Morning",
      "Midday",
      "Midday",
      "Afternoon",
      "Afternoon",
      "Evening",
    ]);
    // Midnight is hour 0, not 24.
    expect(timeBucket(new Date("2027-07-05T00:20:00-04:00"))).toBe("Dawn");
  });

  it("belongs a tournament to the club-time year it starts in", () => {
    expect(clubYear(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(clubYear(new Date("2027-01-01T06:00:00-05:00"))).toBe(2027);
  });
});

describe("labels and axes", () => {
  it("shortens a tournament name for the Finishes axis", () => {
    expect(finishLabel("Summer Bass 2025", new Date("2025-06-21T06:00:00-04:00"))).toBe("Sum 25");
    expect(finishLabel("Fall Bass 2026", new Date("2026-09-12T06:00:00-04:00"))).toBe("Fall 26");
    expect(finishLabel("Walleye Open 2027", new Date("2027-07-10T06:00:00-04:00"))).toBe("Wal 27");
  });

  it("picks count ticks from zero with at most two intervals", () => {
    expect([1, 3, 7, 12, 40].map(countTicks)).toEqual([[0, 1], [0, 2, 4], [0, 5, 10], [0, 10, 20], [0, 20, 40]]);
    expect(countTicks(0)).toEqual([0, 1]);
  });

  it("labels places 1st, 3rd, 5th ... on the axis", () => {
    expect(placeTicks(6)).toEqual([1, 3, 5, 7]);
    expect(placeTicks(1)).toEqual([1, 3]);
    expect(placeTicks(0)).toEqual([1, 3]);
  });
});

describe("the chart chips", () => {
  it("read a remembered choice back, and fall back to Species for anything else", () => {
    expect(["species", "weekly", "time", "finishes"].map(parseChartId)).toEqual(["species", "weekly", "time", "finishes"]);
    expect([null, undefined, "", "Weekly", "pie"].map(parseChartId)).toEqual(["species", "species", "species", "species", "species"]);
    expect(CHART_CHIPS.map((chip) => chip.label)).toEqual(["Species", "Weekly", "Time of day", "Finishes"]);
  });
});
