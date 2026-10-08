// "Now" comes from the server's clock (decisions.md 2026-10-05): the app corrects the
// phone's time by the offset seen in the Date header of its own API responses.

let offsetMs = 0;

/**
 * Records the offset from one response's Date header. The header has whole-second
 * resolution, so the server's time is taken as the middle of that second. A missing
 * or unreadable header leaves the last offset in place.
 */
export function noteServerDate(dateHeader: string | null, receivedAtMs: number = Date.now()): void {
  if (dateHeader === null) return;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs + 500 - receivedAtMs;
}

/** Milliseconds to add to the phone's clock to get the server's; 0 until a response is seen. */
export function clockOffsetMs(): number {
  return offsetMs;
}

/** The server's current time, in milliseconds since the epoch. */
export function serverNowMs(phoneNowMs: number = Date.now()): number {
  return phoneNowMs + offsetMs;
}
