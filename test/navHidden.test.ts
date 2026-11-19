// The sidebar and rail's Hide menu (decisions.md 2026-11-18): remembered per browser in
// localStorage, and storage that's missing or refuses never breaks the page. Pure.

import { describe, expect, it } from "vitest";
import { NAV_HIDDEN_KEY, readNavHidden, writeNavHidden } from "../web/src/lib/navHidden";

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as Storage;
}

const refusing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("navHidden", () => {
  it("reads as shown until hidden, then remembers hidden, then shown again", () => {
    const storage = memory();
    expect(readNavHidden(storage)).toBe(false);
    writeNavHidden(storage, true);
    expect(storage.getItem(NAV_HIDDEN_KEY)).toBe("1");
    expect(readNavHidden(storage)).toBe(true);
    writeNavHidden(storage, false);
    expect(storage.getItem(NAV_HIDDEN_KEY)).toBeNull();
    expect(readNavHidden(storage)).toBe(false);
  });

  it("reads as shown with no storage or storage that refuses, and a refused write doesn't throw", () => {
    expect(readNavHidden(null)).toBe(false);
    expect(readNavHidden(refusing)).toBe(false);
    expect(() => writeNavHidden(refusing, true)).not.toThrow();
    expect(() => writeNavHidden(null, true)).not.toThrow();
  });
});
