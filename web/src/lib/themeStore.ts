// The DOM side of the appearance choice (see theme.ts): sets data-theme on <html>, which the
// tokens in index.css follow, keeps the browser's theme-color in step, and lets React read it.
// index.html runs the same first step inline before the first paint, so Dark never flashes Light.

import { useSyncExternalStore } from "react";
import { THEME_COLOR, THEME_STORAGE_KEY, readTheme, writeTheme, type Theme } from "./theme";

function phoneStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let current: Theme = "light";
const listeners = new Set<() => void>();

function show(theme: Theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  for (const listener of listeners) listener();
}

/** Call once before the first render. Also follows a change made in another tab of this app. */
export function initTheme() {
  show(readTheme(phoneStorage()));
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) show(readTheme(phoneStorage()));
  });
}

/** Applies right away and remembers it on this phone. */
export function setTheme(theme: Theme) {
  show(theme);
  writeTheme(phoneStorage(), theme);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current, () => "light");
}
