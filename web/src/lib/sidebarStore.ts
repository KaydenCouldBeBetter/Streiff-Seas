// The DOM side of the sidebar choice (see sidebarPref.ts). One value for the whole app, so every
// screen's shell agrees and a screen change doesn't reset it. Also follows a change made in
// another tab. The choice only has an effect from 600 px up (responsive.css); a phone ignores it.

import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY, readSidebarHidden, writeSidebarHidden } from "./sidebarPref";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let hidden: boolean | null = null;
const listeners = new Set<() => void>();

function current(): boolean {
  if (hidden === null) hidden = readSidebarHidden(browserStorage());
  return hidden;
}

function set(next: boolean) {
  hidden = next;
  for (const listener of listeners) listener();
}

/** Applies right away and remembers it in this browser. */
export function setSidebarHidden(next: boolean) {
  set(next);
  writeSidebarHidden(browserStorage(), next);
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function onStorage(event: StorageEvent) {
  if (event.key === SIDEBAR_STORAGE_KEY || event.key === null) set(readSidebarHidden(browserStorage()));
}

export function useSidebarHidden(): boolean {
  return useSyncExternalStore(subscribe, current, () => false);
}
