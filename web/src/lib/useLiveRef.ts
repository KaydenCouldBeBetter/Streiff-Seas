// "Is this screen still on screen?" for work that finishes after an await: a reply that lands
// after the screen closed must not set its state. True while mounted, false once unmounted.
//
// The flag is set back to true on every mount, not only cleared on unmount: React StrictMode
// (web/src/main.tsx) mounts, unmounts and mounts again in development, and a flag that is only
// ever cleared stays false after that, so every result is dropped and the screen sits on
// "Loading…" under `npm run dev` (test/useLiveRef.test.ts).

import { useEffect, useRef, type RefObject } from "react";

export function useLiveRef(): RefObject<boolean> {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return live;
}
