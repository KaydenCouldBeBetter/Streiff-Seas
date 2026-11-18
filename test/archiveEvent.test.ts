// S4 step 10: scripts/archive-event.sh run on a seeded copy (decisions.md 2026-09-30 "Photo
// archive flow"; architecture.md §4b; SPEC invariants 4 and 6). A real PocketBase with the
// fixture world; the script reads that server's own pb_data. sqlite3 is the node:sqlite shim
// (test/harness/shims/sqlite3.mjs); exiftool and sha256sum are the real ones.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT, startPocketBase, type Harness } from "./harness/pocketbase";
import { createFixtureUsers, type FixtureUsers } from "./harness/users";
import { CATCH_KEYS, catchOf, parseCatchKey, seedWorld, type World } from "./harness/world";

const SCRIPT = path.join(REPO_ROOT, "scripts", "archive-event.sh");
const SHIMS = path.join(REPO_ROOT, "test", "harness", "shims");

let root: string;
let harness: Harness;
let users: FixtureUsers;
let world: World;
let pbData: string;
let storage: string;
let bin: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "chromie-archive-"));
  const pbRoot = path.join(root, "pb");
  await mkdir(pbRoot);
  harness = await startPocketBase({ tmpRoot: pbRoot });
  const [workDir] = await readdir(pbRoot);
  pbData = path.join(pbRoot, workDir!, "pb_data");
  users = await createFixtureUsers(harness);
  world = await seedWorld(harness, users);
  const catches = await harness.superuser.collections.getOne("catches");
  storage = path.join(pbData, "storage", catches.id);

  bin = path.join(root, "bin");
  await mkdir(bin);
  await mkdir(path.join(root, "shim"));
  await writeFile(path.join(root, "shim", "calls.log"), "");
  await writeFile(path.join(bin, "sqlite3"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(SHIMS, "sqlite3.mjs")}" "$@"\n`);
  await chmod(path.join(bin, "sqlite3"), 0o755);
}, 60_000);

afterAll(async () => {
  await harness?.stop();
  await rm(root, { recursive: true, force: true });
});

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], extraPath = ""): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [SCRIPT, ...args],
      { env: { ...process.env, PATH: `${extraPath}${bin}:${process.env.PATH}`, SHIM_DIR: path.join(root, "shim") } },
      (error, stdout, stderr) => resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
  });
}

/** Every photo of every EF catch, as "<catch>/<file>": EF is the world's final tournament. */
async function efPhotos(): Promise<string[]> {
  const out: string[] = [];
  for (const key of CATCH_KEYS.filter((k) => parseCatchKey(k).event === "EF")) {
    const record = await harness.superuser.collection("catches").getOne(catchOf(world, key).id);
    for (const file of record.photo as string[]) out.push(`${record.id}/${file}`);
  }
  return out.sort();
}

const sha = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");
const manifestHash = (stdout: string) => /Manifest sha256: ([0-9a-f]{64})/.exec(stdout)?.[1] ?? "";
const auditCount = async () => (await harness.superuser.collection("audit_log").getList(1, 1)).totalItems;

