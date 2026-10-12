// Boots a throwaway PocketBase (the pinned binary) from an empty data directory with the
// repo's pb_migrations/ and pb_hooks/, one per test file, and removes it afterwards.

import { execFile, spawn, type ChildProcess, type ExecFileException } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const PIN_FILE = path.join(REPO_ROOT, "POCKETBASE_VERSION");

/** Path the deploy smoke tests use too; 200 with a JSON body on the pinned version. */
export const HEALTH_PATH = "/api/health";

/** What the stub index.html in the throwaway public directory contains. */
export const STUB_INDEX_MARKER = "harness-index";

/** For the whole of startPocketBase, so it settles well inside Vitest's hookTimeout. */
const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;
const HEALTH_FETCH_TIMEOUT_MS = 2_000;
const VERSION_TIMEOUT_MS = 5_000;
const PORT_ATTEMPTS = 5;

/** `serve` prints this once it holds its port, and never when the port was taken. */
const STARTED_BANNER = "Server started at";
const PORT_TAKEN = "address already in use";

export interface Harness {
  /** Base URL of this instance, e.g. http://127.0.0.1:41873 */
  url: string;
  /** A client signed in as this instance's superuser. Bypasses every API rule. */
  superuser: PocketBase;
  /** A new client for this instance with no auth. */
  client(): PocketBase;
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Migrations to boot from; the repo's pb_migrations/ unless a test says otherwise. */
  migrationsDir?: string;
  /** Where the throwaway directory is made; the system temp directory by default. */
  tmpRoot?: string;
  /** The port to try next. A port that turns out to be taken is asked for again. */
  pickPort?: () => Promise<number>;
}

/** The version on the POCKETBASE_VERSION= line of the pin file. */
export async function pinnedVersion(): Promise<string> {
  const version = /^POCKETBASE_VERSION=(\S+)$/m.exec(await readFile(PIN_FILE, "utf8"))?.[1];
  if (version === undefined) throw new Error("POCKETBASE_VERSION has no POCKETBASE_VERSION= line");
  return version;
}

/**
 * Rejects unless the binary runs and reports the version pinned in POCKETBASE_VERSION, so a
 * green run is never a run against a stale or half-written ./pocketbase.
 */
export async function assertPinnedBinary(binary: string = BINARY): Promise<void> {
  const pinned = await pinnedVersion();
  const name = binary === BINARY ? "./pocketbase" : binary;
  let reported: string;
  try {
    reported = (await execFileAsync(binary, ["--version"], { timeout: VERSION_TIMEOUT_MS })).stdout.trim();
  } catch {
    throw new Error(`No usable ${name} binary (POCKETBASE_VERSION pins ${pinned}). Run scripts/fetch-pb.sh.`);
  }
  if (reported !== `pocketbase version ${pinned}`) {
    throw new Error(`${name} reports "${reported}" but POCKETBASE_VERSION pins ${pinned}. Run scripts/fetch-pb.sh.`);
  }
}

/** Checked once per test file, on its first boot. */
let binaryChecked: Promise<void> | undefined;

