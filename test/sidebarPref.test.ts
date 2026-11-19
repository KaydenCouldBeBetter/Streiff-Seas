import { describe, expect, it } from "vitest";
import { SIDEBAR_STORAGE_KEY, parseSidebarHidden, readSidebarHidden, writeSidebarHidden, type SidebarStorage } from "../web/src/lib/sidebarPref";

function fakeStorage(initial: Record<string, string> = {}): SidebarStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const blocked: SidebarStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

describe("sidebar choice", () => {
  it("is shown unless the saved value is exactly 'hidden'", () => {
    expect(parseSidebarHidden("hidden")).toBe(true);
    for (const raw of [null, undefined, "", "shown", "true", "Hidden", 1, {}]) expect(parseSidebarHidden(raw)).toBe(false);
  });

  it("reads what was written, and shown on a first visit", () => {
    const storage = fakeStorage();
    expect(readSidebarHidden(storage)).toBe(false);
    expect(writeSidebarHidden(storage, true)).toBe(true);
    expect(storage.data[SIDEBAR_STORAGE_KEY]).toBe("hidden");
    expect(readSidebarHidden(storage)).toBe(true);
    expect(writeSidebarHidden(storage, false)).toBe(true);
    expect(readSidebarHidden(storage)).toBe(false);
  });

  it("works without storage: shown, and the write reports it wasn't kept", () => {
    expect(readSidebarHidden(null)).toBe(false);
    expect(writeSidebarHidden(null, true)).toBe(false);
    expect(readSidebarHidden(blocked)).toBe(false);
    expect(writeSidebarHidden(blocked, true)).toBe(false);
  });
});
