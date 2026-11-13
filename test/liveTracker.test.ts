// web/src/lib/liveTracker.ts: the timing, subscriptions and badge behind useLive (features.json
// M0-03 step 4), with Vitest's fake timers and a fake realtime port. The real stream is checked
// by hand (the M0-03 manual checks) and in the M0-07 soak.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  POLL_MS,
  QUIET_MS,
  badgeText,
  createLiveTracker,
  type LiveSnapshot,
  type LiveTopic,
  type LiveTracker,
  type RealtimePort,
} from "../web/src/lib/liveTracker";

interface Pending {
  topic: LiveTopic;
  onMessage: () => void;
  resolve: (unsubscribe: () => Promise<void>) => void;
  reject: (error: Error) => void;
}

/** A realtime port whose connection the test opens, fails and drops by hand. */
function fakeRealtime() {
  const pending: Pending[] = [];
  const listeners: Array<{ topic: LiveTopic; onMessage: () => void }> = [];
  const disconnectHandlers = new Set<() => void>();
  let subscribeCalls = 0;

  const port: RealtimePort = {
    subscribe(topic, onMessage) {
      subscribeCalls++;
      return new Promise((resolve, reject) => pending.push({ topic, onMessage, resolve, reject }));
    },
    onDisconnect(handler) {
      disconnectHandlers.add(handler);
      return () => disconnectHandlers.delete(handler);
    },
  };

  return {
    port,
    /** The server takes every waiting subscription. */
    connect() {
      for (const p of pending.splice(0)) {
        const listener = { topic: p.topic, onMessage: p.onMessage };
        listeners.push(listener);
        p.resolve(async () => {
          listeners.splice(listeners.indexOf(listener), 1);
        });
      }
    },
    /** The first connect fails: every waiting subscription is refused. */
    fail() {
      for (const p of pending.splice(0)) p.reject(new Error("Failed to establish realtime connection."));
    },
    send(topic: LiveTopic) {
      for (const listener of listeners.filter((l) => l.topic === topic)) listener.onMessage();
    },
    drop() {
      for (const handler of disconnectHandlers) handler();
    },
    listening: (topic: LiveTopic) => listeners.filter((l) => l.topic === topic).length,
    disconnectListeners: () => disconnectHandlers.size,
    subscribeCalls: () => subscribeCalls,
  };
}

/** Runs due timers and settles promises. */
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

type Fake = ReturnType<typeof fakeRealtime>;

