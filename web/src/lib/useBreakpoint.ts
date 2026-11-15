// The current layout size, kept in step with the window by the browser's own media queries (so
// em breakpoints follow the member's text size). Screens use it only where the structure
// differs (a table instead of rows, list and detail side by side); everything else is CSS.

import { useSyncExternalStore } from "react";
import { EXPANDED_QUERY, MEDIUM_QUERY, type Breakpoint } from "./breakpoints";

function subscribe(onChange: () => void): () => void {
  const lists = [window.matchMedia(MEDIUM_QUERY), window.matchMedia(EXPANDED_QUERY)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function snapshot(): Breakpoint {
  if (window.matchMedia(EXPANDED_QUERY).matches) return "expanded";
  if (window.matchMedia(MEDIUM_QUERY).matches) return "medium";
  return "compact";
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, snapshot, () => "compact");
}
