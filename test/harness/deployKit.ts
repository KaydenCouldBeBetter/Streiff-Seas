// A pretend server for scripts/deploy.sh (and make-bundle.sh, seed-staging): a temp directory with
// /etc/scoreboard, /opt/scoreboard, the backup and log directories, and a bin/ of shims (curl,
// systemctl, sqlite3) put first on PATH. Nothing reaches the network or a real service: GitHub,
// the PocketBase download and the Cloudflare smoke URL are all answered by the curl shim.
// tar, zstd, unzip, sha256sum and jq are the real ones.

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { crc32, gzipSync } from "node:zlib";
import { REPO_ROOT } from "./pocketbase";

export const DEPLOY = path.join(REPO_ROOT, "scripts", "deploy.sh");
const SHIMS = path.join(REPO_ROOT, "test", "harness", "shims");

export const GITHUB_API = "https://api.github.test";
export const REPO = "owner/repo";
export const SMOKE_URL = "https://scoreboard.test";
export const HEALTHCHECKS_URL = "https://hc.test/ping/staging";
export const PB_BASE = "https://pb.test/releases/download";
export const TOKEN = "github_pat_SECRET_do_not_print";
export const CF_SECRET = "cf-secret-do-not-print";
export const PB_VERSION = "9.9.9";

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** A 40-hex commit sha made from a word, so tests read "commit('one')". */
export function commit(word: string): string {
  return createHash("sha1").update(word).digest("hex");
}

// --- archives, written by hand so the bad ones (../, symlinks) build the same on every OS ------

export interface TarEntry {
  name: string;
  /** File contents; absent for a directory (name ends with "/") or a link. */
  data?: Buffer | string;
  /** A symlink to this target. */
  symlink?: string;
  mode?: number;
}

