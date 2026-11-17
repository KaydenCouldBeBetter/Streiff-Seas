// The systemd drafts in docs/drafts/systemd/ (M0-05b): what features.json and ops.md §1 ask of
// them, pinned, since `systemd-analyze verify` can't run here (Kayden runs it on the containers
// in M0-06).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./harness/pocketbase";

const DIR = path.join(REPO_ROOT, "docs", "drafts", "systemd");

/** Every `Key=value` line of a unit, comments and section headers left out. */
async function directives(name: string): Promise<[string, string][]> {
  const text = await readFile(path.join(DIR, name), "utf8");
  return text
    .split("\n")
    .filter((line) => /^[A-Za-z]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]);
}

function values(lines: [string, string][], key: string): string[] {
  return lines.filter(([k]) => k === key).map(([, v]) => v);
}

describe("scoreboard.service", () => {
  it("runs PocketBase as a non-root user on 127.0.0.1:8090 from the current release", async () => {
    const unit = await directives("scoreboard.service");

    expect(values(unit, "User")).toEqual(["scoreboard"]);
    const [exec] = values(unit, "ExecStart");
    expect(exec).toMatch(/^\/opt\/scoreboard\/current\/pocketbase serve /);
    expect(exec).toContain("--http=127.0.0.1:8090");
    expect(exec).toContain("--dir=/opt/scoreboard/pb_data");
    for (const dir of ["hooksDir", "migrationsDir", "publicDir"]) {
      expect(exec).toMatch(new RegExp(`--${dir}=/opt/scoreboard/current/pb_`));
    }
    expect(exec).toContain("--indexFallback=true");
    expect(exec).toContain("--hooksWatch=false");
  });

  it("has NoNewPrivileges and ProtectSystem=strict, with pb_data the only writable path", async () => {
    const unit = await directives("scoreboard.service");

    expect(values(unit, "NoNewPrivileges")).toEqual(["yes"]);
    expect(values(unit, "ProtectSystem")).toEqual(["strict"]);
    expect(values(unit, "ReadWritePaths")).toEqual(["/opt/scoreboard/pb_data"]);
    expect(values(unit, "PrivateTmp")).toEqual(["yes"]);
  });
});

describe("the staging deploy timer", () => {
  it("runs deploy.sh --staging as a oneshot", async () => {
    const unit = await directives("scoreboard-staging-deploy.service");

    expect(values(unit, "Type")).toEqual(["oneshot"]);
    expect(values(unit, "ExecStart")).toEqual(["/usr/local/sbin/scoreboard-deploy --staging"]);
  });

  it("starts it every 5 minutes", async () => {
    const timer = await directives("scoreboard-staging-deploy.timer");

    expect(values(timer, "OnUnitActiveSec")).toEqual(["5min"]);
    expect(values(timer, "Unit")).toEqual(["scoreboard-staging-deploy.service"]);
    expect(values(timer, "WantedBy")).toEqual(["timers.target"]);
  });
});
