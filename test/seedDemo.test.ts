// scripts/seed-demo (decisions.md 2026-11-18 "Demo data on prod for grading"; Open item 23)
// against a real throwaway PocketBase (the harness) whose superusers have MFA on, as prod's does,
// with the OTP mail going to the fake SMTP server. The script reads the password, then the emailed
// code, from stdin. The photo pool is the clean fixtures plus gps.jpg, so the run proves every
// demo photo still goes through the location strip.

import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leaderboardFromRecords } from "../web/src/lib/leaderboard";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { decodedText, startFakeSmtp, type FakeSmtp } from "./harness/smtp";
import { exiftoolGps, leaksIn } from "./spike/leaks";

const SCRIPT = path.join(REPO_ROOT, "scripts", "seed-demo");
const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
const SUPERUSER = "prod-admin@example.test";
const PASSWORD = "a prod password with spaces & 'quotes'";
const ORGANIZER = "kayden@example.test";
const MEMBER = "grader@example.test";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const pocketbase = usePocketBase();
let smtp: FakeSmtp;
let root: string;
let etc: string;
let pool: string;

beforeAll(async () => {
  smtp = await startFakeSmtp();
  const { superuser } = pocketbase();
  await superuser.settings.update({
    meta: { senderName: "Prod", senderAddress: "codes@example.test" },
    smtp: { enabled: true, host: smtp.host, port: smtp.port, tls: false, authMethod: "PLAIN", username: "", password: "" },
  });
  await superuser.collection("_superusers").create({ email: SUPERUSER, password: PASSWORD, passwordConfirm: PASSWORD });
  await superuser.collections.update("_superusers", { mfa: { enabled: true }, otp: { enabled: true } });
  // A real organizer (for --judge) and a real member, as on prod before the seed.
  for (const [email, name, role] of [
    [ORGANIZER, "Kayden", "organizer"],
    [MEMBER, "Grader", "member"],
  ]) {
    const pw = `pw-${name}-0123456789`;
    await superuser.collection("users").create({ email, name, role, verified: true, display_units: "lb", password: pw, passwordConfirm: pw });
  }

  root = await mkdtemp(path.join(tmpdir(), "chromie-seed-demo-"));
  etc = path.join(root, "etc");
  pool = path.join(root, "photos");
  await mkdir(etc);
  await mkdir(pool);
  for (const name of ["clean-1.jpg", "clean-2.jpg", "gps.jpg"]) await copyFile(path.join(FIXTURES, name), path.join(pool, name));
});

