import { describe, expect, it } from "vitest";
import { formatClubClock, formatClubTime, placeLabel, rowPlace, sameClubDay, spokenPlace } from "../web/src/lib/format";

describe("formatClubTime", () => {
  it("shows club time (America/New_York), 12-hour, whatever the machine's zone", () => {
    // 00:00 UTC is 8:00 PM the day before in EDT.
    expect(formatClubTime(new Date("2027-08-16T00:00:00Z"))).toBe("Sun, Aug 15, 8:00 PM");
    expect(formatClubTime(new Date("2027-08-17T00:00:00Z"))).toBe("Mon, Aug 16, 8:00 PM");
  });

  it("follows daylight saving: EST in winter", () => {
    expect(formatClubTime(new Date("2027-01-10T17:05:00Z"))).toBe("Sun, Jan 10, 12:05 PM");
  });

  it("shows midnight as 12 AM", () => {
    expect(formatClubTime(new Date("2027-08-15T04:00:00Z"))).toBe("Sun, Aug 15, 12:00 AM");
  });
});

describe("placeLabel", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [111, "111th"],
  ])("place %i is %s", (place, label) => {
    expect(placeLabel(place, false)).toBe(label);
  });

  it("shows a shared place as T-n (decisions.md 2026-10-03)", () => {
    expect(placeLabel(2, true)).toBe("T-2");
  });

  it("refuses a place that isn't a positive integer", () => {
    expect(() => placeLabel(0, false)).toThrow(RangeError);
    expect(() => placeLabel(1.5, false)).toThrow(RangeError);
  });
});

describe("rowPlace", () => {
  it("shows the bare number, or T-n for a shared place", () => {
    expect(rowPlace(1, false)).toBe("1");
    expect(rowPlace(11, false)).toBe("11");
    expect(rowPlace(2, true)).toBe("T-2");
  });

  it("refuses a place that isn't a positive integer", () => {
    expect(() => rowPlace(0, false)).toThrow(RangeError);
  });
});

describe("spokenPlace", () => {
  it("reads the ordinal, and a shared place as Tied for", () => {
    expect(spokenPlace(4, false)).toBe("4th");
    expect(spokenPlace(2, true)).toBe("Tied for 2nd");
    expect(spokenPlace(1, true)).toBe("Tied for 1st");
  });
});

describe("formatClubClock", () => {
  it("shows the club clock time alone, 12-hour", () => {
    expect(formatClubClock(new Date("2027-07-10T10:58:00Z"))).toBe("6:58 AM");
    expect(formatClubClock(new Date("2027-08-17T00:00:00Z"))).toBe("8:00 PM");
    expect(formatClubClock(new Date("2027-08-15T04:00:00Z"))).toBe("12:00 AM");
  });
});

describe("sameClubDay", () => {
  it("compares calendar days in club time, not UTC", () => {
    // 11:30 PM and 8:00 PM EDT on Aug 15: the same club day, though both are Aug 16 in UTC.
    expect(sameClubDay(new Date("2027-08-16T03:30:00Z"), new Date("2027-08-16T00:00:00Z"))).toBe(true);
    // 11:30 PM EDT Aug 15 and 12:30 AM EDT Aug 16.
    expect(sameClubDay(new Date("2027-08-16T03:30:00Z"), new Date("2027-08-16T04:30:00Z"))).toBe(false);
  });
});