function setup(realtime: Fake = fakeRealtime(), load = vi.fn(async () => "board")) {
  let last: LiveSnapshot<string> | undefined;
  const tracker: LiveTracker<string> = createLiveTracker({
    load,
    realtime: realtime.port,
    onChange: (snapshot) => (last = snapshot),
  });
  return { tracker, realtime, load, last: () => last, badge: () => tracker.snapshot().badge.kind };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T13:05:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("liveTracker", () => {
  it("is Reconnecting until the stream connects, then Live, refetching on connect", async () => {
    const { tracker, realtime, load, badge, last } = setup();
    tracker.start();
    expect(badge()).toBe("reconnecting");
    await tick();
    expect(load).toHaveBeenCalledTimes(1);

    realtime.connect();
    await tick();
    realtime.send("PB_CONNECT");
    await tick();

    expect(badge()).toBe("live");
    expect(load).toHaveBeenCalledTimes(2);
    expect(last()?.data).toBe("board");
  });

  it("refetches on every heartbeat and every catch change, and stays Live", async () => {
    const { tracker, realtime, load, badge } = setup();
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();
    const loads = load.mock.calls.length;

    await tick(60_000);
    realtime.send("heartbeat");
    await tick();
    realtime.send("catches");
    await tick();

    expect(load).toHaveBeenCalledTimes(loads + 2);
    expect(badge()).toBe("live");
  });

  it("after 150 s with nothing at all, polls at once and every 30 s, with Updated from the poll's server time", async () => {
    const { tracker, realtime, load, badge } = setup();
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();
    const loads = load.mock.calls.length;

    await tick(QUIET_MS - 1);
    expect(badge()).toBe("live");
    expect(load).toHaveBeenCalledTimes(loads);

    await tick(1);
    expect(load).toHaveBeenCalledTimes(loads + 1);
    const badgeNow = tracker.snapshot().badge;
    expect(badgeNow.kind).toBe("updated");
    // 13:05:00 UTC + 150 s is 9:07 AM in club time (EDT), whatever the machine's zone.
    expect(badgeText(badgeNow)).toBe("Updated 9:07 AM");

    await tick(POLL_MS);
    expect(load).toHaveBeenCalledTimes(loads + 2);
    await tick(POLL_MS);
    expect(load).toHaveBeenCalledTimes(loads + 3);
  });

  it("reads Reconnecting after a failed poll and Updated after the next good one", async () => {
    const load = vi.fn(async () => "board");
    const { tracker, realtime, badge } = setup(undefined, load);
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();

    load.mockRejectedValueOnce(new Error("offline"));
    await tick(QUIET_MS);
    expect(badge()).toBe("reconnecting");

    await tick(POLL_MS);
    expect(badge()).toBe("updated");
  });

  it("stops polling when a message comes again", async () => {
    const { tracker, realtime, load, badge } = setup();
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick(QUIET_MS);
    expect(badge()).toBe("updated");

    realtime.send("heartbeat");
    await tick();
    expect(badge()).toBe("live");
    const loads = load.mock.calls.length;

    await tick(QUIET_MS - 1);
    expect(load).toHaveBeenCalledTimes(loads);
  });

  it("reads Reconnecting as soon as the stream drops, and polls only after 150 s of silence", async () => {
    const { tracker, realtime, load, badge } = setup();
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();
    const loads = load.mock.calls.length;

    realtime.drop();
    expect(badge()).toBe("reconnecting");

    await tick(QUIET_MS - 1);
    expect(load).toHaveBeenCalledTimes(loads);
    await tick(1);
    expect(load).toHaveBeenCalledTimes(loads + 1);
    // The server answers HTTP though the stream is down: the data is as of that poll.
    expect(badge()).toBe("updated");

    realtime.send("PB_CONNECT");
    await tick();
    expect(badge()).toBe("live");
  });

  it("refetches when the page is visible again, and polls if the quiet time passed while timers were frozen", async () => {
    const { tracker, realtime, load, badge } = setup();
    tracker.start();
    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();
    const loads = load.mock.calls.length;

    tracker.visible();
    await tick();
    expect(load).toHaveBeenCalledTimes(loads + 1);

    // A phone asleep for 4 minutes: the clock moves, no timer runs.
    vi.setSystemTime(Date.now() + 240_000);
    tracker.visible();
    await tick();
    expect(load).toHaveBeenCalledTimes(loads + 2);
    expect(badge()).toBe("updated");
    await tick(POLL_MS);
    expect(load).toHaveBeenCalledTimes(loads + 3);
  });

  it("refetches one at a time, folding requests made meanwhile into one more", async () => {
    let finish: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const { tracker, realtime } = setup(undefined, load);
    tracker.start();
    realtime.connect();
    await tick();
    expect(load).toHaveBeenCalledTimes(1);

    realtime.send("PB_CONNECT");
    realtime.send("catches");
    realtime.send("heartbeat");
    await tick();
    expect(load).toHaveBeenCalledTimes(1);

    finish("first");
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    finish("second");
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("subscribes again after the next good fetch when the first connect fails", async () => {
    const { tracker, realtime, badge } = setup();
    tracker.start();
    await tick();
    expect(realtime.subscribeCalls()).toBe(3);

    realtime.fail();
    await tick();
    expect(badge()).toBe("updated");
    expect(realtime.subscribeCalls()).toBe(3);

    tracker.visible();
    await tick();
    expect(realtime.subscribeCalls()).toBe(6);

    realtime.connect();
    realtime.send("PB_CONNECT");
    await tick();
    expect(badge()).toBe("live");
    expect(realtime.listening("heartbeat")).toBe(1);
  });

  it("under StrictMode's mount, unmount, mount, drops the first mount's subscriptions once they settle", async () => {
    const realtime = fakeRealtime();
    const first = setup(realtime);
    const second = setup(realtime);

    first.tracker.start();
    first.tracker.dispose();
    second.tracker.start();
    // The connection opens only now, after the first mount is gone.
    realtime.connect();
    await tick();

    for (const topic of ["PB_CONNECT", "heartbeat", "catches"] as const) expect(realtime.listening(topic)).toBe(1);
    expect(realtime.disconnectListeners()).toBe(1);

    const firstLoads = first.load.mock.calls.length;
    realtime.send("heartbeat");
    await tick();
    expect(first.load).toHaveBeenCalledTimes(firstLoads);
    expect(second.badge()).toBe("live");
  });

  it("leaves no timer, subscription or late update behind after dispose", async () => {
    let finish: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const { tracker, realtime, last } = setup(undefined, load);
    tracker.start();
    realtime.connect();
    await tick(QUIET_MS);
    const before = last();

    tracker.dispose();
    finish("late");
    await tick();

    expect(vi.getTimerCount()).toBe(0);
    for (const topic of ["PB_CONNECT", "heartbeat", "catches"] as const) expect(realtime.listening(topic)).toBe(0);
    expect(realtime.disconnectListeners()).toBe(0);
    expect(last()).toBe(before);
  });
});