function tarHeader(entry: TarEntry, size: number, type: string): Buffer {
  const header = Buffer.alloc(512);
  const field = (value: string, offset: number, length: number) => header.write(value.slice(0, length), offset, "utf8");
  const octal = (value: number, offset: number, length: number) =>
    field(value.toString(8).padStart(length - 1, "0") + "\0", offset, length);
  field(entry.name, 0, 100);
  octal(entry.mode ?? (type === "5" ? 0o755 : 0o644), 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(size, 124, 12);
  octal(1_700_000_000, 136, 12);
  header.fill(" ", 148, 156);
  field(type, 156, 1);
  if (entry.symlink !== undefined) field(entry.symlink, 157, 100);
  field("ustar\0", 257, 6);
  field("00", 263, 2);
  let sum = 0;
  for (const byte of header) sum += byte;
  field(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return header;
}

export function tarGz(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    if (entry.symlink !== undefined) {
      blocks.push(tarHeader(entry, 0, "2"));
    } else if (entry.data === undefined) {
      blocks.push(tarHeader(entry, 0, "5"));
    } else {
      const data = Buffer.from(entry.data);
      blocks.push(tarHeader(entry, data.length, "0"), data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

/** A zip of uncompressed files: all unzip needs, without a zip tool on the machine. */
export function storedZip(files: { name: string; data: Buffer | string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// --- the PocketBase release the pin points at ---------------------------------------------------

/** The release zip: a stand-in binary that reports its version, as the real one does. */
export function pbZip(version: string = PB_VERSION, reports: string = version): Buffer {
  return storedZip([{ name: "pocketbase", data: `#!/bin/sh\necho "pocketbase version ${reports}"\n` }]);
}

export function pinFile(version: string = PB_VERSION, zip: Buffer = pbZip(version)): string {
  return `POCKETBASE_VERSION=${version}\nPOCKETBASE_SHA256_LINUX_AMD64=${sha256(zip)}\n`;
}

// --- bundles ------------------------------------------------------------------------------------

export interface BundleOptions {
  sha: string;
  migrations?: string[];
  pin?: string;
  /** build.json's sha; BUILD_INFO's by default. */
  appSha?: string;
  /** Extra raw entries (bad ones). */
  extra?: TarEntry[];
}

export function bundleEntries(options: BundleOptions): TarEntry[] {
  const migrations = options.migrations ?? ["1700000000_first.js"];
  return [
    { name: "pb_public/" },
    { name: "pb_public/index.html", data: "<!doctype html><title>app</title>" },
    { name: "pb_public/build.json", data: JSON.stringify({ sha: options.appSha ?? options.sha, built_at: "2026-11-17T00:00:00.000Z" }) },
    { name: "pb_hooks/" },
    { name: "pb_hooks/main.pb.js", data: "// hooks\n" },
    { name: "pb_migrations/" },
    ...migrations.map((name) => ({ name: `pb_migrations/${name}`, data: "// migration\n" })),
    { name: "POCKETBASE_VERSION", data: options.pin ?? pinFile() },
    { name: "BUILD_INFO", data: `${options.sha}\n` },
    ...(options.extra ?? []),
  ];
}

export interface Bundle {
  tar: Buffer;
  sha256File: string;
}

export function makeBundle(options: BundleOptions): Bundle {
  const tar = tarGz(bundleEntries(options));
  return { tar, sha256File: `${sha256(tar)}  bundle.tar.gz\n` };
}

export async function writeBundleDir(dir: string, bundle: Bundle): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "bundle.tar.gz"), bundle.tar);
  await writeFile(path.join(dir, "bundle.sha256"), bundle.sha256File);
  return dir;
}

// --- the pretend server -------------------------------------------------------------------------

export interface Route {
  status?: number;
  json?: unknown;
  body?: string;
  file?: string;
}

export interface Call {
  tool: "curl" | "systemctl" | "sqlite3";
  argv: string[];
  url?: string;
  headers?: string[];
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Server {
  root: string;
  etc: string;
  opt: string;
  backups: string;
  logDir: string;
  shimDir: string;
  env: NodeJS.ProcessEnv;
  routes: Record<string, Route>;
  /** Serves a file at a URL; the bytes are written under the temp dir. */
  serve(url: string, data: Buffer | string): Promise<void>;
  /** Writes routes.json; call after changing `routes`. */
  saveRoutes(): Promise<void>;
  run(args: string[], script?: string): Promise<RunResult>;
  calls(): Promise<Call[]>;
  clearCalls(): Promise<void>;
  /** The release `current` points to, relative ("releases/<id>"), or undefined. */
  current(): string | undefined;
  running(): Promise<{ running: boolean; release?: string; starts?: number }>;
  deployLog(): Promise<string>;
  /** Makes pb_data/data.db with an events table holding these statuses. */
  makeDatabase(statuses: string[]): Promise<void>;
  /** The release built from this commit answers its health check with 503. */
  breakHealth(sha: string): Promise<void>;
  /** The release built from this commit fails `systemctl start`. */
  breakStart(sha: string): Promise<void>;
}

export async function makeServer(environment: "prod" | "staging" = "prod"): Promise<Server> {
  const root = await mkdtemp(path.join(tmpdir(), "chromie-deploy-"));
  const etc = path.join(root, "etc");
  const opt = path.join(root, "opt");
  const backups = path.join(root, "backups");
  const logDir = path.join(root, "log");
  const shimDir = path.join(root, "shim");
  const bin = path.join(root, "bin");
  const served = path.join(root, "served");
  for (const dir of [etc, opt, shimDir, bin, served]) await mkdir(dir, { recursive: true });

  await writeFile(path.join(etc, "ENVIRONMENT"), `${environment}\n`);
  const envFile = path.join(etc, "deploy.env");
  await writeFile(
    envFile,
    [
      "# test values",
      `GITHUB_REPO=${REPO}`,
      `GITHUB_TOKEN=${TOKEN}`,
      `SMOKE_URL=${SMOKE_URL}/`,
      "CF_ACCESS_CLIENT_ID=probe.access",
      `CF_ACCESS_CLIENT_SECRET=${CF_SECRET}`,
      ...(environment === "staging" ? [`HEALTHCHECKS_URL=${HEALTHCHECKS_URL}`] : []),
      "",
    ].join("\n"),
  );
  await chmod(envFile, 0o600);

  for (const tool of ["curl", "systemctl", "sqlite3"]) {
    const wrapper = path.join(bin, tool);
    await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${path.join(SHIMS, `${tool}.mjs`)}" "$@"\n`);
    await chmod(wrapper, 0o755);
  }
  await writeFile(path.join(shimDir, "state.json"), JSON.stringify({ running: false }));
  await writeFile(path.join(shimDir, "calls.log"), "");

  const routes: Record<string, Route> = {};
  const saveRoutes = () => writeFile(path.join(shimDir, "routes.json"), JSON.stringify(routes));
  await saveRoutes();
  let servedCount = 0;

  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: root,
    LANG: "C",
    SHIM_DIR: shimDir,
    SHIM_OPT: opt,
    SHIM_SMOKE_URL: SMOKE_URL,
    SCOREBOARD_ETC: etc,
    SCOREBOARD_OPT: opt,
    SCOREBOARD_BACKUPS: backups,
    SCOREBOARD_LOG_DIR: logDir,
    SCOREBOARD_USER: userInfo().username,
    SCOREBOARD_ENV_OWNER: String(process.getuid?.() ?? 0),
    SCOREBOARD_GITHUB_API: GITHUB_API,
    SCOREBOARD_PB_DOWNLOAD_BASE: PB_BASE,
    SCOREBOARD_SMOKE_TRIES: "2",
    SCOREBOARD_SMOKE_WAIT: "0",
  };

  const server: Server = {
    root,
    etc,
    opt,
    backups,
    logDir,
    shimDir,
    env,
    routes,
    saveRoutes,
    async serve(url, data) {
      const file = path.join(served, `file-${servedCount++}`);
      await writeFile(file, data);
      routes[url] = { file };
      await saveRoutes();
    },
    run(args, script = DEPLOY) {
      return new Promise((resolve) => {
        execFile(script, args, { env, timeout: 30_000 }, (error, stdout, stderr) => {
          const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
          resolve({ code, stdout, stderr });
        });
      });
    },
    async calls() {
      const text = await readFile(path.join(shimDir, "calls.log"), "utf8");
      return text
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as Call);
    },
    async clearCalls() {
      await writeFile(path.join(shimDir, "calls.log"), "");
    },
    current() {
      try {
        return execFileSync("readlink", [path.join(opt, "current")], { encoding: "utf8" }).trim();
      } catch {
        return undefined;
      }
    },
    async running() {
      return JSON.parse(await readFile(path.join(shimDir, "state.json"), "utf8"));
    },
    async deployLog() {
      try {
        return await readFile(path.join(logDir, "deploy.log"), "utf8");
      } catch {
        return "";
      }
    },
    async makeDatabase(statuses) {
      await mkdir(path.join(opt, "pb_data"), { recursive: true });
      const db = new DatabaseSync(path.join(opt, "pb_data", "data.db"));
      db.exec("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, status TEXT)");
      db.exec("DELETE FROM events");
      const insert = db.prepare("INSERT INTO events (id, status) VALUES (?, ?)");
      statuses.forEach((status, i) => insert.run(`e${i}`, status));
      db.close();
    },
    async breakHealth(sha) {
      await writeFile(path.join(shimDir, `unhealthy-${sha}`), "");
    },
    async breakStart(sha) {
      await writeFile(path.join(shimDir, `start-fails-${sha}`), "");
    },
  };
  // The pinned PocketBase download every bundle points at by default.
  await server.serve(`${PB_BASE}/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip`, pbZip());
  return server;
}

// --- GitHub, as the API answers -----------------------------------------------------------------

const api = (route: string) => `${GITHUB_API}/repos/${REPO}${route}`;

/** Routes for `deploy.sh <tag>`: the tag's commit, its compare with main and the release assets. */
export async function publishRelease(server: Server, tag: string, bundle: Bundle, sha: string, compare = "behind"): Promise<void> {
  server.routes[api(`/commits/${tag}`)] = { json: { sha } };
  server.routes[api(`/compare/main...${sha}`)] = { json: { status: compare } };
  server.routes[api(`/releases/tags/${tag}`)] = {
    json: { tag_name: tag, assets: [{ id: 11, name: "bundle.tar.gz" }, { id: 12, name: "bundle.sha256" }] },
  };
  await server.saveRoutes();
  await server.serve(api("/releases/assets/11"), bundle.tar);
  await server.serve(api("/releases/assets/12"), bundle.sha256File);
}

/** Routes for `deploy.sh --staging`: the newest green ci.yml run on main and its artifact zip. */
export async function publishMainBuild(server: Server, runId: number, bundle: Bundle, sha: string, compare = "behind"): Promise<void> {
  server.routes[api("/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1")] = {
    json: { total_count: 1, workflow_runs: [{ id: runId, head_sha: sha, head_branch: "main", conclusion: "success" }] },
  };
  server.routes[api(`/compare/main...${sha}`)] = { json: { status: compare } };
  server.routes[api(`/actions/runs/${runId}/artifacts?name=bundle-${sha}`)] = {
    json: { total_count: 1, artifacts: [{ id: runId * 10, name: `bundle-${sha}`, expired: false, archive_download_url: api(`/actions/artifacts/${runId * 10}/zip`) }] },
  };
  server.routes[HEALTHCHECKS_URL] = { body: "OK" };
  server.routes[`${HEALTHCHECKS_URL}/fail`] = { body: "OK" };
  await server.saveRoutes();
  await server.serve(
    api(`/actions/artifacts/${runId * 10}/zip`),
    storedZip([
      { name: "bundle.tar.gz", data: bundle.tar },
      { name: "bundle.sha256", data: bundle.sha256File },
    ]),
  );
}

/** The paths inside a pre-deploy backup (.tar.zst), read with the real zstd and tar. */
export function backupNames(file: string): string[] {
  return execFileSync("sh", ["-c", 'zstd -dc "$1" | tar -tf -', "sh", file], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}
