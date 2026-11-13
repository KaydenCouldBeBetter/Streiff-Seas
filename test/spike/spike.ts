// Boots a throwaway PocketBase for the photo spike (M0-04): the repo's migrations plus the
// spike migration, and only the spike hooks a test names. Nothing here touches pb_migrations/
// or pb_hooks/, so no rule opens on main.

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { REPO_ROOT, startPocketBase, type Harness } from "../harness/pocketbase";
import { actAs, newUser } from "../harness/users";

const SPIKE_DIR = path.join(REPO_ROOT, "test", "spike");
export const FIXTURES = path.join(REPO_ROOT, "test", "fixtures");
export const EVIDENCE_FILE = path.join(REPO_ROOT, "docs", "evidence", "m0-04-photo.txt");

export interface SpikeConfig {
  /** Files in test/spike/hooks/ to load (the shared photo_lib.js always comes along). */
  hooks: string[];
  /** The photo field's mimeTypes; the design is ["image/jpeg"], [] means anything. */
  mimes?: string[];
  thumbs?: string[];
  /** Text replaced in the hook files: {"__STRIP_CMD__": "[\"exiftool\", ...]"} */
  replace?: Record<string, string>;
}

export interface Spike {
  harness: Harness;
  dataDir: string;
  /** All files under pb_data/storage: relative path to size and sha256, sorted. */
  storage(): Promise<StoredFile[]>;
  stop(): Promise<void>;
}

export interface StoredFile {
  path: string;
  size: number;
  sha256: string;
}

export async function startSpike(config: SpikeConfig): Promise<Spike> {
  const root = await mkdtemp(path.join(tmpdir(), "chromie-spike-"));
  const migrationsDir = path.join(root, "migrations");
  const hooksDir = path.join(root, "hooks");
  const pbRoot = path.join(root, "pb");
  await Promise.all([mkdir(migrationsDir), mkdir(hooksDir), mkdir(pbRoot)]);
  try {
    for (const name of await readdir(path.join(REPO_ROOT, "pb_migrations"))) {
      await copyFile(path.join(REPO_ROOT, "pb_migrations", name), path.join(migrationsDir, name));
    }
    const migration = await readFile(path.join(SPIKE_DIR, "migrations", "1999999999_spike_open_catches.js"), "utf8");
    const cfg = { mimes: config.mimes ?? ["image/jpeg"], thumbs: config.thumbs ?? [] };
    await writeFile(path.join(migrationsDir, "1999999999_spike_open_catches.js"), migration.split("__SPIKE_CONFIG__").join(JSON.stringify(cfg)));
    for (const name of ["photo_lib.js", ...config.hooks]) {
      let text = await readFile(path.join(SPIKE_DIR, "hooks", name), "utf8");
      for (const [from, to] of Object.entries(config.replace ?? {})) text = text.split(from).join(to);
      await writeFile(path.join(hooksDir, name), text);
    }
    const harness = await startPocketBase({ migrationsDir, hooksDir, tmpRoot: pbRoot });
    const [instance] = await readdir(pbRoot);
    const dataDir = path.join(pbRoot, instance as string, "pb_data");
    return {
      harness,
      dataDir,
      storage: () => listStorage(path.join(dataDir, "storage")),
      stop: async () => {
        await harness.stop();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function listStorage(dir: string, base: string = dir): Promise<StoredFile[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: StoredFile[] = [];
  for (const name of names.sort()) {
    const full = path.join(dir, name);
    if ((await stat(full)).isDirectory()) {
      out.push(...(await listStorage(full, base)));
    } else {
      const bytes = await readFile(full);
      out.push({ path: path.relative(base, full), size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  return out;
}

/** What the tests need in the database: an organizer (the judge), two members, a species, a live event and the first member's entry. */
export interface Seed {
  organizer: RecordModel;
  member: RecordModel;
  other: RecordModel;
  speciesId: string;
  eventId: string;
  entryId: string;
}

export async function seed(harness: Harness): Promise<Seed> {
  const make = (name: string, role: string) =>
    harness.superuser.collection("users").create(newUser({ name, role, verified: true, emailVisibility: false, email: `${randomUUID()}@example.test` }));
  const organizer = await make("Organizer", "organizer");
  const member = await make("Member", "member");
  const other = await make("Other", "member");
  const species = await harness.superuser.collection("species").getFirstListItem("");
  const event = await harness.superuser.collection("events").create({
    name: "Spike",
    status: "live",
    metric: "weight",
    best_n: 3,
    judge: organizer.id,
    species: [species.id],
  });
  const entry = await harness.superuser.collection("entries").create({ event: event.id, angler: member.id, display_name: "Member" });
  return { organizer, member, other, speciesId: species.id, eventId: event.id, entryId: entry.id };
}

export async function asUser(harness: Harness, user: RecordModel): Promise<PocketBase> {
  return actAs(harness, user);
}

export async function fixture(name: string): Promise<File> {
  const bytes = await readFile(path.join(FIXTURES, name));
  const type = name.endsWith(".png") ? "image/png" : name.endsWith(".heic") ? "image/heic" : "image/jpeg";
  return new File([bytes], name, { type });
}

/** A catches multipart body; pass the files as the photo field (or none). */
export function catchForm(s: Seed, files: File[], extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("entry", s.entryId);
  form.set("species", s.speciesId);
  form.set("weight_hoz", "64");
  form.set("client_uuid", randomUUID());
  form.set("status", "pending");
  form.set("rev", "1");
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  for (const file of files) form.append("photo", file);
  return form;
}

/** Appends a line block to docs/evidence/m0-04-photo.txt when SPIKE_EVIDENCE=1 is set. Always logs. */
export function evidence(title: string, body: unknown): void {
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  const block = `\n=== ${title}\n${text}\n`;
  if (process.env.SPIKE_EVIDENCE === "1") appendFileSync(EVIDENCE_FILE, block);
  console.log(block);
}

export interface StoredReport {
  path: string;
  size: number;
  kind: "original" | "thumbnail" | "attrs";
  leaks: string[];
  dump: string;
}

/**
 * Asks for a 100x100 thumbnail of every photo on the record (PocketBase makes them on first
 * request), then reports every file now under pb_data/storage: originals, thumbnails, .attrs.
 */
export async function inspectStorage(spike: Spike, client: PocketBase, record: RecordModel, thumbs: boolean = true): Promise<{ files: StoredReport[]; thumbResponses: Record<string, string> }> {
  const { dump, leaksIn, read } = await import("./leaks");
  const thumbResponses: Record<string, string> = {};
  if (thumbs) {
    const token = await client.files.getToken();
    for (const name of record.photo as string[]) {
      const url = client.files.getURL(record, name, { thumb: "100x100", token });
      const res = await fetch(url);
      thumbResponses[name] = `${res.status} ${res.headers.get("content-type")} ${(await res.arrayBuffer()).byteLength} bytes`;
    }
  }
  const files: StoredReport[] = [];
  for (const f of await spike.storage()) {
    const full = path.join(spike.dataDir, "storage", f.path);
    const kind = f.path.endsWith(".attrs") ? "attrs" : f.path.includes("thumbs_") ? "thumbnail" : "original";
    files.push({ path: f.path, size: f.size, kind, leaks: kind === "attrs" ? [] : leaksIn(read(full)), dump: kind === "attrs" ? "" : dump(full) });
  }
  return { files, thumbResponses };
}
