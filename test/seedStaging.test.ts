// scripts/seed-staging against a real throwaway PocketBase (the harness) whose superusers have
// MFA on, as the staging superuser will (features.json M0-06), with the OTP mail going to the fake
// SMTP server. The script reads the password, then the emailed code, from stdin.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { decodedText, startFakeSmtp, type FakeSmtp } from "./harness/smtp";
import { FIXTURE_NAMES, FIXTURE_USERS } from "./harness/users";

const SCRIPT = path.join(REPO_ROOT, "scripts", "seed-staging");
const SUPERUSER = "staging-admin@example.test";
const PASSWORD = "a staging password with spaces & 'quotes'";
const PATTERN = "kayden+{k}@example.test";

const pocketbase = usePocketBase();
let smtp: FakeSmtp;
let etc: string;

beforeAll(async () => {
  smtp = await startFakeSmtp();
  const { superuser } = pocketbase();
  await superuser.settings.update({
    meta: { senderName: "Staging", senderAddress: "codes@example.test" },
    smtp: { enabled: true, host: smtp.host, port: smtp.port, tls: false, authMethod: "PLAIN", username: "", password: "" },
  });
  await superuser.collection("_superusers").create({ email: SUPERUSER, password: PASSWORD, passwordConfirm: PASSWORD });
  await superuser.collections.update("_superusers", { mfa: { enabled: true }, otp: { enabled: true } });
  etc = await mkdtemp(path.join(tmpdir(), "chromie-seed-"));
});

afterAll(async () => {
  await smtp?.stop();
  if (etc !== undefined) await rm(etc, { recursive: true, force: true });
});

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the script, typing the password, then the code from the next OTP mail if one comes. */
async function seed(environment: string, args: string[] = ["--superuser", SUPERUSER, "--email-pattern", PATTERN]): Promise<Run> {
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

describe("scripts/seed-staging", () => {
  it("refuses to run unless ENVIRONMENT says staging, before asking PocketBase anything", async () => {
    const result = await seed("prod");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT says 'prod'; this runs on staging only");
    expect(smtp.mails).toEqual([]);
    expect(await pocketbase().superuser.collection("users").getFullList()).toEqual([]);
  });

  it("signs in through MFA and seeds the fixture users and one live event judged by K, backed by S", async () => {
    const result = await seed("staging");

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`signed in as ${SUPERUSER}`);
    // MFA really ran: the password alone wasn't enough, and the emailed code was the second factor.
    expect(smtp.mails.filter((m) => m.to.includes(SUPERUSER))).toHaveLength(1);
    // The password never shows up in anything the script prints.
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);

    const { superuser } = pocketbase();
    const users = await superuser.collection("users").getFullList({ sort: "email" });
    expect(users).toHaveLength(FIXTURE_NAMES.length);
    for (const key of FIXTURE_NAMES) {
      const user = users.find((u) => u.email === `kayden+${key.toLowerCase()}@example.test`);
      expect(user, key).toMatchObject({ ...FIXTURE_USERS[key], verified: true, emailVisibility: false, display_units: "lb" });
    }
    const id = (key: "K" | "S") => users.find((u) => u.email === `kayden+${key.toLowerCase()}@example.test`)!.id;

    const events = await superuser.collection("events").getFullList({ expand: "species" });
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event).toMatchObject({ name: "Staging Live", status: "live", metric: "weight", best_n: 10, judge: id("K"), backup_judge: id("S"), code_word_on: true });
    expect(event.expand?.species.map((s: { name: string }) => s.name).sort()).toEqual(["largemouth bass", "smallmouth bass"]);
    const now = Date.now();
    expect(new Date(event.starts_at).getTime()).toBeLessThan(now);
    expect(new Date(event.ends_at).getTime()).toBeGreaterThan(now);
    expect(new Date(event.submit_deadline).getTime() - new Date(event.ends_at).getTime()).toBe(24 * 3600_000);

    const entries = await superuser.collection("entries").getFullList({ filter: `event = "${event.id}"` });
    expect(entries.map((e) => e.display_name).sort()).toEqual(["Kayden", "Sam"]);
    const joins = await superuser.collection("audit_log").getFullList({ filter: `action = "join" && event = "${event.id}"` });
    expect(joins).toHaveLength(2);
  });

  it("refuses a second run, leaving the seed as it was", async () => {
    const result = await seed("staging");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("8 fixture user(s) already exist");
    expect(await pocketbase().superuser.collection("events").getFullList()).toHaveLength(1);
  });

  it("refuses a wrong password", async () => {
    await writeFile(path.join(etc, "ENVIRONMENT"), "staging\n");
    const child = spawn(SCRIPT, ["--superuser", SUPERUSER, "--email-pattern", PATTERN], {
      env: { ...process.env, SCOREBOARD_ETC: etc, SCOREBOARD_PB_URL: pocketbase().url },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    child.stdin.end("wrong password\n");
    const code = await new Promise((resolve) => child.on("close", resolve));

    expect(code).toBe(1);
    expect(stderr).toContain("superuser sign-in refused (400)");
  });

  it("refuses an email pattern without {k}", async () => {
    const result = await seed("staging", ["--superuser", SUPERUSER, "--email-pattern", "kayden@example.test"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("must hold {k}");
  });
});
