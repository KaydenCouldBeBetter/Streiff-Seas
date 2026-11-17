// After repeated network failures, reload the page if Cloudflare Access wants a sign-in
// (features.json S2b step 4; screens.md LB-01b, SYS-04a; decisions.md 2026-10-05 "Sign-in
// wording", 2026-11-17 "Reload only when Access answers").
//
// When the 7-day Access session runs out, every API request is answered by Access, not
// PocketBase: a redirect to the Access login, which fetch() reports as a network error. Only a
// full page load can show that login. A reload while the phone is offline or while the server is
// down would swap the app for the browser's or Cloudflare's error page, so first ask
// /api/health with redirect "manual":
// - a redirect (an opaque one, to the Access login), or an answer under 500 that isn't
//   PocketBase's JSON (an Access block page): reload;
// - PocketBase's JSON, a 5xx (the tunnel or server is down), no answer, or the browser
//   offline: keep the page, which goes on saying Reconnecting.
// At most one reload every 5 minutes, remembered in sessionStorage, so a probe that misreads
// something can't loop. Checked through the real Access in the M0-07 soak.
//
// No DOM globals here: useLive.ts passes the browser's in, so the tests drive every case.

export const HEALTH_PATH = "/api/health";
/** At most one reload in this long. */
export const RELOAD_GAP_MS = 5 * 60_000;
export const LAST_RELOAD_KEY = "cf-access-reload";

/** What the probe needs from the browser. */
export interface ReloadPort {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "type" | "status" | "headers">>;
  /** navigator.onLine: false means the phone knows it has no network. */
  online: () => boolean;
  reload: () => void;
  now: () => number;
  /** sessionStorage; reads and writes may throw (private windows). */
  storage: Pick<Storage, "getItem" | "setItem">;
}

export type ProbeAnswer = "access" | "pocketbase" | "down";

/** Who answered the health check: Access (sign in again), PocketBase (it's up), or nobody useful. */
export async function probe(port: Pick<ReloadPort, "fetch">): Promise<ProbeAnswer> {
  let response: Pick<Response, "type" | "status" | "headers">;
  try {
    response = await port.fetch(HEALTH_PATH, { redirect: "manual", cache: "no-store", credentials: "same-origin" });
  } catch {
    return "down";
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) return "access";
  if (response.status >= 500 || response.status === 0) return "down";
  const json = (response.headers.get("content-type") ?? "").includes("application/json");
  return json ? "pocketbase" : "access";
}

/** Probes, and reloads the page when Access answered and no reload happened in the last 5 minutes. True when it reloaded. */
export async function reloadIfAccessExpired(port: ReloadPort): Promise<boolean> {
  if (!port.online()) return false;
  if ((await probe(port)) !== "access") return false;
  let last = 0;
  try {
    last = Number(port.storage.getItem(LAST_RELOAD_KEY)) || 0;
  } catch {
    // No storage: the gap can't be kept across the reload, so don't risk a loop.
    return false;
  }
  const now = port.now();
  if (now - last < RELOAD_GAP_MS) return false;
  try {
    port.storage.setItem(LAST_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  port.reload();
  return true;
}

