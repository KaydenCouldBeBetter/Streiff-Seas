// Whether the member has hidden the sidebar / icon rail on a wide window (decisions.md
// 2026-11-18). The choice lives in this browser's localStorage and nothing is sent to the server.
// Shown is the default. No DOM here, so tests can import it; the DOM side is sidebarStore.ts.

export const SIDEBAR_STORAGE_KEY = "cf-sidebar";

/** The two methods of Storage this module uses. */
export interface SidebarStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Anything but "hidden" (missing, old, edited by hand) reads as shown, the default. */
export function parseSidebarHidden(raw: unknown): boolean {
  return raw === "hidden";
}

/** The saved choice. Storage can be missing or throw (private window, blocked site data): shown then. */
export function readSidebarHidden(storage: SidebarStorage | null): boolean {
  try {
    return parseSidebarHidden(storage?.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Remembers the choice; false when the browser wouldn't keep it (the choice still holds until the page closes). */
export function writeSidebarHidden(storage: SidebarStorage | null, hidden: boolean): boolean {
  try {
    if (storage === null) return false;
    if (hidden) storage.setItem(SIDEBAR_STORAGE_KEY, "hidden");
    else storage.setItem(SIDEBAR_STORAGE_KEY, "shown");
    return true;
  } catch {
    return false;
  }
}
