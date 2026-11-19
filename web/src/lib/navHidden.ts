// Whether the sidebar (from 1024 px) or the rail (600 to 1023 px) is hidden, so the page gets the
// whole width (Kayden, decisions.md 2026-11-18). A per-browser convenience, remembered in this
// browser's localStorage like the theme; storage that's missing or refuses reads as shown, and a
// write that fails still hides it for this visit. Pure: the storage is passed in.

export const NAV_HIDDEN_KEY = "streiff-nav-hidden";

export function readNavHidden(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(NAV_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeNavHidden(storage: Pick<Storage, "setItem" | "removeItem"> | null, hidden: boolean): void {
  try {
    if (hidden) storage?.setItem(NAV_HIDDEN_KEY, "1");
    else storage?.removeItem(NAV_HIDDEN_KEY);
  } catch {
    // Private mode or blocked storage: it stays hidden (or shown) until the page reloads.
  }
}
