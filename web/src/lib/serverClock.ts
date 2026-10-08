// "Now" comes from the server's clock (decisions.md 2026-10-05): the app corrects the
// phone's time by the offset seen in the Date header of its own API responses.

/** The Date header has whole-second resolution. */
const DATE_RESOLUTION_MS = 1000;

/** After this long, the next response replaces the kept one however slow it was. */
const SAMPLE_MAX_AGE_MS = 5 * 60_000;

interface Sample {
  offsetMs: number;
  roundTripMs: number;
  receivedAtMs: number;
}

export interface ServerClock {
  /**
   * Records one response's Date header. The server stamps it somewhere between the request
   * leaving (sentAtMs) and the headers arriving (receivedAtMs), both on the phone's clock,
   * so the offset is taken from the middle of that round trip, and from the middle of the
   * header's second. A missing or unreadable header leaves the kept offset in place.
   */
  note(dateHeader: string | null, receivedAtMs?: number, sentAtMs?: number): void;
  /** Milliseconds to add to the phone's clock to get the server's; 0 until a response is seen. */
  offsetMs(): number;
  /** The server's current time, in milliseconds since the epoch. */
  nowMs(phoneNowMs?: number): number;
}

/**
 * The shorter the round trip, the less the offset can be wrong, so a slow response doesn't
 * displace a faster one: it only takes over when the kept one is old, or when the two
 * can't both be right, which means the phone's clock was changed in between.
 */
function replaces(next: Sample, kept: Sample | undefined): boolean {
  if (kept === undefined) return true;
  if (next.roundTripMs <= kept.roundTripMs) return true;
  const ageMs = next.receivedAtMs - kept.receivedAtMs;
  if (ageMs < 0 || ageMs > SAMPLE_MAX_AGE_MS) return true;
  const slackMs = (next.roundTripMs + kept.roundTripMs) / 2 + DATE_RESOLUTION_MS;
  return Math.abs(next.offsetMs - kept.offsetMs) > slackMs;
}

export function createServerClock(): ServerClock {
  let kept: Sample | undefined;

  return {
    note(dateHeader, receivedAtMs = Date.now(), sentAtMs = receivedAtMs) {
      if (dateHeader === null) return;
      const serverMs = Date.parse(dateHeader);
      if (Number.isNaN(serverMs)) return;
      const roundTripMs = Math.max(0, receivedAtMs - sentAtMs);
      const next: Sample = {
        offsetMs: Math.round(serverMs + DATE_RESOLUTION_MS / 2 - (receivedAtMs - roundTripMs / 2)),
        roundTripMs,
        receivedAtMs,
      };
      if (replaces(next, kept)) kept = next;
    },
    offsetMs() {
      return kept?.offsetMs ?? 0;
    },
    nowMs(phoneNowMs = Date.now()) {
      return phoneNowMs + (kept?.offsetMs ?? 0);
    },
  };
}

/** The app's one clock, fed by the shared client in pb.ts. */
const clock = createServerClock();

/** ServerClock.note on the app's clock. */
export function noteServerDate(dateHeader: string | null, receivedAtMs?: number, sentAtMs?: number): void {
  clock.note(dateHeader, receivedAtMs, sentAtMs);
}

/** Milliseconds to add to the phone's clock to get the server's; 0 until a response is seen. */
export function clockOffsetMs(): number {
  return clock.offsetMs();
}

/** The server's current time, in milliseconds since the epoch. */
export function serverNowMs(phoneNowMs?: number): number {
  return clock.nowMs(phoneNowMs);
}
