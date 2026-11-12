import { describe, expect, it } from "vitest";
import { APPEARANCE_COPY, THEME_COLOR, THEME_STORAGE_KEY, iconSrc, parseTheme, readTheme, writeTheme, type ThemeStorage } from "../web/src/lib/theme";

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const blocked: ThemeStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("parseTheme", () => {
  it("reads only the exact word dark as Dark; everything else is Light, the default", () => {
    expect(parseTheme("dark")).toBe("dark");
    for (const raw of ["light", "", "Dark", "DARK", " dark", "1", null, undefined, 1, true, {}]) {
      expect(parseTheme(raw)).toBe("light");
    }
  });
});

describe("readTheme and writeTheme", () => {
  it("is Light on a phone that has never chosen", () => {
    expect(readTheme(memoryStorage())).toBe("light");
  });

  it("remembers the choice under one key, in both directions", () => {
    const storage = memoryStorage();
    expect(writeTheme(storage, "dark")).toBe(true);
    expect(storage.data).toEqual({ [THEME_STORAGE_KEY]: "dark" });
    expect(readTheme(storage)).toBe("dark");
    writeTheme(storage, "light");
    expect(readTheme(storage)).toBe("light");
  });

  it("falls back to Light when storage is missing or throws (private window, blocked site data)", () => {
    expect(readTheme(null)).toBe("light");
    expect(readTheme(blocked)).toBe("light");
  });

  it("reports false, and does not throw, when the phone won't keep the choice", () => {
    expect(writeTheme(null, "dark")).toBe(false);
    expect(writeTheme(blocked, "dark")).toBe(false);
  });

  it("ignores a value another version or a person put there", () => {
    expect(readTheme(memoryStorage({ [THEME_STORAGE_KEY]: "midnight" }))).toBe("light");
  });

  it("uses the key index.html reads before the first paint", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}") === "dark"`);
    expect(html).toContain(`setAttribute("content", "${THEME_COLOR.dark}")`);
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR.light}" />`);
  });
});

describe("iconSrc", () => {
  it("leaves every icon alone in Light", () => {
    expect(iconSrc("/icons/home.svg", "light")).toBe("/icons/home.svg");
  });

  it("points an icon at its Dark twin in Dark", () => {
    expect(iconSrc("/icons/home.svg", "dark")).toBe("/icons/dark/home.svg");
    expect(iconSrc("/icons/plus-on-primary.svg", "dark")).toBe("/icons/dark/plus-on-primary.svg");
  });

  it("does not rewrite a Dark path twice, nor a path outside /icons/", () => {
    expect(iconSrc("/icons/dark/home.svg", "dark")).toBe("/icons/dark/home.svg");
    expect(iconSrc("/fonts/InterVariable.woff2", "dark")).toBe("/fonts/InterVariable.woff2");
    expect(iconSrc("blob:https://club.example/photo", "dark")).toBe("blob:https://club.example/photo");
  });
});

describe("Appearance copy (Figma 197:10989)", () => {
  it("says it applies at once and is kept on this phone only", () => {
    expect(APPEARANCE_COPY.label).toBe("Dark mode");
    expect(APPEARANCE_COPY.detail).toBe("Applies right away, on this phone only. Light is easier to read in bright sun.");
  });
});
