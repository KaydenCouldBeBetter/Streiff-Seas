// web/src/lib/clubTime.ts: the tournament form's Eastern date and time fields (ORG-02, ORG-03;
// Figma P12). Pure.

import { describe, expect, it } from "vitest";
import { clubInputToIso, isoToClubInput, phoneIsClubTime } from "../web/src/lib/clubTime";

describe("clubInputToIso", () => {
  it.each([
    ["summer (EDT, UTC−4)", "2027-07-04T06:00", "2027-07-04T10:00:00.000Z"],
    ["winter (EST, UTC−5)", "2027-01-15T20:00", "2027-01-16T01:00:00.000Z"],
    ["midnight", "2027-08-16T00:00", "2027-08-16T04:00:00.000Z"],
    ["the hour before spring forward", "2027-03-14T01:59", "2027-03-14T06:59:00.000Z"],
    ["the spring-forward gap: 2:30 AM doesn't exist, read as 3:30 AM EDT", "2027-03-14T02:30", "2027-03-14T07:30:00.000Z"],
    ["the hour after spring forward", "2027-03-14T03:00", "2027-03-14T07:00:00.000Z"],
    ["the repeated hour in fall: the first 1:30 AM (EDT)", "2027-11-07T01:30", "2027-11-07T05:30:00.000Z"],
    ["after fall back", "2027-11-07T02:00", "2027-11-07T07:00:00.000Z"],
  ])("%s", (_case, input, expected) => {
    expect(clubInputToIso(input)).toBe(expected);
  });

  it.each([[""], ["2027-07-04"], ["2027-02-30T06:00"], ["2027-07-04T24:00"], ["2027-07-04T06:00:00"], ["July 4"]])("refuses %j", (input) => {
    expect(() => clubInputToIso(input)).toThrow(RangeError);
  });
});

describe("isoToClubInput", () => {
  it.each([
    ["2027-07-04T10:00:00.000Z", "2027-07-04T06:00"],
    ["2027-01-16T01:00:00.000Z", "2027-01-15T20:00"],
    ["2027-11-07T05:30:00.000Z", "2027-11-07T01:30"],
    ["2027-11-07T06:30:00.000Z", "2027-11-07T01:30"],
  ])("%s → %s", (iso, expected) => {
    expect(isoToClubInput(new Date(iso))).toBe(expected);
  });

  it("is empty for no date", () => {
    expect(isoToClubInput(null)).toBe("");
    expect(isoToClubInput(new Date(Number.NaN))).toBe("");
  });

  it("round-trips every quarter hour of 2027 except the spring-forward gap", () => {
    const start = Date.UTC(2027, 0, 1, 5);
    for (let ms = start; ms < start + 365 * 24 * 3600_000; ms += 15 * 60_000) {
      const input = isoToClubInput(new Date(ms));
      const back = Date.parse(clubInputToIso(input));
      // Inside the repeated fall hour the second reading maps back to the first, an hour earlier.
      expect([ms, ms - 3600_000]).toContain(back);
    }
  });
});

describe("phoneIsClubTime", () => {
  it.each([
    ["America/New_York", true],
    ["America/Detroit", true],
    ["America/Chicago", false],
    ["America/Phoenix", false],
    ["UTC", false],
  ])("%s → %s", (zone, expected) => {
    expect(phoneIsClubTime(zone)).toBe(expected);
  });
});
