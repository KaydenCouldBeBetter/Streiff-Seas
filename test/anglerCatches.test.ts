import { describe, expect, it } from "vitest";
import { anglerFacts, catchTimes, shownOnAnglerPage, type AnglerCatchView } from "../web/src/lib/anglerCatches";
import { SAMPLE_ANGLER_CATCHES } from "../web/src/lib/sampleAnglerCatches";
import { SAMPLE_LEADERBOARD, type LeaderboardRow } from "../web/src/lib/sampleLeaderboard";

function aCatch(overrides: Partial<AnglerCatchView>): AnglerCatchView {
  return {
    id: "c1",
    species: "Largemouth bass",
    measurement: { value: "3.44", unit: "lb" },
    status: "pending",
    created: new Date("2027-07-11T10:20:00Z"),
    photos: [{}, {}],
    inBest: false,
    ...overrides,
  };
}

const DANA = SAMPLE_LEADERBOARD.rows[0]!;

describe("shownOnAnglerPage", () => {
  it("keeps pending and verified only, for every viewer (screens.md LB-02a, LB-02c)", () => {
    const all = (["pending", "verified", "rejected", "retracted"] as const).map((status) => aCatch({ id: status, status }));
    expect(shownOnAnglerPage(all).map((c) => c.id)).toEqual(["pending", "verified"]);
  });
});

describe("anglerFacts", () => {
  it("matches the Figma facts card", () => {
    expect(anglerFacts(DANA, "lb", 10, 12)).toEqual({ place: "1st · 27.15 lb", counted: "10 of 10 · 12 catches shown" });
  });

  it("shows a shared place as T-n and one catch in the singular", () => {
    const tied: LeaderboardRow = { ...DANA, place: 2, tied: true, counted: 1 };
    expect(anglerFacts(tied, "lb", 10, 1)).toEqual({ place: "T-2 · 27.15 lb", counted: "1 of 10 · 1 catch shown" });
  });
});

describe("catchTimes", () => {
  it("is the submitted time alone when the photo had no capture time", () => {
    expect(catchTimes({ created: new Date("2027-07-10T11:42:00Z") })).toBe("Submitted Sat, Jul 10, 7:42 AM");
  });

  // The photo part is joined with no-break spaces (\u00a0) so it never wraps inside the time.
  it("adds the photo's clock time when it was taken the same club day", () => {
    const times = { created: new Date("2027-07-10T11:42:00Z"), capturedAt: new Date("2027-07-10T10:58:00Z") };
    expect(catchTimes(times)).toBe("Submitted Sat, Jul 10, 7:42 AM · photo\u00a06:58\u00a0AM");
  });

  it("adds the photo's date too when it was taken on another day", () => {
    // Taken 11:50 PM Jul 9, submitted 12:10 AM Jul 10 (EDT).
    const times = { created: new Date("2027-07-10T04:10:00Z"), capturedAt: new Date("2027-07-10T03:50:00Z") };
    expect(catchTimes(times)).toBe("Submitted Sat, Jul 10, 12:10 AM · photo\u00a0Fri,\u00a0Jul\u00a09,\u00a011:50\u00a0PM");
  });
});

describe("SAMPLE_ANGLER_CATCHES", () => {
  const hundredths = (value: string) => Math.round(Number(value) * 100);

  for (const row of SAMPLE_LEADERBOARD.rows) {
    it(`agrees with ${row.displayName}'s leaderboard row`, () => {
      const catches = SAMPLE_ANGLER_CATCHES[row.entryId] ?? [];
      const counted = catches.filter((c) => c.status === "verified" && c.inBest);
      expect(counted.length).toBe(row.counted);
      expect(counted.reduce((sum, c) => sum + hundredths(c.measurement.value), 0)).toBe(hundredths(row.total));
      expect(catches.filter((c) => c.status === "pending").length).toBe(row.pending);
      expect(catches.every((c) => !c.inBest || c.status === "verified")).toBe(true);

      const verified = catches.filter((c) => c.status === "verified");
      const biggest = verified.reduce((a, b) => (hundredths(b.measurement.value) > hundredths(a.measurement.value) ? b : a));
      expect(biggest.measurement.value).toBe(row.biggest?.size);
      expect(biggest.species.startsWith(row.biggest?.species ?? "")).toBe(true);
    });
  }
});
