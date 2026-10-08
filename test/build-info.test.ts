import { describe, expect, it } from "vitest";
import { buildInfo } from "../web/build-info";

const now = new Date("2027-06-01T12:00:00.000Z");

describe("build.json contents", () => {
  it("uses the commit CI is building", () => {
    const sha = "240206f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";

    expect(buildInfo({ GITHUB_SHA: sha }, now)).toEqual({ sha, built_at: "2027-06-01T12:00:00.000Z" });
  });

  it('says "dev" outside CI', () => {
    expect(buildInfo({}, now).sha).toBe("dev");
  });

  it('says "dev" when GITHUB_SHA is not a full commit sha', () => {
    expect(buildInfo({ GITHUB_SHA: "main" }, now).sha).toBe("dev");
  });
});
