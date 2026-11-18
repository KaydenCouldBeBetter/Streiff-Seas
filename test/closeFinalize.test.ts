// S4 step 11: the ops.md §9 "Close and finalize" checklist, walked once against a seeded
// tournament, through the same library calls the organizer's and judges' screens make
// (eventAdmin.ts, judgeDecision.ts, exports.ts, the loaders) and scripts/archive-event.sh.
// Evidence: docs/evidence/s4-close-finalize.txt.
//
// The clock is the one thing faked: "time passes" is the superuser moving ends_at and
// submit_deadline into the past (the superuser passes the events hooks unchecked), so the walk
// needn't wait a day. Host-only steps (backups, FREEZE, apt timers, the laptop) are not run here.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { afterAll, beforeAll, expect, it } from "vitest";
import { catchBaseOf } from "../web/src/lib/changeCatch";
import { EMPTY_FORM, eventBody, loadManage, retryEventChange, sendEventChange } from "../web/src/lib/eventAdmin";
import { buildExports, loadExportData } from "../web/src/lib/exports";
import { sendDecision } from "../web/src/lib/judgeDecision";
import { leaderboardFromRecords } from "../web/src/lib/leaderboard";
import { loadTournament } from "../web/src/lib/liveTournament";
import { loadMyCatches } from "../web/src/lib/loadMyCatches";
import { REPO_ROOT, startPocketBase, type Harness } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";
import { photo, seedWorld, type World } from "./harness/world";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SCRIPT = path.join(REPO_ROOT, "scripts", "archive-event.sh");

let root: string;
let harness: Harness;
let users: FixtureUsers;
let world: World;
let pbData: string;
let bin: string;
const steps: string[] = [];
const note = (line: string) => steps.push(line);

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "chromie-walk-"));
  await mkdir(path.join(root, "pb"));
  harness = await startPocketBase({ tmpRoot: path.join(root, "pb") });
  pbData = path.join(root, "pb", (await readdir(path.join(root, "pb")))[0]!, "pb_data");
  users = await createFixtureUsers(harness);
  world = await seedWorld(harness, users);
  bin = path.join(root, "bin");
  await mkdir(bin);
  await mkdir(path.join(root, "shim"));
  await writeFile(path.join(root, "shim", "calls.log"), "");
  await writeFile(path.join(bin, "sqlite3"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(REPO_ROOT, "test", "harness", "shims", "sqlite3.mjs")}" "$@"\n`);
  await chmod(path.join(bin, "sqlite3"), 0o755);
}, 60_000);

afterAll(async () => {
  // The walk's record, for docs/evidence/s4-close-finalize.txt.
  console.log(steps.join("\n"));
  await harness?.stop();
  await rm(root, { recursive: true, force: true });
});

const as = (who: FixtureName) => actAs(harness, users[who]);
const iso = (ms: number) => new Date(ms).toISOString();

function script(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile("bash", [SCRIPT, ...args], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SHIM_DIR: path.join(root, "shim") } }, (error, stdout, stderr) =>
      resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
  });
}

async function submit(client: PocketBase, entryId: string, hoz: number, capturedAt: number): Promise<RecordModel> {
  const form = new FormData();
  const at = iso(capturedAt);
  for (const [key, value] of Object.entries({ entry: entryId, species: world.species.largemouth.id, weight_hoz: String(hoz), client_uuid: randomUUID(), captured_at: at, photo_captured_at: JSON.stringify([at, at]) })) {
    form.set(key, value);
  }
  form.append("photo", await photo("clean-1.jpg"));
  form.append("photo", await photo("clean-2.jpg"));
  return client.collection("catches").create(form);
}

