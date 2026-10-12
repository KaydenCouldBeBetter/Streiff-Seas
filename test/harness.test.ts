import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type RequestListener } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedBinary,
  freePort,
  harnessLifecycle,
  isHealthy,
  pinnedVersion,
  startPocketBase,
  superuserPassword,
  superuserUpsertArgs,
  usePocketBase,
  type Harness,
} from "./harness/pocketbase";
import { actAs, createFixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();

let scratch: string;
const servers: Server[] = [];

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "chromie-harness-"));
});

afterAll(async () => {
  for (const server of servers) server.close();
  await rm(scratch, { recursive: true, force: true });
});

/** Listens on a loopback port of its own and gives its base URL; closed after the file. */
function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

function httpServer(handler: RequestListener): Promise<string> {
  return listen(createHttpServer(handler));
}

async function executable(name: string, content: string): Promise<string> {
  const file = path.join(scratch, name);
  await writeFile(file, content);
  await chmod(file, 0o755);
  return file;
}

describe("the pinned binary", () => {
  it("is what ./pocketbase is: the version in POCKETBASE_VERSION", async () => {
    await expect(assertPinnedBinary()).resolves.toBeUndefined();
  });

  it("is not a binary that reports another version", async () => {
    const stale = await executable("stale-pocketbase", '#!/bin/sh\necho "pocketbase version 0.0.1"\n');

    const refusal = assertPinnedBinary(stale);

    await expect(refusal).rejects.toThrow(`reports "pocketbase version 0.0.1" but POCKETBASE_VERSION pins ${await pinnedVersion()}`);
    await expect(refusal).rejects.toThrow("Run scripts/fetch-pb.sh");
  });

  it("is not a file that won't run, such as half a download", async () => {
    const truncated = await executable("truncated-pocketbase", "\x7fELF");

    await expect(assertPinnedBinary(truncated)).rejects.toThrow("Run scripts/fetch-pb.sh");
  });

  it("is not a missing file", async () => {
    await expect(assertPinnedBinary(path.join(scratch, "no-such-binary"))).rejects.toThrow("Run scripts/fetch-pb.sh");
  });
});

describe("the superuser password", () => {
  it("is 48 lowercase hex characters, so the CLI can never read it as a flag", () => {
    const passwords = Array.from({ length: 1_000 }, () => superuserPassword());

    for (const password of passwords) expect(password).toMatch(/^[0-9a-f]{48}$/);
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});

describe("the superuser upsert command line", () => {
  it('has every flag before "--", and the email and password after it', () => {
    const flags = ["--dir", "/tmp/pb_data", "--migrationsDir", "/tmp/pb_migrations", "--automigrate=false"];
    // A password PocketBase would read as flags if it could: -h makes it skip --dir.
    const password = "-hQ9x";

    const args = superuserUpsertArgs("harness@example.test", password, flags);

    const separator = args.indexOf("--");
    expect(args.slice(0, 2)).toEqual(["superuser", "upsert"]);
    expect(args.slice(2, separator)).toEqual(flags);
    expect(args.slice(separator + 1)).toEqual(["harness@example.test", password]);
  });
});

describe("the health check", () => {
  it("passes for a running PocketBase", async () => {
    expect(await isHealthy(pocketbase().url)).toBe(true);
  });

  it("fails for a 200 that isn't the health body, like the index fallback", async () => {
    const url = await httpServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>some app</title>");
    });

    expect(await isHealthy(url)).toBe(false);
  });

  it("gives up on a connection that never answers", async () => {
    // Accepts the connection and then says nothing.
    const url = await listen(createTcpServer());
    const started = Date.now();

    expect(await isHealthy(url, 200)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("booting", () => {
  it("moves to another port when the first one was taken by something that looks healthy", async () => {
    const squatter = await httpServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"code":200,"message":"API is healthy."}');
    });
    const ports = [Number(new URL(squatter).port)];

    const harness = await startPocketBase({ pickPort: async () => ports.shift() ?? (await freePort()) });

    try {
      expect(harness.url).not.toBe(squatter);
      expect(ports).toEqual([]);
      // Only this boot's own instance knows this boot's superuser.
      expect(harness.superuser.authStore.isValid).toBe(true);
      expect(await harness.superuser.collection("users").getFullList()).toEqual([]);
    } finally {
      await harness.stop();
    }
  });

  it("removes its directory and keeps the command line out of the error when the superuser step fails", async () => {
    const migrationsDir = path.join(scratch, "broken-migrations");
    const tmpRoot = path.join(scratch, "boots");
    await mkdir(migrationsDir);
    await mkdir(tmpRoot);
    // Fails as the file is loaded, which every command does, `superuser upsert` included.
    await writeFile(path.join(migrationsDir, "1700000000_broken.js"), 'throw new Error("harness-broken-migration");\n');

    const failure: unknown = await startPocketBase({ migrationsDir, tmpRoot }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const { message } = failure as Error;
    expect(message).toContain("pocketbase superuser upsert failed");
    expect(message).toContain("harness-broken-migration");
    // The command line carries the superuser's password.
    expect(message).not.toContain("Command failed");
    expect(message).not.toContain("--dir");
    expect(failure).not.toHaveProperty("cmd");
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});

describe("start and stop around a test file", () => {
  function fakeHarness(): Harness & { stops: number } {
    const fake = {
      stops: 0,
      stop: async () => {
        fake.stops += 1;
      },
    };
    return fake as Harness & { stops: number };
  }

  it("stops an instance whose start was still running when stop was called (a timed-out beforeAll)", async () => {
    const fake = fakeHarness();
    let finishBoot = (): void => {};
    const lifecycle = harnessLifecycle(() => new Promise<Harness>((resolve) => (finishBoot = () => resolve(fake))));

    const starting = lifecycle.start();
    const stopping = lifecycle.stop();
    finishBoot();
    await Promise.all([starting, stopping]);

    expect(fake.stops).toBe(1);
    expect(() => lifecycle.get()).toThrow("PocketBase is not running");
  });

  it("stops a started instance once, and has nothing to stop after a failed start", async () => {
    const fake = fakeHarness();
    const lifecycle = harnessLifecycle(async () => fake);
    await lifecycle.start();
    expect(lifecycle.get()).toBe(fake);

    await lifecycle.stop();
    await lifecycle.stop();

    expect(fake.stops).toBe(1);

    const failing = harnessLifecycle(() => Promise.reject(new Error("no boot")));
    await expect(failing.start()).rejects.toThrow("no boot");
    await expect(failing.stop()).resolves.toBeUndefined();
  });
});

describe("impersonated clients", () => {
  it("don't cancel their own parallel requests to one path", async () => {
    const users = await createFixtureUsers(pocketbase());
    const client = await actAs(pocketbase(), users.S);

    // With the SDK's auto-cancellation on, the first of these is aborted client-side (status 0).
    const tokens = await Promise.all([client.files.getToken(), client.files.getToken()]);

    expect(tokens).toEqual([expect.any(String), expect.any(String)]);
  });
});
