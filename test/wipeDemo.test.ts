// scripts/wipe-demo, the wipe of the grading demo data before tournament #1 (decisions.md
// 2026-11-18 "Demo data on prod for grading"; Open item 23). The database is a real PocketBase's
// pb_data with the fixture world, copied after it stopped; sqlite3 is the node:sqlite shim and
// systemctl a shim whose start "runs the migrations" (writes an empty users collection) unless
// told to fail. tar and zstd are the real ones. Never run against prod or staging.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, startPocketBase } from "./harness/pocketbase";
import { createFixtureUsers } from "./harness/users";
import { seedWorld } from "./harness/world";

const SCRIPT = path.join(REPO_ROOT, "scripts", "wipe-demo");
const SHIMS = path.join(REPO_ROOT, "test", "harness", "shims");

// systemctl: logs each call; `start` fails when $SHIM_DIR/start-fails exists, and otherwise, on
// a pb_data with no database, makes the empty one PocketBase's migrations would leave.
const SYSTEMCTL = `
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const dir = process.env.SHIM_DIR;
const argv = process.argv.slice(2);
appendFileSync(path.join(dir, "calls.log"), argv.join(" ") + "\\n");
if (argv[0] === "start") {
  if (existsSync(path.join(dir, "start-fails"))) { process.stderr.write("Job failed.\\n"); process.exit(1); }
  const db = path.join(process.env.SCOREBOARD_OPT, "pb_data", "data.db");
  if (!existsSync(db)) {
    const d = new DatabaseSync(db);
    d.exec("create table _collections (id text, name text); insert into _collections values ('u', 'users'); create table users (id text, email text);");
    d.close();
  }
}
`;

let root: string;
let original: string;
let bin: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "chromie-wipe-"));
  const pbRoot = path.join(root, "pb");
  await mkdir(pbRoot);
  const harness = await startPocketBase({ tmpRoot: pbRoot });
  try {
    await seedWorld(harness, await createFixtureUsers(harness));
    // stop() removes its own directory, so the idle server's pb_data is copied out first.
    const [workDir] = await readdir(pbRoot);
    original = path.join(root, "original-pb_data");
    await cp(path.join(pbRoot, workDir!, "pb_data"), original, { recursive: true });
  } finally {
    await harness.stop();
  }

  bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(path.join(bin, "sqlite3"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(SHIMS, "sqlite3.mjs")}" "$@"\n`);
  await writeFile(path.join(root, "systemctl.mjs"), SYSTEMCTL);
  await writeFile(path.join(bin, "systemctl"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(root, "systemctl.mjs")}" "$@"\n`);
  await chmod(path.join(bin, "sqlite3"), 0o755);
  await chmod(path.join(bin, "systemctl"), 0o755);
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Box {
  dir: string;
  opt: string;
  etc: string;
  backups: string;
  shim: string;
  db: string;
}

let boxes = 0;
/** A pretend container: OPT/pb_data is a copy of the fixture world's. */
async function box(): Promise<Box> {
  const dir = path.join(root, `box-${++boxes}`);
  const b = { dir, opt: path.join(dir, "opt"), etc: path.join(dir, "etc"), backups: path.join(dir, "backups"), shim: path.join(dir, "shim"), db: "" };
  b.db = path.join(b.opt, "pb_data", "data.db");
  for (const d of [b.opt, b.etc, b.shim]) await mkdir(d, { recursive: true });
  await cp(original, path.join(b.opt, "pb_data"), { recursive: true });
  // Fold the copied write-ahead log into data.db, so the file's hash stands for the database.
  const db = new DatabaseSync(b.db);
  db.exec("pragma wal_checkpoint(truncate)");
  db.close();
  await writeFile(path.join(b.etc, "ENVIRONMENT"), "prod\n");
  await writeFile(path.join(b.shim, "calls.log"), "");
  return b;
}

/**
 * Makes the copy look like what seed-demo leaves: every user but one is demo-<id>@example.com,
 * and each tournament's first audit row names a demo user. The one left is a grader who signed up.
 */
function asSeed(b: Box): { grader: string } {
  const db = new DatabaseSync(b.db);
  const ids = db.prepare("select id from users order by id").all().map((row) => String(row.id));
  const grader = ids[0]!;
  for (const id of ids.slice(1)) db.prepare("update users set email = ? where id = ?").run(`demo-${id}@example.com`, id);
  db.prepare("update users set email = 'grader@school.test' where id = ?").run(grader);
  const demo = ids[1]!;
  for (const row of db.prepare("select id from events").all()) {
    const event = String(row.id);
    db.prepare(
      "insert into audit_log (id, actor, action, event, catch, target_id, before, after, created) values (?, ?, 'join', ?, '', ?, 'null', 'null', '2000-01-01 00:00:00.000Z')",
    ).run(`seed${event}`.slice(0, 15), demo, event, event);
  }
  db.close();
  return { grader: "grader@school.test" };
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function run(b: Box, args: string[], input = ""): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(
      "bash",
      [SCRIPT, ...args],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          LANG: "C",
          SHIM_DIR: b.shim,
          SCOREBOARD_OPT: b.opt,
          SCOREBOARD_ETC: b.etc,
          SCOREBOARD_BACKUPS: b.backups,
          SCOREBOARD_USER: userInfo().username,
          SCOREBOARD_WIPE_TRIES: "2",
          SCOREBOARD_WIPE_WAIT: "0",
        },
      },
      (error, stdout, stderr) => resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
    child.stdin?.end(input);
  });
}

const sha = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");
const calls = async (b: Box) => (await readFile(path.join(b.shim, "calls.log"), "utf8")).split("\n").filter((line) => line !== "" && !line.startsWith("{"));
const asides = async (b: Box) => (await readdir(b.opt)).filter((name) => name.startsWith("pb_data.demo-"));
const count = (file: string, sql: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  const value = Number(Object.values(db.prepare(sql).get()!)[0]);
  db.close();
  return value;
};

