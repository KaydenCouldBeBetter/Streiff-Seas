// scripts/deploy.sh against a pretend server (test/harness/deployKit.ts): GitHub, the PocketBase
// download and the Cloudflare smoke URL are curl shims, systemctl and sqlite3 are shims, and the
// rest (tar, zstd, unzip, sha256sum, jq) is real. Never run against prod or staging (M0-05b).

import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CF_SECRET,
  GITHUB_API,
  HEALTHCHECKS_URL,
  PB_BASE,
  REPO,
  TOKEN,
  backupNames,
  commit,
  makeBundle,
  makeServer,
  pbZip,
  pinFile,
  publishMainBuild,
  publishRelease,
  writeBundleDir,
  type Server,
} from "./harness/deployKit";

const servers: Server[] = [];
async function server(environment: "prod" | "staging" = "prod"): Promise<Server> {
  const made = await makeServer(environment);
  servers.push(made);
  return made;
}
afterEach(async () => {
  for (const made of servers.splice(0)) await rm(made.root, { recursive: true, force: true });
});

const ONE = commit("one");
const TWO = commit("two");
const THREE = commit("three");

/** Prod running v1 (commit ONE), deployed through the script itself. */
async function prodRunningV1(): Promise<Server> {
  const s = await server();
  await publishRelease(s, "v1", makeBundle({ sha: ONE }), ONE);
  const first = await s.run(["v1"]);
  expect(first.code, first.stderr).toBe(0);
  await s.clearCalls();
  return s;
}

function backups(s: Server): string[] {
  return existsSync(s.backups) ? readdirSync(s.backups).sort() : [];
}

describe("deploy.sh <tag> (prod)", () => {
  it("deploys a tag on main: backup of pb_data, current switched, started, smoke-tested, logged", async () => {
    const s = await prodRunningV1();
    await writeFile(path.join(s.opt, "pb_data", "marker.txt"), "data from v1");
    await publishRelease(s, "v2", makeBundle({ sha: TWO, migrations: ["1700000000_first.js"] }), TWO, "behind");

    const result = await s.run(["v2"]);

    expect(result.code, result.stderr).toBe(0);
    expect(s.current()).toBe("releases/v2");
    expect(await s.running()).toMatchObject({ running: true, release: expect.stringContaining(path.join("releases", "v2")) });
    // The backup was taken while PocketBase was stopped, and holds pb_data.
    const calls = (await s.calls()).filter((c) => c.tool === "systemctl").map((c) => c.argv.join(" "));
    expect(calls).toEqual(["stop scoreboard", "start scoreboard"]);
    const [backup, ...others] = backups(s);
    expect(others).toEqual([]); // v1's backup is gone: kept only until the next good deploy
    expect(backup).toMatch(/^pre-deploy-v2-\d{8}T\d{6}Z\.tar\.zst$/);
    expect(backupNames(path.join(s.backups, backup!))).toContain("pb_data/marker.txt");
    // The smoke test went through Cloudflare with the service token, to both endpoints.
    const smoke = (await s.calls()).filter((c) => c.url?.startsWith("https://scoreboard.test/"));
    expect(smoke.map((c) => c.url)).toEqual(["https://scoreboard.test/api/health", "https://scoreboard.test/build.json"]);
    expect(smoke[0]!.headers).toEqual(expect.arrayContaining(["CF-Access-Client-Id: probe.access", `CF-Access-Client-Secret: ${CF_SECRET}`]));
    // One deploy-log line in ops.md §13's columns.
    const lines = (await s.deployLog()).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^\| \d{4}-\d\d-\d\dT[\d:]+Z \| v2 \| 9\.9\.9 \| pre-deploy-v2-\S+\.tar\.zst \| ok \| no \|$/);
    // The PocketBase binary in the release is the pinned one.
    expect(existsSync(path.join(s.opt, "releases", "v2", "pocketbase"))).toBe(true);
  });

  it("never puts the GitHub token or the Access secret on a command line", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);

    await s.run(["v2"]);

    const calls = await s.calls();
    const github = calls.filter((c) => c.url?.startsWith(GITHUB_API));
    expect(github.length).toBeGreaterThanOrEqual(5);
    for (const call of github) expect(call.headers).toContain(`Authorization: Bearer ${TOKEN}`);
    for (const call of calls) {
      expect(call.argv.join(" ")).not.toContain(TOKEN);
      expect(call.argv.join(" ")).not.toContain(CF_SECRET);
    }
    // The PocketBase download is public: no token sent there.
    const pb = calls.find((c) => c.url?.startsWith(PB_BASE));
    expect(pb?.headers ?? []).toEqual([]);
  });

  it("refuses while FREEZE exists, before touching GitHub or the service", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);
    await writeFile(path.join(s.etc, "FREEZE"), "");

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FREEZE exists");
    expect(await s.calls()).toEqual([]);
    expect(s.current()).toBe("releases/v1");
  });

  it("deploys during FREEZE with --force, and the log line says so", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);
    await writeFile(path.join(s.etc, "FREEZE"), "");

    const result = await s.run(["v2", "--force"]);

    expect(result.code, result.stderr).toBe(0);
    expect(s.current()).toBe("releases/v2");
    expect((await s.deployLog()).trim().split("\n")[1]).toMatch(/\| ok \| yes \(--force\) \|$/);
  });

  for (const status of ["ahead", "diverged"]) {
    it(`refuses a tag whose commit isn't on main (compare: ${status}), downloading nothing`, async () => {
      const s = await prodRunningV1();
      await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO, status);

      const result = await s.run(["v2"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`is not on main (compare says '${status}')`);
      const urls = (await s.calls()).map((c) => c.url);
      expect(urls).toEqual([`${GITHUB_API}/repos/${REPO}/commits/v2`, `${GITHUB_API}/repos/${REPO}/compare/main...${TWO}`]);
      expect(s.current()).toBe("releases/v1");
      expect(existsSync(path.join(s.opt, "releases", "v2"))).toBe(false);
    });
  }

  it("refuses a name that isn't a v* tag", async () => {
    const s = await server();
    const result = await s.run(["../../etc"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a v* tag");
  });

  it("refuses a bundle whose BUILD_INFO isn't the tagged commit", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: THREE }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`BUILD_INFO says ${THREE}, expected ${TWO}`);
    expect(s.current()).toBe("releases/v1");
  });

  it("does nothing when the tag is already running", async () => {
    const s = await prodRunningV1();
    const result = await s.run(["v1"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already running");
    expect(await s.calls()).toEqual([]);
  });
});