it("walks ops.md §9 Close and finalize once", async () => {
  const k = await as("K");
  const now = Date.now();

  // Setup: K creates and opens a tournament (judge K, backup judge N); M and K fish in it.
  const created = await sendEventChange(k, null, eventBody({ ...EMPTY_FORM, name: "Walk Bass 2027", startsAt: "", endsAt: "", species: [world.species.largemouth.id], judge: users.K.id, backupJudge: users.N.id }, "new"));
  if (created.kind !== "saved") throw new Error("draft not saved");
  const id = created.event.id;
  await k.collection("events").update(id, { starts_at: iso(now - 10 * DAY), ends_at: iso(now + HOUR) });
  expect(await sendEventChange(k, id, { status: "live" })).toMatchObject({ kind: "saved" });
  const m = await as("M");
  const mEntry = await m.collection("entries").create({ event: id, angler: users.M.id });
  const kEntry = (await harness.superuser.collection("entries").getFullList({ filter: `event = "${id}" && angler = "${users.K.id}"` }))[0]!;
  const mFish = await submit(m, mEntry.id, 5500, now - 2 * HOUR);
  const mFish2 = await submit(m, mEntry.id, 4000, now - 3 * HOUR);
  const kFish = await submit(k, kEntry.id, 6000, now - HOUR);
  note(`setup: "Walk Bass 2027" (${id}) created as a draft by K, opened; M joined; 3 catches pending (M 3 lb 7 oz, M 2 lb 8 oz, K 3 lb 12 oz)`);

  // Time passes: the window closed 25 h ago, so the final deadline (ends_at + 24 h) passed 1 h ago.
  const ends = now - 25 * HOUR;
  await harness.superuser.collection("events").update(id, { ends_at: iso(ends), submit_deadline: iso(ends + DAY) });

  // 1. An outage of 2 h 20 min fell in the 24 h after the window closed: while still live, extend
  //    by the new total in whole hours, rounded up (3 h). The window doesn't move (example 23).
  const extended = await sendEventChange(k, id, { deadline_ext_min: 180 });
  expect(extended).toMatchObject({ kind: "saved" });
  if (extended.kind !== "saved") throw new Error("not extended");
  expect(Date.parse(String(extended.event.ends_at).replace(" ", "T"))).toBe(ends);
  expect(Date.parse(String(extended.event.submit_deadline).replace(" ", "T"))).toBe(ends + DAY + 3 * HOUR);
  // Joining and submitting reopen until the new deadline; a fish caught after the window is still flagged.
  const y = await as("Y");
  const yEntry = await y.collection("entries").create({ event: id, angler: users.Y.id });
  const yLate = await submit(y, yEntry.id, 5000, now - 2 * HOUR);
  expect(yLate.flags).toContain("after_window");
  expect(await retryEventChange(k, id, { deadline_ext_min: 180 })).toEqual({ kind: "already-saved" });
  note("1. outage 2 h 20 min after the window closed → K extended to a 3 h total while live: deadline ends_at + 27 h, ends_at unchanged; Y joined and submitted during the extension, flagged after_window; a repeated 3 h total is already saved");

  // 2. After submit_deadline: set closed. Refused before it, allowed after.
  expect(await sendEventChange(k, id, { status: "closed" })).toMatchObject({ kind: "refused", reason: "close_too_early" });
  await harness.superuser.collection("events").update(id, { submit_deadline: iso(Date.now() - 60_000) });
  expect((await loadManage(k, id, users.K.id, Date.now())).phase).toBe("live:over");
  expect(await sendEventChange(k, id, { status: "closed" })).toMatchObject({ kind: "saved" });
  note("2. close before the final deadline refused (close_too_early); after it, K closed the tournament");

  // 3. Clear the queue; the backup judge clears the judge's own catches. Finalize waits until then.
  let manage = await loadManage(k, id, users.K.id, Date.now());
  expect(manage.counts).toMatchObject({ pending: 4, pendingForJudge: 3, pendingForBackup: 1 });
  expect(await sendEventChange(k, id, { status: "final" })).toMatchObject({ kind: "refused", reason: "finalize_pending" });
  const reload = (record: RecordModel) => harness.superuser.collection("catches").getOne(record.id);
  expect(await sendDecision(k, catchBaseOf(await reload(mFish)), "pending", { kind: "approve" })).toMatchObject({ kind: "saved" });
  expect(await sendDecision(k, catchBaseOf(await reload(mFish2)), "pending", { kind: "approve" })).toMatchObject({ kind: "saved" });
  expect(await sendDecision(k, catchBaseOf(await reload(yLate)), "pending", { kind: "reject", reason: "Caught after the tournament window." })).toMatchObject({ kind: "saved" });
  // K can't judge their own catch; N, the backup judge, does.
  expect(await sendDecision(k, catchBaseOf(await reload(kFish)), "pending", { kind: "approve" })).not.toMatchObject({ kind: "saved" });
  expect(await sendDecision(await as("N"), catchBaseOf(await reload(kFish)), "pending", { kind: "approve" })).toMatchObject({ kind: "saved" });
  manage = await loadManage(k, id, users.K.id, Date.now());
  expect(manage.counts.pending).toBe(0);
  note("3. finalize refused with 4 pending (3 for the judge, 1 for the backup judge); K approved M's two, rejected Y's late fish with a reason; K's own was refused to K and approved by N; 0 pending");

  // 4. Optional previews while closed: both files build (the screen shows them unhashed).
  const preview = await buildExports(await loadExportData(k, id));
  expect(preview.results.rows).toBe(2);
  note(`4. previews built while closed: ${preview.results.fileName} (${preview.results.rows} rows), ${preview.audit.fileName} (${preview.audit.rows} rows)`);

  // 5. Set final (the "I've checked the standings" switch is the screen's; the request is this).
  expect(await sendEventChange(k, id, { status: "final" })).toMatchObject({ kind: "saved" });
  expect(await sendEventChange(k, id, { name: "Renamed" })).toMatchObject({ kind: "refused", reason: "final" });
  note("5. K finalized; any change afterwards is refused (final)");

  // 6. Exports: both files with their SHA-256; the results are the leaderboard's standings.
  const data = await loadExportData(k, id);
  const files = await buildExports(data);
  const again = await buildExports(await loadExportData(k, id));
  expect(again.results.sha256).toBe(files.results.sha256);
  expect(again.audit.sha256).toBe(files.audit.sha256);
  const board = leaderboardFromRecords({ event: data.event, entries: data.entries, catches: data.catches, viewerId: users.K.id, units: "lb", nowMs: Date.now() });
  const lines = files.results.text.trimEnd().split("\n").slice(1).map((line) => line.split(","));
  expect(lines.map((cells) => [Number(cells[0]), cells[2], cells[5]])).toEqual(board.view.rows.map((row) => [row.place, row.displayName, row.total]));
  expect(lines.map((cells) => cells.slice(0, 6).join(","))).toEqual([`1,${users.M.id},${users.M.name},2,9500,5.94`, `2,${users.K.id},${users.K.name},1,6000,3.75`]);
  const actions = files.audit.text.trimEnd().split("\n").slice(1).map((line) => line.split(",")[2]);
  for (const action of ["open", "close", "finalize"]) expect(actions.filter((a) => a === action)).toHaveLength(1);
  // Two edits: the draft's dates, then the outage extension.
  expect(actions.filter((a) => a === "event_edit")).toHaveLength(2);
  note(`6. exports: ${files.results.fileName} ${files.results.sha256}; ${files.audit.fileName} ${files.audit.sha256} (${files.audit.rows} audit rows: one open, two event_edit (the draft's dates, the extension), one close, one finalize); results equal the leaderboard (M 1st 5.94 lb, K 2nd 3.75 lb); the same data gives the same hashes`);

  // 7. Post-finalize backup: a host step (ops.md §7), not run here.
  note("7. post-finalize backup: host step, not run here");

  // 8. archive-event.sh: copy on the host, verify on the desktop, then remove with the desktop's hash.
  const archive = path.join(root, "host-archive");
  const copy = await script(["copy", "--pb-data", pbData, "--archive", archive, id]);
  expect(copy.code, copy.stderr).toBe(0);
  const hostHash = /Manifest sha256: ([0-9a-f]{64})/.exec(copy.stdout)?.[1] ?? "";
  const desktop = path.join(root, "desktop");
  await cp(archive, desktop, { recursive: true });
  const verify = await script(["verify", "--archive", desktop, id]);
  expect(verify.code, verify.stderr).toBe(0);
  const desktopHash = /Manifest sha256: ([0-9a-f]{64})/.exec(verify.stdout)?.[1] ?? "";
  expect(desktopHash).toBe(hostHash);
  const remove = await script(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", desktopHash, id]);
  expect(remove.code, remove.stderr).toBe(0);
  const storage = path.join(pbData, "storage", (await harness.superuser.collections.getOne("catches")).id);
  for (const record of [mFish, mFish2, kFish, yLate]) {
    for (const file of (await reload(record)).photo as string[]) expect(existsSync(path.join(storage, record.id, file))).toBe(false);
  }
  // The app now shows "Photo archived" and asks for no photo file.
  const tournament = await loadTournament(m, users.M.id, id);
  let tokens = 0;
  const getToken = m.files.getToken.bind(m.files);
  m.files.getToken = (...args) => {
    tokens++;
    return getToken(...args);
  };
  const mine = await loadMyCatches(m, tournament!, users.M.id, "lb", Date.now());
  expect(mine.catches.every((item) => item.photos.every((p) => p.url === ""))).toBe(true);
  expect(tokens).toBe(0);
  note(`8. archive-event.sh copy: 8 photos, manifest ${hostHash}; desktop verify printed the same hash; remove with it deleted the 8 originals from storage; My catches asks for no file token ("Photo archived")`);

  // 9, 10. The laptop's pull and FREEZE / apt timers are host steps, not run here.
  note("9. laptop pull and verify: host step, not run here (the same verify command)");
  note("10. remove FREEZE, start the apt timers: host step, not run here");
}, 120_000);