describe("archive-event.sh", () => {
  let archive: string;
  let hash: string;

  beforeAll(async () => {
    archive = path.join(root, "host-archive");
  });

  it("refuses a tournament that isn't final, a bad id and an unknown command", async () => {
    const live = await run(["copy", "--pb-data", pbData, "--archive", archive, world.events.E1.id]);
    expect(live.code).toBe(3);
    expect(live.stderr).toMatch(/is live, not final/);
    expect(existsSync(path.join(archive, world.events.E1.id))).toBe(false);
    expect((await run(["copy", "--pb-data", pbData, "--archive", archive, "../etc"])).code).toBe(2);
    expect((await run(["shred", "--archive", archive, world.events.EF.id])).code).toBe(2);
  });

  it("stops when a photo carries location metadata, and leaves nothing behind", async () => {
    const [first] = await efPhotos();
    const original = path.join(storage, first!);
    const saved = await readFile(original);
    try {
      await cp(path.join(REPO_ROOT, "test", "fixtures", "gps.jpg"), original);
      const leaked = await run(["copy", "--pb-data", pbData, "--archive", archive, world.events.EF.id]);
      expect(leaked.code).toBe(5);
      expect(leaked.stderr).toMatch(/location metadata in .*GPS/s);
      expect(existsSync(archive) ? await readdir(archive) : []).toEqual([]);
    } finally {
      await writeFile(original, saved);
    }
  });

  it("copy: every photo of the final tournament, byte for byte, with a manifest and its hash", async () => {
    const audit = await auditCount();
    const result = await run(["copy", "--pb-data", pbData, "--archive", archive, world.events.EF.id]);
    expect(result.code, result.stderr).toBe(0);
    hash = manifestHash(result.stdout);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const dest = path.join(archive, world.events.EF.id);
    const photos = await efPhotos();
    // Rejected catches are archived too: they are part of the record the audit hash covers.
    expect(photos).toHaveLength(6);
    for (const photo of photos) expect(await sha(path.join(dest, "photos", photo))).toBe(await sha(path.join(storage, photo)));
    const manifest = (await readFile(path.join(dest, "MANIFEST.sha256"), "utf8")).trimEnd().split("\n");
    expect(manifest.map((line) => line.slice(66)).sort()).toEqual(["EVENT.txt", ...photos.map((p) => `photos/${p}`)].sort());
    expect(await readFile(path.join(dest, "EVENT.txt"), "utf8")).toMatch(new RegExp(`^event ${world.events.EF.id}\nname EF Final\nphotos 6\ncopied \\d{4}-`));
    expect(hash).toBe(await sha(path.join(dest, "MANIFEST.sha256")));
    // Read only, and nothing written through the API.
    expect((await stat(path.join(dest, "photos", photos[0]!))).mode & 0o222).toBe(0);
    expect(await auditCount()).toBe(audit);
    // The originals are still in the app.
    for (const photo of photos) expect(existsSync(path.join(storage, photo))).toBe(true);
  });

  it("copy again is refused: already archived", async () => {
    const again = await run(["copy", "--pb-data", pbData, "--archive", archive, world.events.EF.id]);
    expect(again.code).toBe(4);
  });

  it("verify on the desktop's pulled copy prints the same manifest hash; a changed or extra file fails", async () => {
    const desktop = path.join(root, "desktop");
    await cp(archive, desktop, { recursive: true });
    const ok = await run(["verify", "--archive", desktop, world.events.EF.id]);
    expect(ok.code, ok.stderr).toBe(0);
    expect(manifestHash(ok.stdout)).toBe(hash);

    const bad = path.join(root, "desktop-bad");
    await cp(archive, bad, { recursive: true });
    const [first] = await efPhotos();
    const target = path.join(bad, world.events.EF.id, "photos", first!);
    await chmod(target, 0o644);
    await writeFile(target, "not the photo");
    expect((await run(["verify", "--archive", bad, world.events.EF.id])).code).toBe(7);

    const extra = path.join(root, "desktop-extra");
    await cp(archive, extra, { recursive: true });
    await writeFile(path.join(extra, world.events.EF.id, "photos", "stray.jpg"), "x");
    expect((await run(["verify", "--archive", extra, world.events.EF.id])).code).toBe(7);
  });

  it("remove refuses a desktop hash that doesn't match, and a malformed one; nothing is removed", async () => {
    const wrong = await run(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", "0".repeat(64), world.events.EF.id]);
    expect(wrong.code).toBe(6);
    expect((await run(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", "abc", world.events.EF.id])).code).toBe(2);
    for (const photo of await efPhotos()) expect(existsSync(path.join(storage, photo))).toBe(true);
  });

  it("remove refuses an archive that no longer matches the database's photo list, even with its own hash", async () => {
    // A copy missing one photo, with a manifest rebuilt to match: it verifies, but it isn't the whole tournament.
    const short = path.join(root, "short");
    await cp(archive, short, { recursive: true });
    const dir = path.join(short, world.events.EF.id);
    const [first] = await efPhotos();
    await chmod(path.join(dir, "MANIFEST.sha256"), 0o644);
    await rm(path.join(dir, "photos", first!));
    const lines = (await readFile(path.join(dir, "MANIFEST.sha256"), "utf8")).split("\n").filter((line) => line !== "" && !line.endsWith(`photos/${first}`));
    await writeFile(path.join(dir, "MANIFEST.sha256"), lines.join("\n") + "\n");
    const shortHash = await sha(path.join(dir, "MANIFEST.sha256"));
    const refused = await run(["remove", "--pb-data", pbData, "--archive", short, "--desktop-manifest", shortHash, world.events.EF.id]);
    expect(refused.code).toBe(7);
    expect(refused.stderr).toMatch(/differ; nothing removed/);
    for (const photo of await efPhotos()) expect(existsSync(path.join(storage, photo))).toBe(true);
  });

  it("remove --dry-run lists what it would remove and changes nothing", async () => {
    const dry = await run(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", hash, "--dry-run", world.events.EF.id]);
    expect(dry.code, dry.stderr).toBe(0);
    expect(dry.stdout).toMatch(/Dry run: 6 photos would be removed/);
    for (const photo of await efPhotos()) expect(existsSync(path.join(storage, photo))).toBe(true);
  });

  it("remove: the originals and thumbnails go, outside the API; the records and every other tournament's photos stay", async () => {
    const photos = await efPhotos();
    // A thumbnail PocketBase would have made on request.
    const [catchId, file] = photos[0]!.split("/");
    await mkdir(path.join(storage, catchId!, `thumbs_${file}`));
    await writeFile(path.join(storage, catchId!, `thumbs_${file}`, `100x100_${file}`), "thumb");
    const e1Photo = catchOf(world, "E1.M.verified");
    const before = await harness.superuser.collection("catches").getOne(catchOf(world, "EF.N.verified").id);
    const audit = await auditCount();

    const removed = await run(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", hash, world.events.EF.id]);
    expect(removed.code, removed.stderr).toBe(0);
    expect(removed.stdout).toMatch(/Removed 6 photos from the app \(0 were already gone\)/);

    for (const photo of photos) expect(existsSync(path.join(storage, photo))).toBe(false);
    expect(existsSync(path.join(storage, catchId!, `thumbs_${file}`))).toBe(false);
    // Invariant 6: no record changed or deleted, no audit row; the filenames stay for "Photo archived".
    expect(await harness.superuser.collection("catches").getOne(before.id)).toEqual(before);
    expect(await auditCount()).toBe(audit);
    // Other tournaments keep their photos.
    for (const file of e1Photo.photo as string[]) expect(existsSync(path.join(storage, e1Photo.id, file))).toBe(true);
    // The archive is untouched.
    expect((await run(["verify", "--archive", archive, world.events.EF.id])).code).toBe(0);
  });

  it("remove again is safe: everything already gone", async () => {
    const again = await run(["remove", "--pb-data", pbData, "--archive", archive, "--desktop-manifest", hash, world.events.EF.id]);
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/Removed 0 photos from the app \(6 were already gone\)/);
  });

  it("stops with a clear message when a tool is missing", async () => {
    const empty = path.join(root, "nobin");
    await mkdir(empty);
    // Only bash's own directory and the shim: no exiftool there.
    const result = await new Promise<Run>((resolve) => {
      execFile("/bin/bash", [SCRIPT, "copy", "--pb-data", pbData, "--archive", path.join(root, "other"), world.events.EF.id], { env: { PATH: `${bin}:${empty}` } }, (error, stdout, stderr) =>
        resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }),
      );
    });
    expect(result.code).toBe(9);
    expect(result.stderr).toMatch(/is not installed/);
  });
});
