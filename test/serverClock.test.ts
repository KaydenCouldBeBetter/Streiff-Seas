import { describe, expect, it } from "vitest";
import { createClient } from "../web/src/lib/pb";
import { clockOffsetMs, noteServerDate, serverNowMs } from "../web/src/lib/serverClock";
import { usePocketBase } from "./harness/pocketbase";

const pocketbase = usePocketBase();

describe("server clock", () => {
  it("corrects a phone clock that is behind the server", () => {
    const phoneNow = Date.parse("2027-06-01T12:00:00.000Z");
    noteServerDate("Tue, 01 Jun 2027 12:05:00 GMT", phoneNow);

    // The header says 12:05:00; the server is somewhere in that second.
    expect(clockOffsetMs()).toBe(5 * 60_000 + 500);
    expect(serverNowMs(phoneNow)).toBe(Date.parse("2027-06-01T12:05:00.500Z"));
  });

  it("corrects a phone clock that is ahead of the server", () => {
    const phoneNow = Date.parse("2027-06-01T12:00:00.000Z");
    noteServerDate("Tue, 01 Jun 2027 11:00:00 GMT", phoneNow);

    expect(clockOffsetMs()).toBe(-60 * 60_000 + 500);
  });

  it("keeps the last offset when the header is missing or unreadable", () => {
    noteServerDate("Tue, 01 Jun 2027 12:00:10 GMT", Date.parse("2027-06-01T12:00:00.000Z"));
    noteServerDate(null);
    noteServerDate("not a date");

    expect(clockOffsetMs()).toBe(10_500);
  });

  it("is fed by the Date header of every response to the shared client", async () => {
    noteServerDate("Tue, 01 Jun 2027 12:00:00 GMT", Date.parse("2020-01-01T00:00:00.000Z"));
    const client = createClient(pocketbase().url);

    await client.health.check();

    // Same machine, same clock: the offset is back to about nothing.
    expect(Math.abs(clockOffsetMs())).toBeLessThan(2_000);
  });
});