/** A port that was free a moment ago. Nothing holds it, so `serve` can still lose it. */
export function freePort(): Promise<number> {
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

/**
 * Whether the health endpoint answers there as PocketBase does. A 200 alone isn't enough
 * (the index fallback gives every unknown path one), and a connection that hangs counts as no.
 */
export async function isHealthy(url: string, timeoutMs: number = HEALTH_FETCH_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetch(url + HEALTH_PATH, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "code" in body && body.code === 200;
  } catch {
    // Not listening yet, not JSON, or no answer in time.
    return false;
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * A random password for the throwaway superuser: 48 lowercase hex characters. It goes on the
 * command line, so it must never begin with "-" (base64url can): PocketBase would read it as
 * flags, fail the boot, and with an "h" in it skip every flag after it, --dir included.
 */
export function superuserPassword(): string {
  return randomBytes(24).toString("hex");
}

async function createSuperuser(email: string, password: string, dirFlags: string[], deadline: number): Promise<void> {
  try {
    // Flags first, then "--", so nothing after it can be read as a flag.
    await execFileAsync(BINARY, ["superuser", "upsert", ...dirFlags, "--", email, password], {
      timeout: Math.max(1, deadline - Date.now()),
    });
  } catch (error) {
    // execFile's own message is the whole command line, password included, and would end up
    // in the test output. Keep what PocketBase printed and drop the rest.
    const { code, signal, stdout = "", stderr = "" } = error as ExecFileException & { stdout?: string; stderr?: string };
    const printed = (stderr + stdout).replaceAll(password, "<password>").trim();
    throw new Error(`pocketbase superuser upsert failed (${code ?? signal ?? "no exit code"}):\n${printed}`);
  }
}

interface Server {
  child: ChildProcess;
  url: string;
}

/**
 * Starts `serve` on a port from pickPort and waits until that child, and no other process,
 * is the one answering there: first for its own start banner, only then for the health
 * endpoint. A port that was taken in the meantime is not an error; the next one is tried.
 */
async function serve(dirFlags: string[], cwd: string, pickPort: () => Promise<number>, deadline: number): Promise<Server> {
  for (let attempt = 1; ; attempt++) {
    const port = await pickPort();
    const url = `http://127.0.0.1:${port}`;
    const child = spawn(BINARY, ["serve", "--http", `127.0.0.1:${port}`, ...dirFlags], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString()));
    // "close" comes after "exit", once everything the child printed has been read.
    let closed = false;
    child.once("close", () => (closed = true));
    // If the test process exits without running afterAll, don't leave the server behind.
    const killOnExit = () => child.kill("SIGKILL");
    process.once("exit", killOnExit);
    child.once("exit", () => process.off("exit", killOnExit));

    try {
      let listening = false;
      while (!listening) {
        if (log.includes(STARTED_BANNER)) {
          listening = true;
        } else if (closed) {
          if (!log.includes(PORT_TAKEN)) throw new Error(`PocketBase exited before it was listening:\n${log}`);
          break;
        } else if (Date.now() >= deadline) {
          throw new Error(`PocketBase was not listening after ${START_TIMEOUT_MS} ms:\n${log}`);
        } else {
          await pause(20);
        }
      }
      if (!listening) {
        if (attempt === PORT_ATTEMPTS) throw new Error(`No free port in ${PORT_ATTEMPTS} tries:\n${log}`);
        continue;
      }

      while (!(await isHealthy(url))) {
        if (hasExited(child)) throw new Error(`PocketBase exited before it was healthy:\n${log}`);
        if (Date.now() >= deadline) throw new Error(`PocketBase was not healthy after ${START_TIMEOUT_MS} ms:\n${log}`);
        await pause(50);
      }
      return { child, url };
    } catch (error) {
      await stopProcess(child);
      throw error;
    }
  }
}

export async function startPocketBase(options: StartOptions = {}): Promise<Harness> {
  await (binaryChecked ??= assertPinnedBinary());
  const deadline = Date.now() + START_TIMEOUT_MS;

  const workDir = await mkdtemp(path.join(options.tmpRoot ?? tmpdir(), "chromie-pb-"));
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child !== undefined) await stopProcess(child);
    await rm(workDir, { recursive: true, force: true });
  };

  // From here on, nothing may fail without stopping the server and removing workDir.
  try {
    const dataDir = path.join(workDir, "pb_data");
    const publicDir = path.join(workDir, "pb_public");
    await mkdir(publicDir);
    await writeFile(path.join(publicDir, "index.html"), `<!doctype html><title>${STUB_INDEX_MARKER}</title>\n`);

    const dirFlags = [
      "--dir", dataDir,
      "--migrationsDir", options.migrationsDir ?? path.join(REPO_ROOT, "pb_migrations"),
      "--hooksDir", path.join(REPO_ROOT, "pb_hooks"),
      "--publicDir", publicDir,
      // Never write a generated migration into the repo, and don't watch pb_hooks/.
      "--automigrate=false",
      "--hooksWatch=false",
    ];

    // The impersonate endpoint needs a superuser. This one exists only in the throwaway data
    // directory. Its password is random and is passed on the command line, which is the only
    // way the CLI takes it; it opens nothing but this loopback instance.
    const email = "harness@example.test";
    const password = superuserPassword();
    await createSuperuser(email, password, dirFlags, deadline);

    const server = await serve(dirFlags, workDir, options.pickPort ?? freePort, deadline);
    child = server.child;
    const { url } = server;

    const client = () => {
      const pb = new PocketBase(url);
      pb.autoCancellation(false);
      return pb;
    };
    const superuser = client();
    await superuser.collection("_superusers").authWithPassword(email, password, {
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    return { url, superuser, client, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export interface Lifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The running instance; throws outside start() … stop(). */
  get(): Harness;
}

/**
 * One instance's start and stop, as beforeAll and afterAll call them. stop() also covers a
 * start() that hasn't finished, which is what a timed-out beforeAll leaves behind: it waits
 * for that instance and stops it, instead of finding nothing to stop yet.
 */
export function harnessLifecycle(boot: () => Promise<Harness> = startPocketBase): Lifecycle {
  let booting: Promise<Harness> | undefined;
  let harness: Harness | undefined;

  return {
    async start() {
      const mine = boot();
      booting = mine;
      const booted = await mine;
      if (booting === mine) harness = booted;
    },
    async stop() {
      const pending = booting;
      booting = undefined;
      harness = undefined;
      if (pending === undefined) return;
      // A failed boot has already cleaned up after itself.
      const booted = await pending.catch(() => undefined);
      await booted?.stop();
    },
    get() {
      if (harness === undefined) throw new Error("PocketBase is not running (use inside a test)");
      return harness;
    },
  };
}

/**
 * Gives the calling test file its own fresh PocketBase: started before its tests and
 * stopped after them. Call at the top of the file and use the returned getter in tests.
 */
export function usePocketBase(): () => Harness {
  const lifecycle = harnessLifecycle();
  beforeAll(() => lifecycle.start());
  afterAll(() => lifecycle.stop());
  return () => lifecycle.get();
}
