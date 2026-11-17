// scripts/make-bundle.sh (the interim local bundle) in a throwaway git repo with a bare "origin"
// on disk and an `npm` shim standing in for `npm run check`, then the bundle it makes is fed to
// deploy.sh --bundle on the pretend server. No network: origin is a local path.

import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeServer, pinFile, sha256, type Server } from "./harness/deployKit";
import { REPO_ROOT } from "./harness/pocketbase";

const NODE_MAJOR = process.versions.node.split(".")[0]!;

interface Repo {
  dir: string;
  bin: string;
  env: NodeJS.ProcessEnv;
  git(...args: string[]): string;
  run(): { code: number; stdout: string; stderr: string };
}

const cleanup: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
  for (const s of servers.splice(0)) await rm(s.root, { recursive: true, force: true });
});

async function makeRepo(nvmrc: string = NODE_MAJOR): Promise<Repo> {
  const top = await mkdtemp(path.join(tmpdir(), "chromie-bundle-"));
  cleanup.push(top);
  const dir = path.join(top, "repo");
  const bin = path.join(top, "bin");
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await mkdir(path.join(dir, "pb_hooks"));
  await mkdir(path.join(dir, "pb_migrations"));
  await mkdir(bin);
  await copyFile(path.join(REPO_ROOT, "scripts", "make-bundle.sh"), path.join(dir, "scripts", "make-bundle.sh"));
  await chmod(path.join(dir, "scripts", "make-bundle.sh"), 0o755);
  await writeFile(path.join(dir, ".nvmrc"), `${nvmrc}\n`);
  await writeFile(path.join(dir, ".gitignore"), "pb_public/\n/bundles/\n*.local\n");
  await writeFile(path.join(dir, "pb_hooks", "main.pb.js"), "// hooks\n");
  await writeFile(path.join(dir, "pb_migrations", "1700000000_first.js"), "// migration\n");
  await writeFile(path.join(dir, "POCKETBASE_VERSION"), pinFile());

  // `npm run check` builds pb_public with build.json from GITHUB_SHA, as web/build-info.ts does.
  await writeFile(
    path.join(bin, "npm"),
    [
      "#!/bin/sh",
      'echo "$* GITHUB_SHA=${GITHUB_SHA:-}" >> "$NPM_LOG"',
      'mkdir -p pb_public',
      'echo "<!doctype html>" > pb_public/index.html',
      'printf \'{"sha":"%s","built_at":"2026-11-17T00:00:00.000Z"}\' "${GITHUB_SHA:-dev}" > pb_public/build.json',
      "",
    ].join("\n"),
  );
  await chmod(path.join(bin, "npm"), 0o755);

  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: top,
    NPM_LOG: path.join(top, "npm.log"),
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.test",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.test",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", path.join(top, "origin.git")], { env });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  git("remote", "add", "origin", path.join(top, "origin.git"));
  git("push", "-q", "origin", "main");

  return {
    dir,
    bin,
    env,
    git,
    run() {
      try {
        const stdout = execFileSync(path.join(dir, "scripts", "make-bundle.sh"), { cwd: dir, env, encoding: "utf8", stdio: "pipe" });
        return { code: 0, stdout, stderr: "" };
      } catch (error) {
        const e = error as { status: number; stdout: string; stderr: string };
        return { code: e.status, stdout: e.stdout, stderr: e.stderr };
      }
    },
  };
}

describe("scripts/make-bundle.sh", () => {
  it("packages the commit on origin/main with the real sha, and deploy.sh --bundle accepts it", async () => {
    const repo = await makeRepo();
    const sha = repo.git("rev-parse", "HEAD");

    const result = repo.run();

    expect(result.code, result.stderr).toBe(0);
    const out = path.join(repo.dir, "bundles", sha);
    const tar = await readFile(path.join(out, "bundle.tar.gz"));
    expect(await readFile(path.join(out, "bundle.sha256"), "utf8")).toBe(`${sha256(tar)}  bundle.tar.gz\n`);
    expect(result.stdout).toContain(`sha256 ${sha256(tar)}`);
    expect(await readFile(repo.env.NPM_LOG!, "utf8")).toBe(`run check GITHUB_SHA=${sha}\n`);
    const names = execFileSync("tar", ["-tzf", path.join(out, "bundle.tar.gz")], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(new Set(names.map((n) => n.split("/")[0]))).toEqual(
      new Set(["pb_public", "pb_hooks", "pb_migrations", "POCKETBASE_VERSION", "BUILD_INFO"]),
    );
    expect(names.some((n) => n.split("/").some((part) => part.startsWith("._")))).toBe(false);

    const s = await makeServer("prod");
    servers.push(s);
    const deployed = await s.run(["--bundle", out]);
    expect(deployed.code, deployed.stderr).toBe(0);
    expect(deployed.stdout).toContain(`bundle sha256 ${sha256(tar)} ok`);
    expect(s.current()).toBe(`releases/${sha}`);
  });

  it("refuses a dirty tree", async () => {
    const repo = await makeRepo();
    await writeFile(path.join(repo.dir, "pb_hooks", "new.pb.js"), "// not committed\n");

    const result = repo.run();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("uncommitted or untracked changes");
    expect(await readFile(repo.env.NPM_LOG!, "utf8").catch(() => "")).toBe("");
  });

  it("refuses an ignored file that would be packaged", async () => {
    const repo = await makeRepo();
    await writeFile(path.join(repo.dir, "pb_hooks", "secret.local"), "x");

    const result = repo.run();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ignored files under pb_hooks/");
  });

  it("refuses a commit that isn't on origin/main", async () => {
    const repo = await makeRepo();
    await writeFile(path.join(repo.dir, "pb_hooks", "main.pb.js"), "// changed, not pushed\n");
    repo.git("commit", "-q", "-am", "local only");

    const result = repo.run();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not on origin/main");
    expect(await readFile(repo.env.NPM_LOG!, "utf8").catch(() => "")).toBe("");
  });

  it("refuses a Node major other than .nvmrc's", async () => {
    const repo = await makeRepo("99");

    const result = repo.run();

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(".nvmrc says 99");
  });
});