describe("change control while a tournament is live (prod)", () => {
  it("refuses a bundle that adds a migration", async () => {
    const s = await prodRunningV1();
    await s.makeDatabase(["live", "final"]);
    await publishRelease(s, "v2", makeBundle({ sha: TWO, migrations: ["1700000000_first.js", "1700000001_second.js"] }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a tournament is live and it adds migration 1700000001_second.js");
    expect(s.current()).toBe("releases/v1");
    expect((await s.calls()).filter((c) => c.tool === "systemctl")).toEqual([]);
    // The query is read-only and runs against pb_data.
    const sql = (await s.calls()).find((c) => c.tool === "sqlite3");
    expect(sql?.argv).toEqual(["-readonly", path.join(s.opt, "pb_data", "data.db"), "select count(*) from events where status = 'live';"]);
  });

  it("refuses a bundle that changes POCKETBASE_VERSION", async () => {
    const s = await prodRunningV1();
    await s.makeDatabase(["live"]);
    const zip = pbZip("9.9.10");
    await s.serve(`${PB_BASE}/v9.9.10/pocketbase_9.9.10_linux_amd64.zip`, zip);
    await publishRelease(s, "v2", makeBundle({ sha: TWO, pin: pinFile("9.9.10", zip) }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a tournament is live and it changes POCKETBASE_VERSION");
  });

  it("allows a fix with no migration or PocketBase change during a live tournament", async () => {
    const s = await prodRunningV1();
    await s.makeDatabase(["live"]);
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code, result.stderr).toBe(0);
    expect(s.current()).toBe("releases/v2");
  });

  it("allows a migration when no tournament is live", async () => {
    const s = await prodRunningV1();
    await s.makeDatabase(["draft", "closed", "final"]);
    await publishRelease(s, "v2", makeBundle({ sha: TWO, migrations: ["1700000000_first.js", "1700000001_second.js"] }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code, result.stderr).toBe(0);
  });

  it("refuses when the events table can't be read (fails closed)", async () => {
    const s = await prodRunningV1();
    await writeFile(path.join(s.opt, "pb_data", "data.db"), "not a database");
    await publishRelease(s, "v2", makeBundle({ sha: TWO, migrations: ["1700000000_first.js", "1700000001_second.js"] }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("can't be read to rule out a live tournament");
  });
});

describe("bundle checks", () => {
  it("refuses a bundle whose sha256 doesn't match", async () => {
    const s = await prodRunningV1();
    const bundle = makeBundle({ sha: TWO });
    await publishRelease(s, "v2", { ...bundle, sha256File: `${"0".repeat(64)}  bundle.tar.gz\n` }, TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bundle sha256 mismatch");
    expect(s.current()).toBe("releases/v1");
  });

  const bad: [string, Parameters<typeof makeBundle>[0], string][] = [
    ["an entry that climbs out with ../", { sha: TWO, extra: [{ name: "pb_hooks/../../evil.sh", data: "x" }] }, "leaves the release directory"],
    ["an absolute path", { sha: TWO, extra: [{ name: "/etc/evil", data: "x" }] }, "leaves the release directory"],
    ["a symlink", { sha: TWO, extra: [{ name: "pb_public/link", symlink: "/etc/scoreboard/deploy.env" }] }, "not a plain file or directory"],
    ["an unexpected top-level file", { sha: TWO, extra: [{ name: "run-me.sh", data: "x" }] }, "unexpected bundle entry 'run-me.sh'"],
    ["build.json saying dev", { sha: TWO, appSha: "dev" }, "build.json says 'dev'"],
    ["build.json naming another commit", { sha: TWO, appSha: THREE }, `build.json says '${THREE}'`],
  ];
  for (const [what, options, message] of bad) {
    it(`refuses a bundle with ${what}, and nothing is stopped or switched`, async () => {
      const s = await prodRunningV1();
      await publishRelease(s, "v2", makeBundle(options), TWO);

      const result = await s.run(["v2"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
      expect(s.current()).toBe("releases/v1");
      expect((await s.calls()).filter((c) => c.tool === "systemctl")).toEqual([]);
      expect(existsSync(path.join(s.root, "evil.sh"))).toBe(false);
    });
  }

  it("refuses a PocketBase zip that doesn't match the pin", async () => {
    const s = await prodRunningV1();
    await rm(path.join(s.opt, "pb-cache"), { recursive: true });
    await s.serve(`${PB_BASE}/v9.9.9/pocketbase_9.9.9_linux_amd64.zip`, "tampered zip");
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("pocketbase_9.9.9_linux_amd64.zip sha256 mismatch");
    expect(existsSync(path.join(s.opt, "pb-cache", "9.9.9", "pocketbase_9.9.9_linux_amd64.zip"))).toBe(false);
    expect(s.current()).toBe("releases/v1");
  });

  it("replaces a cached PocketBase zip that no longer matches the pin", async () => {
    const s = await prodRunningV1();
    const cached = path.join(s.opt, "pb-cache", "9.9.9", "pocketbase_9.9.9_linux_amd64.zip");
    await writeFile(cached, "corrupted");
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(cached)).toEqual(pbZip());
  });

  it("refuses a binary that reports another version than the pin", async () => {
    const s = await prodRunningV1();
    const zip = pbZip("9.9.11", "9.9.12");
    await s.serve(`${PB_BASE}/v9.9.11/pocketbase_9.9.11_linux_amd64.zip`, zip);
    await publishRelease(s, "v2", makeBundle({ sha: TWO, pin: pinFile("9.9.11", zip) }), TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("reports 'pocketbase version 9.9.12', not pocketbase version 9.9.11");
  });
});

describe("rollback", () => {
  it("switches back to the previous release when the smoke test fails, and keeps the backup", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);
    await s.breakHealth(TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("smoke test FAILED for v2");
    expect(result.stderr).toContain("failed, rolled back to v1 (smoke ok)");
    expect(s.current()).toBe("releases/v1");
    expect(await s.running()).toMatchObject({ running: true, release: expect.stringContaining(path.join("releases", "v1")) });
    expect(backups(s).some((name) => name.startsWith("pre-deploy-v2-"))).toBe(true);
    expect((await s.deployLog()).trim().split("\n")[1]).toContain("| failed, rolled back to v1 (smoke ok) |");
  });

  it("switches back when the new release won't start", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);
    await s.breakStart(TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(s.current()).toBe("releases/v1");
    expect((await s.running()).running).toBe(true);
  });

  it("checks the commit Cloudflare serves, and reports a rollback target that fails its own smoke test", async () => {
    const s = await prodRunningV1();
    // v1's build.json now names another commit, as a wrong release behind the tunnel would.
    await writeFile(path.join(s.opt, "releases", "v1", "pb_public", "build.json"), JSON.stringify({ sha: THREE }));
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO);
    await s.breakHealth(TWO);

    const result = await s.run(["v2"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("failed, rolled back to v1 (its smoke test failed too)");
    expect(s.current()).toBe("releases/v1");
  });

  it("stops the service and says so when there is nothing to roll back to", async () => {
    const s = await server();
    await publishRelease(s, "v1", makeBundle({ sha: ONE }), ONE);
    await s.breakHealth(ONE);

    const result = await s.run(["v1"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no previous release to switch back to");
    expect((await s.running()).running).toBe(false);
  });
});

describe("deploy.sh --staging", () => {
  async function stagingRunningOne(): Promise<Server> {
    const s = await server("staging");
    await publishMainBuild(s, 100, makeBundle({ sha: ONE }), ONE);
    const first = await s.run(["--staging"]);
    expect(first.code, first.stderr).toBe(0);
    await s.clearCalls();
    return s;
  }

  it("deploys the newest green main build into releases/<sha> and pings Healthchecks", async () => {
    const s = await stagingRunningOne();
    await publishMainBuild(s, 101, makeBundle({ sha: TWO, migrations: ["1700000000_first.js", "1700000001_second.js"] }), TWO);
    // Staging skips the live-tournament check: a live event and a new migration still deploy.
    await s.makeDatabase(["live"]);

    const result = await s.run(["--staging"]);

    expect(result.code, result.stderr).toBe(0);
    expect(s.current()).toBe(`releases/${TWO}`);
    const urls = (await s.calls()).map((c) => c.url).filter((u) => u !== undefined);
    expect(urls[0]).toBe(`${GITHUB_API}/repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1`);
    expect(urls).toContain(`${GITHUB_API}/repos/${REPO}/compare/main...${TWO}`);
    expect(urls).toContain(`${GITHUB_API}/repos/${REPO}/actions/artifacts/1010/zip`);
    expect(urls.at(-1)).toBe(HEALTHCHECKS_URL);
    expect((await s.calls()).some((c) => c.tool === "sqlite3")).toBe(false);
    expect(backups(s)).toEqual([expect.stringMatching(new RegExp(`^pre-deploy-${TWO}-`))]);
  });

  it("does nothing but the Healthchecks ping when that commit is already running", async () => {
    const s = await stagingRunningOne();

    const result = await s.run(["--staging"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already running");
    const calls = await s.calls();
    expect(calls.map((c) => c.url)).toEqual([
      `${GITHUB_API}/repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1`,
      HEALTHCHECKS_URL,
    ]);
    expect(calls.some((c) => c.tool === "systemctl")).toBe(false);
  });

  it("rolls back a build that fails its smoke test and pings /fail", async () => {
    const s = await stagingRunningOne();
    await publishMainBuild(s, 101, makeBundle({ sha: TWO }), TWO);
    await s.breakHealth(TWO);

    const result = await s.run(["--staging"]);

    expect(result.code).toBe(1);
    expect(s.current()).toBe(`releases/${ONE}`);
    expect((await s.running()).running).toBe(true);
    const urls = (await s.calls()).map((c) => c.url);
    expect(urls).toContain(`${HEALTHCHECKS_URL}/fail`);
    expect(urls).not.toContain(HEALTHCHECKS_URL);
  });

  it("refuses a build whose commit isn't on main, and pings /fail", async () => {
    const s = await stagingRunningOne();
    await publishMainBuild(s, 101, makeBundle({ sha: TWO }), TWO, "diverged");

    const result = await s.run(["--staging"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not on main");
    expect(s.current()).toBe(`releases/${ONE}`);
    expect((await s.calls()).map((c) => c.url)).toContain(`${HEALTHCHECKS_URL}/fail`);
  });

  it("skips FREEZE", async () => {
    const s = await stagingRunningOne();
    await writeFile(path.join(s.etc, "FREEZE"), "");
    await publishMainBuild(s, 101, makeBundle({ sha: TWO }), TWO);

    const result = await s.run(["--staging"]);

    expect(result.code, result.stderr).toBe(0);
  });

  it("refuses to run unless ENVIRONMENT says staging", async () => {
    const s = await server("prod");
    await publishMainBuild(s, 100, makeBundle({ sha: ONE }), ONE);

    const result = await s.run(["--staging"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT says 'prod', not staging");
    expect(await s.calls()).toEqual([]);
  });

  it("a prod deploy refuses to run on staging", async () => {
    const s = await server("staging");
    await publishRelease(s, "v1", makeBundle({ sha: ONE }), ONE);

    const result = await s.run(["v1"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT says 'staging', not prod");
  });
});

describe("deploy.sh --bundle (interim, decisions.md 2026-11-17 draft)", () => {
  it("deploys a local bundle to prod with no GitHub call, keeping FREEZE and the live check", async () => {
    const s = await server();
    const dir = await writeBundleDir(path.join(s.root, "in", "one"), makeBundle({ sha: ONE }));

    const first = await s.run(["--bundle", dir]);

    expect(first.code, first.stderr).toBe(0);
    expect(first.stdout).toContain("WARNING: a locally built bundle");
    expect(s.current()).toBe(`releases/${ONE}`);
    expect((await s.calls()).some((c) => c.url?.startsWith(GITHUB_API))).toBe(false);

    // FREEZE still applies.
    await writeFile(path.join(s.etc, "FREEZE"), "");
    const two = await writeBundleDir(path.join(s.root, "in", "two"), makeBundle({ sha: TWO, migrations: ["1700000000_first.js", "1700000001_second.js"] }));
    expect((await s.run(["--bundle", two])).stderr).toContain("FREEZE exists");
    await rm(path.join(s.etc, "FREEZE"));

    // So does the live-tournament check.
    await s.makeDatabase(["live"]);
    const live = await s.run(["--bundle", two]);
    expect(live.code).toBe(1);
    expect(live.stderr).toContain("a tournament is live and it adds migration");
    expect(s.current()).toBe(`releases/${ONE}`);
  });

  it("refuses a local bundle whose sha256 file doesn't match", async () => {
    const s = await server();
    const bundle = makeBundle({ sha: ONE });
    const dir = await writeBundleDir(path.join(s.root, "in"), { ...bundle, sha256File: `${"f".repeat(64)}  bundle.tar.gz\n` });

    const result = await s.run(["--bundle", dir]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bundle sha256 mismatch");
  });

  it("deploys a local bundle to staging and pings Healthchecks; rolls back and pings /fail on a bad one", async () => {
    const s = await server("staging");
    s.routes[HEALTHCHECKS_URL] = { body: "OK" };
    s.routes[`${HEALTHCHECKS_URL}/fail`] = { body: "OK" };
    await s.saveRoutes();
    const one = await writeBundleDir(path.join(s.root, "in", "one"), makeBundle({ sha: ONE }));
    const two = await writeBundleDir(path.join(s.root, "in", "two"), makeBundle({ sha: TWO }));
    await s.breakHealth(TWO);

    expect((await s.run(["--bundle", one, "--staging"])).code).toBe(0);
    expect((await s.calls()).map((c) => c.url)).toContain(HEALTHCHECKS_URL);
    await s.clearCalls();

    const result = await s.run(["--bundle", two, "--staging"]);

    expect(result.code).toBe(1);
    expect(s.current()).toBe(`releases/${ONE}`);
    expect((await s.calls()).map((c) => c.url)).toContain(`${HEALTHCHECKS_URL}/fail`);
  });
});

describe("secrets file and lock", () => {
  it("refuses a deploy.env that others can read", async () => {
    const s = await server();
    const { chmod } = await import("node:fs/promises");
    await chmod(path.join(s.etc, "deploy.env"), 0o644);

    const result = await s.run(["v1"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("must be owned by root and mode 600");
  });

  it("refuses a deploy.env with a key it doesn't know (it is never sourced)", async () => {
    const s = await server();
    const file = path.join(s.etc, "deploy.env");
    await writeFile(file, `${await readFile(file, "utf8")}PATH=/tmp/evil\n`);

    const result = await s.run(["v1"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown key 'PATH'");
  });

  it("refuses while another deploy holds the lock, and clears a stale one", async () => {
    const s = await server();
    await publishRelease(s, "v1", makeBundle({ sha: ONE }), ONE);
    await mkdir(path.join(s.opt, ".deploy.lock"), { recursive: true });
    await writeFile(path.join(s.opt, ".deploy.lock", "pid"), String(process.pid));

    const held = await s.run(["v1"]);
    expect(held.code).toBe(1);
    expect(held.stderr).toContain(`another deploy is running (pid ${process.pid})`);

    await writeFile(path.join(s.opt, ".deploy.lock", "pid"), "999999");
    const stale = await s.run(["v1"]);
    expect(stale.code, stale.stderr).toBe(0);
    expect(existsSync(path.join(s.opt, ".deploy.lock"))).toBe(false);
  });

  it("leaves no work directory behind", async () => {
    const s = await prodRunningV1();
    await publishRelease(s, "v2", makeBundle({ sha: TWO }), TWO, "ahead");
    await s.run(["v2"]);
    expect(readdirSync(s.opt).filter((name) => name.startsWith(".deploy."))).toEqual([]);
  });
});
