// web/src/lib/useLiveRef.ts under React StrictMode's development sequence: mount, unmount, mount.
// The repo has no DOM test library (adding one is a new dependency), so React's useRef and
// useEffect are stood in for here and the effect is run the way StrictMode runs it. Before this
// hook, eight screens kept a flag that only an unmount cleared, so under `npm run dev` every
// loaded result was dropped (the judge's review stuck on "Loading…").

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "./harness/pocketbase";

type Effect = () => void | (() => void);
const effects: Effect[] = [];

vi.mock("react", () => ({
  useRef: <T>(initial: T) => ({ current: initial }),
  useEffect: (effect: Effect) => {
    effects.push(effect);
  },
}));

const { useLiveRef } = await import("../web/src/lib/useLiveRef");

/** Calls the hook once, as a render does, and hands back its ref and its one effect. */
function render() {
  effects.length = 0;
  const live = useLiveRef();
  expect(effects).toHaveLength(1);
  return { live, effect: effects[0]! };
}

describe("useLiveRef", () => {
  it("is true while mounted and false once unmounted", () => {
    const { live, effect } = render();
    const cleanup = effect();
    expect(live.current).toBe(true);
    cleanup?.();
    expect(live.current).toBe(false);
  });

  it("is true again after StrictMode's mount, unmount and mount", () => {
    const { live, effect } = render();
    const first = effect();
    first?.();
    expect(live.current).toBe(false);
    const second = effect();
    expect(live.current).toBe(true);
    second?.();
    expect(live.current).toBe(false);
  });
});

describe("no screen keeps a flag that only unmounting touches", () => {
  // The broken shape: an effect whose body does nothing and whose cleanup sets a ref to false,
  // `useEffect(() => () => { x.current = false ... }, [])`. Use useLiveRef instead.
  const CLEANUP_ONLY = /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{[^}]*?\.current\s*=\s*false/;

  it("finds none in web/src", async () => {
    const files = (await readdir(path.join(REPO_ROOT, "web", "src"), { recursive: true }))
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => path.join(REPO_ROOT, "web", "src", file));
    expect(files.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const file of files) {
      if (CLEANUP_ONLY.test(await readFile(file, "utf8"))) offenders.push(path.relative(REPO_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("would have caught the old shape", () => {
    expect(CLEANUP_ONLY.test("useEffect(\n    () => () => {\n      live.current = false;\n    },\n    [],\n  );")).toBe(true);
    expect(CLEANUP_ONLY.test("useEffect(() => {\n    live.current = true;\n    return () => {\n      live.current = false;\n    };\n  }, []);")).toBe(false);
  });
});
