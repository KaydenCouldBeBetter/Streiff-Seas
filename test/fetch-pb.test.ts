import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./harness/pocketbase";

const SCRIPT = path.join(REPO_ROOT, "scripts", "fetch-pb.sh");
const BINARY = path.join(REPO_ROOT, "pocketbase");

interface Result {
  code: number | string | null;
  stderr: string;
}

function run(env: NodeJS.ProcessEnv): Promise<Result> {
  return new Promise((resolve) => {
    execFile(SCRIPT, { env: { ...process.env, ...env } }, (error, _stdout, stderr) => {
      resolve({ code: error === null ? 0 : (error.code ?? null), stderr });
    });
  });
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
});
