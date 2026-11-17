// After repeated network failures, reload only when Cloudflare Access is what answers (features.json
// S2b step 4; web/src/lib/accessReload.ts), and the tracker's count of failed loads that starts it
// (web/src/lib/liveTracker.ts). The real Access redirect is checked in the M0-07 soak; here a fake
// browser answers the probe each way.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_PATH, LAST_RELOAD_KEY, RELOAD_GAP_MS, probe, reloadIfAccessExpired, type ReloadPort } from "../web/src/lib/accessReload";
import { FAILURE_LIMIT, createLiveTracker, type RealtimePort } from "../web/src/lib/liveTracker";

type Answer = { type?: Response["type"]; status: number; contentType?: string } | "network-error";

function fakeBrowser(answer: Answer, options: { online?: boolean; storage?: Map<string, string> | "blocked"; now?: number } = {}) {
  const store = options.storage ?? new Map<string, string>();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let reloads = 0;
  const port: ReloadPort = {
    async fetch(url, init) {
      calls.push({ url, init });
      if (answer === "network-error") throw new TypeError("Failed to fetch");
      return { type: answer.type ?? "basic", status: answer.status, headers: new Headers(answer.contentType ? { "content-type": answer.contentType } : {}) };
    },
    online: () => options.online ?? true,
    reload: () => void reloads++,
    now: () => options.now ?? 10 * RELOAD_GAP_MS,
    storage: {
      getItem(key) {
        if (store === "blocked") throw new DOMException("blocked", "SecurityError");
        return store.get(key) ?? null;
      },
      setItem(key, value) {
        if (store === "blocked") throw new DOMException("blocked", "SecurityError");
        store.set(key, value);
      },
    },
  };
  return { port, calls, reloads: () => reloads, store };
}

const POCKETBASE_OK: Answer = { status: 200, contentType: "application/json" };
const ACCESS_REDIRECT: Answer = { type: "opaqueredirect", status: 0 };

describe("probe", () => {
  it("asks /api/health without following redirects or using the cache", async () => {
    const browser = fakeBrowser(POCKETBASE_OK);
    await probe(browser.port);
    expect(browser.calls).toEqual([{ url: HEALTH_PATH, init: { redirect: "manual", cache: "no-store", credentials: "same-origin" } }]);
  });

  it.each<[string, Answer, string]>([
    ["PocketBase's JSON", POCKETBASE_OK, "pocketbase"],
    ["PocketBase's JSON refusal (rate limit)", { status: 429, contentType: "application/json; charset=utf-8" }, "pocketbase"],
    ["a redirect to the Access login", ACCESS_REDIRECT, "access"],
    ["a plain 302", { status: 302 }, "access"],
    ["an Access block page", { status: 403, contentType: "text/html" }, "access"],
    ["a 200 that isn't JSON", { status: 200, contentType: "text/html" }, "access"],
    ["a 5xx from Cloudflare (tunnel or server down)", { status: 530, contentType: "text/html" }, "down"],
    ["a 502", { status: 502 }, "down"],
    ["no answer", "network-error", "down"],
  ])("reads %s as %s", async (_name, answer, expected) => {
    expect(await probe(fakeBrowser(answer).port)).toBe(expected);
  });
});

describe("reloadIfAccessExpired", () => {
  it("reloads when Access answers, and remembers when", async () => {
    const browser = fakeBrowser(ACCESS_REDIRECT, { now: 5 * RELOAD_GAP_MS });
    expect(await reloadIfAccessExpired(browser.port)).toBe(true);
    expect(browser.reloads()).toBe(1);
    expect((browser.store as Map<string, string>).get(LAST_RELOAD_KEY)).toBe(String(5 * RELOAD_GAP_MS));
  });

  it.each<[string, Answer]>([
    ["PocketBase answers", POCKETBASE_OK],
    ["the server is down", { status: 502 }],
    ["nothing answers", "network-error"],
  ])("keeps the page when %s", async (_name, answer) => {
    const browser = fakeBrowser(answer);
    expect(await reloadIfAccessExpired(browser.port)).toBe(false);
    expect(browser.reloads()).toBe(0);
  });

  it("doesn't even ask while the browser says it is offline", async () => {
    const browser = fakeBrowser(ACCESS_REDIRECT, { online: false });
    expect(await reloadIfAccessExpired(browser.port)).toBe(false);
    expect(browser.calls).toEqual([]);
    expect(browser.reloads()).toBe(0);
  });

  it("reloads at most once in 5 minutes, so a misread can't loop", async () => {
    const now = 10 * RELOAD_GAP_MS;
    const storage = new Map([[LAST_RELOAD_KEY, String(now - RELOAD_GAP_MS + 1)]]);
    expect(await reloadIfAccessExpired(fakeBrowser(ACCESS_REDIRECT, { now, storage }).port)).toBe(false);

    storage.set(LAST_RELOAD_KEY, String(now - RELOAD_GAP_MS));
    const browser = fakeBrowser(ACCESS_REDIRECT, { now, storage });
    expect(await reloadIfAccessExpired(browser.port)).toBe(true);
    expect(browser.reloads()).toBe(1);
  });

  it("never reloads when it can't remember the last reload (storage blocked)", async () => {
    const browser = fakeBrowser(ACCESS_REDIRECT, { storage: "blocked" });
    expect(await reloadIfAccessExpired(browser.port)).toBe(false);
    expect(browser.reloads()).toBe(0);
  });
});

describe("liveTracker: repeated failures", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A stream that never connects, so only the load decides what happens. */
  const silent: RealtimePort = { subscribe: () => new Promise(() => {}), onDisconnect: () => () => {} };

  it(`calls onRepeatedFailure once ${FAILURE_LIMIT} loads in a row have failed, then counts again`, async () => {
    const load = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const onRepeatedFailure = vi.fn();
    const tracker = createLiveTracker({ load, realtime: silent, onChange: () => {}, onRepeatedFailure });
    tracker.start();
    await vi.advanceTimersByTimeAsync(0);

    for (let i = 1; i < FAILURE_LIMIT; i++) {
      tracker.visible();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(load).toHaveBeenCalledTimes(FAILURE_LIMIT);
    expect(onRepeatedFailure).toHaveBeenCalledTimes(1);

    for (let i = 0; i < FAILURE_LIMIT - 1; i++) {
      tracker.visible();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(onRepeatedFailure).toHaveBeenCalledTimes(1);
    tracker.visible();
    await vi.advanceTimersByTimeAsync(0);
    expect(onRepeatedFailure).toHaveBeenCalledTimes(2);
    tracker.dispose();
  });

  it("starts the count again after a load that works", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new TypeError("Failed to fetch");
      return "board";
    });
    const onRepeatedFailure = vi.fn();
    const tracker = createLiveTracker({ load, realtime: silent, onChange: () => {}, onRepeatedFailure });
    tracker.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 1; i < FAILURE_LIMIT - 1; i++) {
      tracker.visible();
      await vi.advanceTimersByTimeAsync(0);
    }

    fail = false;
    tracker.visible();
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    for (let i = 0; i < FAILURE_LIMIT - 1; i++) {
      tracker.visible();
      await vi.advanceTimersByTimeAsync(0);
    }

    expect(onRepeatedFailure).not.toHaveBeenCalled();
    tracker.dispose();
  });
});