afterAll(async () => {
  await smtp?.stop();
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the script, typing the password, then the code from the next OTP mail if one comes. */
async function seed(environment: string, args: string[]): Promise<Run> {
  await writeFile(path.join(etc, "ENVIRONMENT"), `${environment}\n`);
  smtp.mails.length = 0;
  const child = spawn(SCRIPT, args, {
    env: { ...process.env, SCOREBOARD_ETC: etc, SCOREBOARD_PB_URL: pocketbase().url },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  child.stdin.on("error", () => {}); // a script that stops early closes its stdin
  child.stdin.write(`${PASSWORD}\n`);

  let done = false;
  void exited.then(() => (done = true));
  while (!done) {
    const mail = smtp.mails.find((m) => m.to.includes(SUPERUSER));
    if (mail !== undefined) {
      const code = decodedText(mail).match(/\b\d{6,10}\b/)?.[0];
      child.stdin.write(`${code}\n`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.stdin.end();
  return { code: await exited, stdout, stderr };
}

const args = (photos = pool, ...more: string[]) => ["--superuser", SUPERUSER, "--photos", photos, ...more];

async function folder(name: string, files: Record<string, Buffer>): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir);
  for (const [file, bytes] of Object.entries(files)) await writeFile(path.join(dir, file), bytes);
  return dir;
}

async function nothingSeeded(): Promise<void> {
  const { superuser } = pocketbase();
  expect(await superuser.collection("events").getFullList()).toEqual([]);
  expect((await superuser.collection("users").getFullList()).map((u) => u.email).sort()).toEqual([ORGANIZER, MEMBER].sort());
}

describe("scripts/seed-demo: refusals", () => {
  it("refuses unless ENVIRONMENT says prod or staging, before asking PocketBase anything", async () => {
    const result = await seed("dev", args());

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT says 'dev'; this runs on prod or staging only");
    expect(smtp.mails).toEqual([]);
    await nothingSeeded();
  });

  it("refuses a photo folder with fewer than 2 JPEGs, a file that isn't a JPEG, or one over 5 MB", async () => {
    const one = await folder("one", { "a.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) });
    const png = await folder("png", { "a.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "b.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    const large = await folder("large", { "a.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "b.jpg": big });

    for (const [dir, message] of [
      [one, "needs at least 2 JPEGs (found 1)"],
      [png, "b.png is not a JPEG"],
      [large, "b.jpg is over 5 MB"],
      [path.join(root, "missing"), "is not a folder"],
    ] as const) {
      const result = await seed("prod", args(dir));
      expect(result.code, dir).toBe(1);
      expect(result.stderr, dir).toContain(message);
    }
    expect(smtp.mails).toEqual([]);
    await nothingSeeded();
  });

  it("refuses a --judge who isn't an organizer, or isn't a user", async () => {
    for (const [email, message] of [
      [MEMBER, `--judge ${MEMBER} is not an organizer`],
      ["nobody@example.test", "--judge nobody@example.test is not a user"],
    ] as const) {
      const result = await seed("prod", args(pool, "--judge", email));
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    await nothingSeeded();
  });
});

describe("scripts/seed-demo: a run on prod", () => {
  let run: Run;
  let users: RecordModel[];
  let events: RecordModel[];
  let entries: RecordModel[];
  let catches: RecordModel[];
  let audit: RecordModel[];
  let startedAt: number;

  const byName = (prefix: string) => {
    const event = events.find((e) => String(e.name).startsWith(prefix));
    if (!event) throw new Error(`no event ${prefix}`);
    return event;
  };
  const entriesOf = (event: RecordModel) => entries.filter((e) => e.event === event.id);
  const catchesOf = (event: RecordModel) => {
    const ids = new Set(entriesOf(event).map((e) => e.id));
    return catches.filter((c) => ids.has(String(c.entry)));
  };
  const userId = (email: string) => users.find((u) => u.email === email)!.id;

  beforeAll(async () => {
    startedAt = Date.now();
    run = await seed("prod", args(pool, "--judge", ORGANIZER));
    const { superuser } = pocketbase();
    users = await superuser.collection("users").getFullList();
    events = await superuser.collection("events").getFullList({ sort: "starts_at" });
    entries = await superuser.collection("entries").getFullList();
    catches = await superuser.collection("catches").getFullList({ sort: "created", expand: "species" });
    audit = await superuser.collection("audit_log").getFullList({ sort: "created" });
  }, 600_000);

  it("finishes, prints a summary and never shows the password", () => {
    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toContain(`signed in as ${SUPERUSER} (prod)`);
    expect(run.stdout).toMatch(/Fall Bass \d{4} \(live\): verified \d+ pending 8 rejected \d+ retracted \d+/);
    expect(run.stdout + run.stderr).not.toContain(PASSWORD);
  });

  it("makes 12 demo anglers and 2 demo organizers that nobody can sign in as, and leaves the real users alone", () => {
    const demo = users.filter((u) => /^demo-[a-z]+@example\.com$/.test(String(u.email)));
    expect(demo).toHaveLength(14);
    expect(demo.filter((u) => u.role === "organizer").map((u) => u.name).sort()).toEqual(["Dana F.", "Sam O."]);
    for (const u of demo) expect(u).toMatchObject({ verified: true, emailVisibility: false });
    expect(new Set(demo.map((u) => u.display_units))).toEqual(new Set(["lb", "lb_oz"]));
    expect(users.find((u) => u.email === MEMBER)).toMatchObject({ name: "Grader", role: "member" });
  });

  it("sends no email but the superuser's own sign-in code: impersonation mails nobody", () => {
    expect(smtp.mails.length).toBeGreaterThan(0);
    for (const mail of smtp.mails) expect(mail.to).toEqual([SUPERUSER]);
  });

  it("makes one live tournament judged by --judge and two final ones, oldest first", () => {
    expect(events.map((e) => e.status)).toEqual(["final", "final", "live"]);
    expect(events.map((e) => String(e.name).replace(/ \d{4}$/, ""))).toEqual(["Summer Bass", "Walleye Open", "Fall Bass"]);
    const live = byName("Fall Bass");
    expect(live).toMatchObject({ metric: "weight", best_n: 5, judge: userId(ORGANIZER), backup_judge: userId("demo-dana@example.com"), code_word_on: true });
    expect(byName("Walleye Open")).toMatchObject({ metric: "length", best_n: 3 });

    const now = Date.now();
    expect(new Date(live.starts_at).getTime()).toBeLessThan(now - 21 * DAY);
    expect(new Date(live.ends_at).getTime()).toBeGreaterThan(now);
    for (const final of events.filter((e) => e.status === "final")) {
      expect(new Date(final.submit_deadline).getTime() - new Date(final.ends_at).getTime()).toBe(DAY);
      expect(new Date(final.submit_deadline).getTime()).toBeLessThan(new Date(live.starts_at).getTime());
    }
  });

  it("gives the live tournament a judge queue, rejected, retracted and corrected catches, and one withdrawn entry", () => {
    const live = catchesOf(byName("Fall Bass"));
    const count = (status: string) => live.filter((c) => c.status === status).length;
    expect(count("pending")).toBe(8);
    expect(count("verified")).toBeGreaterThan(30);
    expect(count("rejected")).toBeGreaterThanOrEqual(3);
    expect(count("retracted")).toBeGreaterThanOrEqual(2);
    expect(live.filter((c) => c.status === "rejected").every((c) => String(c.reason).length > 0)).toBe(true);

    const withdrawn = entriesOf(byName("Fall Bass")).filter((e) => e.withdrawn);
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]).toMatchObject({ display_name: "Riley C.", withdrawn_by: withdrawn[0]!.angler });
  });

  it("leaves nothing pending in a final tournament, and both have a board", () => {
    for (const event of events.filter((e) => e.status === "final")) {
      const own = catchesOf(event);
      expect(own.filter((c) => c.status === "pending"), event.name).toEqual([]);
      expect(own.filter((c) => c.status === "rejected").length, event.name).toBeGreaterThan(0);

      const board = leaderboardFromRecords({
        event,
        entries: entriesOf(event),
        catches: own,
        viewerId: userId(MEMBER),
        units: "lb",
        nowMs: Date.now(),
      });
      expect(board.view.rows.length, event.name).toBeGreaterThanOrEqual(8);
      expect(board.view.rows[0]!.place).toBe(1);
      expect(board.view.rows.every((row) => row.pending === 0)).toBe(true);
    }
  });

  it("dates every catch inside its tournament's window, before the run, with two photos and no flags", () => {
    for (const event of events) {
      const from = new Date(event.starts_at).getTime();
      const to = new Date(event.ends_at).getTime();
      for (const c of catchesOf(event)) {
        const at = new Date(c.captured_at).getTime();
        expect(at, c.id).toBeGreaterThanOrEqual(from);
        expect(at, c.id).toBeLessThanOrEqual(Math.min(to, startedAt));
        expect(c.photo, c.id).toHaveLength(2);
        expect(c.photo_captured_at[0], c.id).toBe(c.captured_at.replace(" ", "T"));
        expect(c.flags, c.id).toEqual([]);
        const species = String(c.expand?.species.name);
        expect(event.metric === "length" ? species === "walleye" && c.length_q > 0 : species.endsWith("bass") && c.weight_hoz > 0, c.id).toBe(true);
      }
    }
  });

  it("writes exactly one audit row per change, each by the person who made it", () => {
    const rowsFor = (id: string) => audit.filter((row) => row.target_id === id);
    const anglerOf = (c: RecordModel) => entries.find((e) => e.id === c.entry)!.angler;

    for (const c of catches) {
      const actions = rowsFor(c.id).map((row) => row.action);
      const decided = { pending: [], verified: [["approve"], ["correct"]], rejected: [["reject"]], retracted: [["retract"]] }[c.status as string]!;
      if (c.status === "pending") expect(actions, c.id).toEqual(["create"]);
      else expect(decided.map((d) => ["create", ...d]), c.id).toContainEqual(actions);
      const [create, decision] = rowsFor(c.id);
      expect(create!.actor, c.id).toBe(anglerOf(c));
      if (decision) {
        const event = events.find((e) => e.id === decision.event)!;
        expect(decision.actor, c.id).toBe(c.status === "retracted" ? anglerOf(c) : event.judge);
      }
    }
    expect(audit.filter((row) => row.action === "correct")).toHaveLength(3);

    for (const entry of entries) {
      expect(rowsFor(entry.id).map((row) => row.action), entry.id).toEqual(entry.withdrawn ? ["join", "withdraw"] : ["join"]);
    }
    const sam = userId("demo-sam@example.com");
    for (const event of events) {
      const rows = rowsFor(event.id);
      expect(rows.map((row) => row.action), event.name).toEqual(event.status === "final" ? ["open", "close", "finalize"] : ["open"]);
      for (const row of rows) expect(row.actor).toBe(sam);
    }
  });

  it("stores no location data from the pool's GPS photo: every photo went through the strip", async () => {
    const { superuser } = pocketbase();
    const token = await superuser.files.getToken();
    // The pool is used in turn, two photos per catch: the first two catches use all three files.
    for (const c of catches.slice(0, 2)) {
      for (const name of c.photo as string[]) {
        const response = await fetch(superuser.files.getURL(c, name, { token }));
        expect(response.status, name).toBe(200);
        const bytes = Buffer.from(await response.arrayBuffer());
        const file = path.join(root, `stored-${name}`);
        await writeFile(file, bytes);
        expect([...leaksIn(bytes), ...(exiftoolGps(file) ?? [])], name).toEqual([]);
      }
    }
  });

  it("refuses a second run, leaving the seed as it was", async () => {
    const result = await seed("prod", args());

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("3 tournament(s) already exist");
    expect(await pocketbase().superuser.collection("events").getFullList()).toHaveLength(3);
  });
});
