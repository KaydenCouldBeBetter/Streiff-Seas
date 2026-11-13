// useLive (features.json M0-03): keeps a screen's data current over PocketBase realtime and says
// how current it is. The timing, the refetches and the badge live in liveTracker.ts (pure,
// tested with fake timers); this file only connects that to React, the SDK and the page's
// visibility.
//
// It subscribes to `catches` and to the hook's `heartbeat`, plus PB_CONNECT (every connect and
// reconnect, since the SDK replays nothing), and unsubscribes on unmount, including under
// React StrictMode's mount, unmount, mount in development.
//
// It assumes it is the app's only realtime user: after a failed first connect it clears the
// whole topic from the SDK (see sdkRealtime.subscribe).

import { useEffect, useState } from "react";
import { createLiveTracker, type LiveSnapshot, type LiveTopic, type RealtimePort } from "./liveTracker";
import { pb } from "./pb";
import { serverNowMs } from "./serverClock";

/** The SDK's subscription key for each topic. */
const SDK_KEY: Record<LiveTopic, string> = { PB_CONNECT: "PB_CONNECT", heartbeat: "heartbeat", catches: "catches/*" };

const sdkRealtime: RealtimePort = {
  async subscribe(topic, onMessage) {
    try {
      return topic === "catches"
        ? await pb.collection("catches").subscribe("*", () => onMessage())
        : await pb.realtime.subscribe(topic, () => onMessage());
    } catch (error) {
      // SDK 0.28.1 never retries a failed first connect, and keeps the listener it was given.
      // Clear it, so the tracker's next subscribe doesn't leave two behind.
      await pb.realtime.unsubscribe(SDK_KEY[topic]).catch(() => {});
      throw error;
    }
  },
  onDisconnect(handler) {
    // The SDK has one onDisconnect slot: chain to whatever was there, and put it back after.
    const previous = pb.realtime.onDisconnect;
    const mine = (subscriptions: string[]) => {
      previous?.(subscriptions);
      handler();
    };
    pb.realtime.onDisconnect = mine;
    return () => {
      if (pb.realtime.onDisconnect === mine) pb.realtime.onDisconnect = previous;
    };
  },
};

/**
 * The data `load` returns, kept current, and the badge (Live, Reconnecting, Updated h:mm).
 * `load` must be the same function on every render (define it outside the component).
 */
export function useLive<T>(load: () => Promise<T>): LiveSnapshot<T> {
  const [snapshot, setSnapshot] = useState<LiveSnapshot<T>>({ data: undefined, badge: { kind: "reconnecting" } });

  useEffect(() => {
    const tracker = createLiveTracker({ load, realtime: sdkRealtime, serverNow: () => serverNowMs(), onChange: setSnapshot });
    tracker.start();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tracker.visible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      tracker.dispose();
    };
  }, [load]);

  return snapshot;
}
