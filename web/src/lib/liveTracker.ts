// Whether a live screen's data is live, and what to do when it isn't (features.json M0-03;
// docs/dev-lifecycle-guide.md "The approach in one page"; screens.md LB-01a to LB-01c).
// PocketBase's stream sends nothing on its own, Cloudflare cuts idle reads at 125 s and the SDK
// never replays a missed event, so:
// - every realtime message (a catch change, the once-a-minute heartbeat, PB_CONNECT on every
//   connect and reconnect) refetches everything, since a catch that leaves a member's view
//   sends that member no event at all (R-CAT-L-09) and the heartbeat refetch is what drops it;
// - after 150 s with no message at all it polls, at once and then every 30 s, and stops when a
//   message comes again;
// - coming back to the page refetches, and checks the quiet time from timestamps, because a
//   sleeping phone freezes timers.
// - after FAILURE_LIMIT failed loads in a row it calls onRepeatedFailure (S2b; screens.md LB-01b,
//   SYS-04a), which useLive turns into a check for an expired Access session (accessReload.ts).
// The badge (decisions.md 2026-10-05 "Event status and the live badge use different words"):
// Live, Reconnecting, or "Updated 9:05 AM" in club time from the server's clock.
//
// Pure: no React, DOM or PocketBase here. useLive.ts connects it to the SDK and the page; the
// tests drive it with fake timers and a fake realtime port.

import { formatClubClock } from "./format";

/** No message at all for this long means the stream can't be trusted. */
export const QUIET_MS = 150_000;
/** How often to poll while the stream is quiet. */
export const POLL_MS = 30_000;
/** This many failed loads in a row count as "repeated network failures" (decisions.md 2026-10-05, Gap 19). */
export const FAILURE_LIMIT = 4;

export type LiveTopic = "PB_CONNECT" | "heartbeat" | "catches";
export const LIVE_TOPICS: readonly LiveTopic[] = ["PB_CONNECT", "heartbeat", "catches"];

export type Unsubscribe = () => Promise<void>;

/** The realtime side, as the tracker needs it. useLive.ts implements it with the SDK. */
export interface RealtimePort {
  /** Resolves once the server holds the subscription; rejects when the connection fails. */
  subscribe(topic: LiveTopic, onMessage: () => void): Promise<Unsubscribe>;
  /** Calls handler whenever the stream drops; returns a function that stops that. */
  onDisconnect(handler: () => void): () => void;
}

export type Badge = { kind: "live" } | { kind: "reconnecting" } | { kind: "updated"; atMs: number };

export interface LiveSnapshot<T> {
  /** The last data loaded, kept while reconnecting; undefined until the first load succeeds. */
  data: T | undefined;
  badge: Badge;
}

export interface LiveTrackerOptions<T> {
  load: () => Promise<T>;
  realtime: RealtimePort;
  /** The server's time now (serverClock), for the "Updated" label. The phone's clock by default. */
  serverNow?: () => number;
  onChange: (snapshot: LiveSnapshot<T>) => void;
  /** Called each time FAILURE_LIMIT loads in a row have failed; the count then starts again. */
  onRepeatedFailure?: () => void;
}

export interface LiveTracker<T> {
  start(): void;
  /** The page became visible again. */
  visible(): void;
  /** Stops every timer and drops every subscription, including ones that settle later. */
  dispose(): void;
  snapshot(): LiveSnapshot<T>;
}

export function badgeText(badge: Badge): string {
  switch (badge.kind) {
    case "live":
      return "Live";
    case "reconnecting":
      return "Reconnecting";
    case "updated":
      return `Updated ${formatClubClock(new Date(badge.atMs))}`;
  }
}

interface FetchResult {
  ok: boolean;
  /** Which fetch this was, in the order they started. */
  seq: number;
  /** Server time it finished, for the label. */
  atMs: number;
}

