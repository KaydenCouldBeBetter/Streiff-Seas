import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "../web/src/lib/pb";
import {
  clockOffsetMs,
  createServerClock,
  noteServerDate,
  serverNowMs,
  type ServerClock,
} from "../web/src/lib/serverClock";
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

  it("is fed when the headers arrive, without waiting for the body", async () => {
    let finishBody = (): void => {};
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.flushHeaders();
      finishBody = () => response.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    noteServerDate("Tue, 01 Jun 2027 12:00:00 GMT", Date.parse("2020-01-01T00:00:00.000Z"));

    try {
      let answered = false;
      const request = client.send("/slow", {}).then(() => (answered = true));

      await vi.waitFor(() => expect(Math.abs(clockOffsetMs())).toBeLessThan(2_000));
      expect(answered).toBe(false);

      finishBody();
      await request;
    } finally {
      server.close();
    }
  });
});

describe("a server clock's choice between responses", () => {
  const noon = Date.parse("2027-06-01T12:00:00.000Z");
  // The server's clock is five minutes ahead of the phone's in all of these.
  const AHEAD_MS = 5 * 60_000;

  /** Notes a response sent at sentAtMs that took roundTripMs, stamped by the server halfway through. */
  function respond(clock: ServerClock, sentAtMs: number, roundTripMs: number, aheadMs: number = AHEAD_MS): void {
    const stampedAt = sentAtMs + roundTripMs / 2 + aheadMs;
    clock.note(new Date(Math.floor(stampedAt / 1000) * 1000).toUTCString(), sentAtMs + roundTripMs, sentAtMs);
  }

  it("takes the server's time as the middle of the round trip, not its end", () => {
    const clock = createServerClock();

    // Sent at 12:00:00, answered four seconds later; the header says 12:05:02.
    clock.note("Tue, 01 Jun 2027 12:05:02 GMT", noon + 4_000, noon);

    expect(clock.offsetMs()).toBe(AHEAD_MS + 500);
    expect(clock.nowMs(noon + 4_000)).toBe(Date.parse("2027-06-01T12:05:04.500Z"));
  });

  it("keeps the offset from a fast response when a slow one follows", () => {
    const clock = createServerClock();
    respond(clock, noon, 100);
    const fromFast = clock.offsetMs();

    // Five seconds on a weak connection, nearly all of it the answer coming back.
    clock.note("Tue, 01 Jun 2027 12:05:10 GMT", noon + 15_000, noon + 10_000);

    expect(clock.offsetMs()).toBe(fromFast);
  });

  it("takes a faster response over the one it kept", () => {
    const clock = createServerClock();
    clock.note("Tue, 01 Jun 2027 12:05:00 GMT", noon + 5_000, noon);
    expect(clock.offsetMs()).toBe(AHEAD_MS - 2_000);

    respond(clock, noon + 10_000, 100);

    expect(Math.abs(clock.offsetMs() - AHEAD_MS)).toBeLessThanOrEqual(500);
  });

  it("takes a slower response once the kept one is over five minutes old", () => {
    const clock = createServerClock();
    respond(clock, noon, 100);

    clock.note("Tue, 01 Jun 2027 12:11:00 GMT", noon + 6 * 60_000 + 3_000, noon + 6 * 60_000);

    expect(clock.offsetMs()).toBe(AHEAD_MS - 1_000);
  });

  it("takes a slower response at once when the phone's clock was changed", () => {
    const clock = createServerClock();
    respond(clock, noon, 100);

    // A minute later the phone's clock is put forward two minutes: the server is now three ahead.
    const jumpMs = 2 * 60_000;
    respond(clock, noon + 60_000 + jumpMs, 2_000, AHEAD_MS - jumpMs);

    expect(Math.abs(clock.offsetMs() - (AHEAD_MS - jumpMs))).toBeLessThanOrEqual(500);
  });
});
