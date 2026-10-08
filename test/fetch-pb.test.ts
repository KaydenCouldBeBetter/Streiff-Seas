import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./harness/pocketbase";

const SCRIPT = path.join(REPO_ROOT, "scripts", "fetch-pb.sh");
const BINARY = path.join(REPO_ROOT, "pocketbase");

interface Result {
  code: number | string | null;
  stderr: string;
}

function run(env: NodeJS.ProcessEnv, script: string = SCRIPT): Promise<Result> {
  return new Promise((resolve) => {
    execFile(script, { env: { ...process.env, ...env } }, (error, _stdout, stderr) => {
      resolve({ code: error === null ? 0 : (error.code ?? null), stderr });
    });
  });
}

/** A zip holding one uncompressed file: all unzip needs, without a zip tool on the machine. */
function storedZip(name: string, data: Buffer): Buffer {
  const fileName = Buffer.from(name);
  const crc = crc32(data);
  const DOS_DATE_1980_01_01 = 0x21;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + data.length, 16);

  return Buffer.concat([local, fileName, data, central, fileName, end]);
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

describe("scripts/fetch-pb.sh", () => {
  let mirror: string;

  beforeAll(async () => {
    const pin = await readFile(path.join(REPO_ROOT, "POCKETBASE_VERSION"), "utf8");
    const version = /^POCKETBASE_VERSION=(.+)$/m.exec(pin)?.[1];
    if (version === undefined) throw new Error("POCKETBASE_VERSION has no version line");

    // A stand-in for the release download whose zip is not the pinned one.
    mirror = await mkdtemp(path.join(tmpdir(), "chromie-fetch-"));
    await mkdir(path.join(mirror, `v${version}`));
    await writeFile(path.join(mirror, `v${version}`, `pocketbase_${version}_linux_amd64.zip`), "not the pinned zip");
  });

  afterAll(async () => {
    await rm(mirror, { recursive: true, force: true });
  });

  it("exits non-zero and leaves the binary alone when the checksum doesn't match", async () => {
    const before = await sha256(BINARY);

    const result = await run({ PB_DOWNLOAD_BASE: pathToFileURL(mirror).href });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("sha256 mismatch");
    expect(await sha256(BINARY)).toBe(before);
  });

  it("leaves no work files in the repo when the checksum doesn't match", async () => {
    await run({ PB_DOWNLOAD_BASE: pathToFileURL(mirror).href });

    expect((await readdir(REPO_ROOT)).filter((name) => name.startsWith(".fetch-pb."))).toEqual([]);
  });

  it("replaces the binary with the verified one, working inside the repo and not in the temp directory", async () => {
    // A stand-in repo: the script itself, a pin for a made-up release, and an old binary.
    const repo = path.join(mirror, "repo");
    const release = Buffer.from("#!/bin/sh\necho stand-in pocketbase\n");
    const zip = storedZip("pocketbase", release);
    await mkdir(path.join(repo, "scripts"), { recursive: true });
    await copyFile(SCRIPT, path.join(repo, "scripts", "fetch-pb.sh"));
    await chmod(path.join(repo, "scripts", "fetch-pb.sh"), 0o755);
    await writeFile(
      path.join(repo, "POCKETBASE_VERSION"),
      `POCKETBASE_VERSION=9.9.9\nPOCKETBASE_SHA256_LINUX_AMD64=${createHash("sha256").update(zip).digest("hex")}\n`,
    );
    await writeFile(path.join(repo, "pocketbase"), "the old binary");
    await mkdir(path.join(mirror, "v9.9.9"));
    await writeFile(path.join(mirror, "v9.9.9", "pocketbase_9.9.9_linux_amd64.zip"), zip);

    // With no usable temp directory, only work files beside the binary can get it this far,
    // and from there the install is a rename: never a partly copied ./pocketbase.
    const result = await run(
      { PB_DOWNLOAD_BASE: pathToFileURL(mirror).href, TMPDIR: path.join(mirror, "no-such-tmp") },
      path.join(repo, "scripts", "fetch-pb.sh"),
    );

    expect(result).toEqual({ code: 0, stderr: "" });
    expect(await readFile(path.join(repo, "pocketbase"))).toEqual(release);
    expect((await stat(path.join(repo, "pocketbase"))).mode & 0o111).toBe(0o111);
    expect((await readdir(repo)).sort()).toEqual(["POCKETBASE_VERSION", "pocketbase", "scripts"]);
  });
});