export function createLiveTracker<T>(options: LiveTrackerOptions<T>): LiveTracker<T> {
  const { load, realtime } = options;
  const serverNow = options.serverNow ?? (() => Date.now());

  let disposed = false;
  let data: T | undefined;
  let streamUp = false;
  let lastMessageAt = Date.now();
  let wasLive = false;
  /** Fetches are numbered as they start; only one started after Live was lost can say "Updated". */
  let fetchSeq = 0;
  let lostLiveAfterSeq = 0;
  let lastFetch: FetchResult | undefined;
  let fetching = false;
  let fetchAgain = false;
  /** Failed loads since the last one that worked. */
  let failures = 0;
  let needsResubscribe = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let stopDisconnect: (() => void) | undefined;
  let subscriptions: Promise<Unsubscribe>[] = [];

  const quiet = (now: number) => now - lastMessageAt >= QUIET_MS;
  const live = (now: number) => streamUp && !quiet(now);

  function badge(): Badge {
    const now = Date.now();
    if (live(now)) return { kind: "live" };
    if (lastFetch?.ok && lastFetch.seq > lostLiveAfterSeq) return { kind: "updated", atMs: lastFetch.atMs };
    return { kind: "reconnecting" };
  }

  function snapshot(): LiveSnapshot<T> {
    return { data, badge: badge() };
  }

  /** Notes the moment Live was lost, then tells the page. */
  function emit(): void {
    if (disposed) return;
    const isLive = live(Date.now());
    if (wasLive && !isLive) lostLiveAfterSeq = fetchSeq;
    wasLive = isLive;
    options.onChange(snapshot());
  }

  function refetch(): void {
    if (disposed) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    const seq = ++fetchSeq;
    Promise.resolve()
      .then(load)
      .then(
        (loaded) => {
          if (disposed) return;
          data = loaded;
          failures = 0;
          lastFetch = { ok: true, seq, atMs: serverNow() };
          // The server answers, so a stream that never connected may now.
          if (needsResubscribe) subscribeAll();
        },
        () => {
          if (disposed) return;
          lastFetch = { ok: false, seq, atMs: serverNow() };
          failures++;
          if (failures >= FAILURE_LIMIT) {
            failures = 0;
            options.onRepeatedFailure?.();
          }
        },
      )
      .finally(() => {
        fetching = false;
        if (disposed) return;
        emit();
        if (fetchAgain) {
          fetchAgain = false;
          refetch();
        }
      });
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function startPolling(): void {
    if (pollTimer !== undefined) return;
    pollTimer = setInterval(refetch, POLL_MS);
    // Note that Live is lost before the poll starts, so the poll's answer can say "Updated".
    emit();
    refetch();
  }

  function armQuietTimer(): void {
    if (quietTimer !== undefined) clearTimeout(quietTimer);
    quietTimer = setTimeout(
      () => {
        quietTimer = undefined;
        if (quiet(Date.now())) startPolling();
        else armQuietTimer();
      },
      Math.max(0, lastMessageAt + QUIET_MS - Date.now()),
    );
  }

  function message(): void {
    if (disposed) return;
    // Anything that arrives came down the stream, so the stream works.
    streamUp = true;
    lastMessageAt = Date.now();
    stopPolling();
    armQuietTimer();
    refetch();
    emit();
  }

  function subscribeAll(): void {
    needsResubscribe = false;
    const attempt = LIVE_TOPICS.map((topic) => realtime.subscribe(topic, message));
    subscriptions.push(...attempt);
    void Promise.allSettled(attempt).then((results) => {
      if (results.every((result) => result.status === "fulfilled")) return;
      // The connection failed (the SDK never retries a failed first connect). Drop whatever did
      // subscribe and try again after the next fetch that reaches the server.
      subscriptions = subscriptions.filter((handle) => !attempt.includes(handle));
      for (const result of results) if (result.status === "fulfilled") void result.value().catch(() => {});
      if (disposed) return;
      streamUp = false;
      needsResubscribe = true;
      emit();
    });
  }

  return {
    start() {
      if (disposed) return;
      lastMessageAt = Date.now();
      stopDisconnect = realtime.onDisconnect(() => {
        if (disposed) return;
        streamUp = false;
        emit();
      });
      armQuietTimer();
      subscribeAll();
      refetch();
      emit();
    },
    visible() {
      if (disposed) return;
      // Timers may have been frozen while the page was hidden: go by the timestamps.
      if (quiet(Date.now()) && pollTimer === undefined) {
        if (quietTimer !== undefined) clearTimeout(quietTimer);
        quietTimer = undefined;
        startPolling();
      } else {
        refetch();
        emit();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (quietTimer !== undefined) clearTimeout(quietTimer);
      stopPolling();
      stopDisconnect?.();
      // A subscribe that settles after this (React StrictMode mounts, unmounts and mounts again
      // at once) is undone as soon as it does.
      for (const handle of subscriptions) void handle.then((unsubscribe) => unsubscribe()).catch(() => {});
      subscriptions = [];
    },
    snapshot,
  };
}