describe("wipe-demo report", () => {
  it("prints the users, tournaments and catches, read-only, and calls no systemctl", async () => {
    const b = await box();
    asSeed(b);
    const before = await sha(b.db);

    const result = await run(b, ["report"]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("pb_data: ");
    expect(result.stdout).toMatch(/users: \d+ \(\d+ demo, 1 who will sign up again\)/);
    expect(result.stdout).toContain("  grader@school.test");
    expect(result.stdout).toContain("(seed)");
    expect(result.stdout).not.toContain("not the seed");
    expect(result.stdout).toMatch(/catches: [1-9]\d* \(\d+ by people who aren't demo users\)/);
    expect(await sha(b.db)).toBe(before);
    expect(await calls(b)).toEqual([]);
  });

  it("marks tournaments the seed didn't make", async () => {
    const b = await box();
    const result = await run(b, ["report"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("not the seed");
  });
});

describe("wipe-demo run", () => {
  it("backs up, moves pb_data aside and starts on an empty one after WIPE is typed", async () => {
    const b = await box();
    asSeed(b);
    const before = await sha(b.db);

    const result = await run(b, ["run"], "WIPE\n");

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("wipe-demo: done.");
    expect(await calls(b)).toEqual(["stop scoreboard", "start scoreboard"]);
    // The new pb_data: the migrations' empty users collection, no one in it.
    expect(count(b.db, "select count(*) from users")).toBe(0);
    // The old one, moved aside whole and closed to everyone but root.
    const [aside] = await asides(b);
    expect(aside).toBeDefined();
    expect(await sha(path.join(b.opt, aside!, "data.db"))).toBe(before);
    expect((await stat(path.join(b.opt, aside!))).mode & 0o777).toBe(0o700);
    // The backup holds the old database byte for byte.
    const [backup] = await readdir(b.backups);
    expect(backup).toMatch(/^pre-wipe-\d{8}T\d{6}Z\.tar\.zst$/);
    const out = path.join(b.dir, "restored");
    await mkdir(out);
    await new Promise<void>((resolve, reject) =>
      execFile("sh", ["-c", `zstd -dc "${path.join(b.backups, backup!)}" | tar -C "${out}" -xf -`], (error) => (error ? reject(error) : resolve())),
    );
    expect(await sha(path.join(out, "pb_data", "data.db"))).toBe(before);
    expect(existsSync(path.join(b.opt, ".deploy.lock"))).toBe(false);
  });

  it("changes nothing unless WIPE is typed exactly", async () => {
    for (const input of ["", "wipe\n", "yes\n"]) {
      const b = await box();
      asSeed(b);
      const before = await sha(b.db);
      const result = await run(b, ["run"], input);
      expect(result.code).toBe(4);
      expect(await sha(b.db)).toBe(before);
      expect(await calls(b)).toEqual([]);
      expect(existsSync(b.backups)).toBe(false);
    }
  });

  it("refuses while a tournament the seed didn't make has started, unless --force", async () => {
    const b = await box();
    const before = await sha(b.db);

    const refused = await run(b, ["run"], "WIPE\n");
    expect(refused.code).toBe(3);
    expect(refused.stderr).toContain("a tournament the seed didn't make has started");
    expect(await sha(b.db)).toBe(before);
    expect(await calls(b)).toEqual([]);

    const forced = await run(b, ["run", "--force"], "WIPE\n");
    expect(forced.code, forced.stderr).toBe(0);
    expect(count(b.db, "select count(*) from users")).toBe(0);
  });

  it("refuses while FREEZE exists, unless --force", async () => {
    const b = await box();
    asSeed(b);
    await writeFile(path.join(b.etc, "FREEZE"), "");

    const refused = await run(b, ["run"], "WIPE\n");
    expect(refused.code).toBe(3);
    expect(refused.stderr).toContain("FREEZE");
    expect(await calls(b)).toEqual([]);

    const forced = await run(b, ["run", "--force"], "WIPE\n");
    expect(forced.code, forced.stderr).toBe(0);
  });

  it("puts the old pb_data back and starts it when the new start fails", async () => {
    const b = await box();
    asSeed(b);
    const before = await sha(b.db);
    await writeFile(path.join(b.shim, "start-fails"), "");

    const result = await run(b, ["run"], "WIPE\n");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("on the old pb_data again");
    expect(await sha(b.db)).toBe(before);
    expect(await asides(b)).toEqual([]);
    expect(await readdir(b.backups)).toHaveLength(1);
    expect((await calls(b)).at(-1)).toBe("start scoreboard");
  });

  it("stops, changing nothing, when it can't read the tournaments (the guard never passes by default)", async () => {
    const b = await box();
    asSeed(b);
    const db = new DatabaseSync(b.db);
    db.exec("drop table audit_log");
    db.close();
    const before = await sha(b.db);

    const result = await run(b, ["run"], "WIPE\n");

    expect(result.code).not.toBe(0);
    expect(await sha(b.db)).toBe(before);
    expect(await calls(b)).toEqual([]);
    expect(existsSync(b.backups)).toBe(false);
  });

  it("refuses while a deploy holds the lock", async () => {
    const b = await box();
    asSeed(b);
    await mkdir(path.join(b.opt, ".deploy.lock"));
    await writeFile(path.join(b.opt, ".deploy.lock", "pid"), String(process.pid));

    const result = await run(b, ["run"], "WIPE\n");

    expect(result.code).toBe(6);
    expect(await calls(b)).toEqual([]);
    expect(existsSync(path.join(b.opt, ".deploy.lock", "pid"))).toBe(true);
  });
});
