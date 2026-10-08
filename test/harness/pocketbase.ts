// Boots a throwaway PocketBase (the pinned binary) from an empty data directory with the
// repo's pb_migrations/ and pb_hooks/, one per test file, and removes it afterwards.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import PocketBase from "pocketbase";
import { afterAll, beforeAll } from "vitest";

const execFileAsync = promisify(execFile);

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BINARY = path.join(REPO_ROOT, "pocketbase");

/** Path the deploy smoke tests use too; 200 with a JSON body on the pinned version. */
export const HEALTH_PATH = "/api/health";

/** What the stub index.html in the throwaway public directory contains. */
export const STUB_INDEX_MARKER = "harness-index";

const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;

export interface Harness {
  /** Base URL of this instance, e.g. http://127.0.0.1:41873 */
  url: string;
  /** A client signed in as this instance's superuser. Bypasses every API rule. */
  superuser: PocketBase;
  /** A new client for this instance with no auth. */
  client(): PocketBase;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not find a free port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitUntilHealthy(url: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(`PocketBase exited before it was healthy:\n${output()}`);
    }
    try {
      const response = await fetch(url + HEALTH_PATH);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`PocketBase was not healthy after ${START_TIMEOUT_MS} ms:\n${output()}`);
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (hasExited(child)) {
      resolve();
      return;
    }
    const force = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export async function startPocketBase(): Promise<Harness> {
  if (!existsSync(BINARY)) {
    throw new Error("No ./pocketbase binary. Run scripts/fetch-pb.sh first.");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "chromie-pb-"));
  const dataDir = path.join(workDir, "pb_data");
  const publicDir = path.join(workDir, "pb_public");
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, "index.html"), `<!doctype html><title>${STUB_INDEX_MARKER}</title>\n`);

  const dirFlags = [
    "--dir", dataDir,
    "--migrationsDir", path.join(REPO_ROOT, "pb_migrations"),
    "--hooksDir", path.join(REPO_ROOT, "pb_hooks"),
    "--publicDir", publicDir,
    // Never write a generated migration into the repo, and don't watch pb_hooks/.
    "--automigrate=false",
    "--hooksWatch=false",
  ];

  // The impersonate endpoint needs a superuser. This one exists only in the throwaway
  // data directory; the credentials are random and never leave this process.
  const email = "harness@example.test";
  const password = randomBytes(24).toString("base64url");
  await execFileAsync(BINARY, ["superuser", "upsert", email, password, ...dirFlags]);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(BINARY, ["serve", "--http", `127.0.0.1:${port}`, ...dirFlags], {
    cwd: workDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString()));
  // If the test process dies without running afterAll, don't leave the server behind.
  const killOnExit = () => child.kill("SIGKILL");
  process.once("exit", killOnExit);

  const stop = async () => {
    process.off("exit", killOnExit);
    await stopProcess(child);
    await rm(workDir, { recursive: true, force: true });
  };

  const client = () => {
    const pb = new PocketBase(url);
    pb.autoCancellation(false);
    return pb;
  };

  try {
    await waitUntilHealthy(url, child, () => log);
    const superuser = client();
    await superuser.collection("_superusers").authWithPassword(email, password);
    return { url, superuser, client, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/**
 * Gives the calling test file its own fresh PocketBase: started before its tests and
 * stopped after them. Call at the top of the file and use the returned getter in tests.
 */
export function usePocketBase(): () => Harness {
  let harness: Harness | undefined;
  beforeAll(async () => {
    harness = await startPocketBase();
  });
  afterAll(async () => {
    await harness?.stop();
    harness = undefined;
  });
  return () => {
    if (harness === undefined) throw new Error("PocketBase is not running (use inside a test)");
    return harness;
  };
}
