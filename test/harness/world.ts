// The docs/security.md "Test fixtures" world: events E1, E2, EL, ED, EC and EF, their entries and
// catches, seeded through the harness superuser (which bypasses every rule and, with no
// catches hooks yet, writes status, judged_by and reason directly). Every catch carries the two
// clean JPEG fixtures, so the seed still passes once S1 ships the photo hook (M0-04).

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RecordModel } from "pocketbase";
import { REPO_ROOT, type Harness } from "./pocketbase";
import type { FixtureName, FixtureUsers } from "./users";

export type EventKey = "E1" | "E2" | "EL" | "ED" | "EC" | "EF";
export type CatchStatus = "pending" | "verified" | "rejected" | "retracted";

/** A catch's name in the world: event, angler, status, e.g. "E1.Y.rejected". */
export type CatchKey = `${EventKey}.${FixtureName}.${CatchStatus}`;

export interface World {
  users: FixtureUsers;
  species: { largemouth: RecordModel; smallmouth: RecordModel; walleye: RecordModel };
  events: Record<EventKey, RecordModel>;
  /** Keyed "<event>.<angler>", e.g. "E1.W". */
  entries: Record<string, RecordModel>;
  catches: Partial<Record<CatchKey, RecordModel>>;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Who judges whose catch: K judges everyone else; S (E1) or N (elsewhere) judges K's. */
const BACKUP: Record<EventKey, FixtureName> = { E1: "S", E2: "N", EL: "N", ED: "N", EC: "N", EF: "N" };

/** Every event's anglers, beyond the judge and backup judge entered with it. */
const ANGLERS: Record<EventKey, FixtureName[]> = {
  E1: ["K", "S", "M", "W", "Y"],
  E2: ["K", "N"],
  EL: ["K", "N"],
  ED: ["K", "N"],
  EC: ["K", "N"],
  EF: ["K", "N"],
};

/** The catches, by key. ED has none: a draft can never hold one (create needs a live event). */
export const CATCH_KEYS: CatchKey[] = [
  "E1.M.pending", "E1.M.verified", "E1.M.rejected",
  "E1.Y.pending", "E1.Y.verified", "E1.Y.rejected", "E1.Y.retracted",
  "E1.K.pending", "E1.K.verified", "E1.K.rejected",
  // S's verified catch stands for the one K rejected and then re-approved (R-AUD-L-07).
  "E1.S.verified", "E1.S.rejected",
  // On W's withdrawn entry.
  "E1.W.pending", "E1.W.verified",
  "E2.K.pending", "E2.K.verified", "E2.K.rejected",
  "E2.N.pending", "E2.N.verified", "E2.N.rejected",
  "EL.K.pending", "EL.N.verified", "EL.N.rejected",
  "EC.K.verified", "EC.N.pending", "EC.N.rejected",
  "EF.K.verified", "EF.N.verified", "EF.N.rejected",
];

export function parseCatchKey(key: CatchKey): { event: EventKey; angler: FixtureName; status: CatchStatus } {
  const [event, angler, status] = key.split(".") as [EventKey, FixtureName, CatchStatus];
  return { event, angler, status };
}

/** A seeded entry by "<event>.<angler>"; throws for one the world doesn't have. */
export function entryOf(world: World, key: `${EventKey}.${FixtureName}`): RecordModel {
  const entry = world.entries[key];
  if (entry === undefined) throw new Error(`the world has no entry ${key}`);
  return entry;
}

/** A seeded catch by key; throws for one the world doesn't have. */
export function catchOf(world: World, key: CatchKey): RecordModel {
  const record = world.catches[key];
  if (record === undefined) throw new Error(`the world has no catch ${key}`);
  return record;
}

/** A clean JPEG from test/fixtures, as the multipart body wants it. */
export async function photo(name: "clean-1.jpg" | "clean-2.jpg"): Promise<File> {
  return new File([await readFile(path.join(REPO_ROOT, "test", "fixtures", name))], name, { type: "image/jpeg" });
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Seeds the world. Call once per PocketBase, after createFixtureUsers. */
export async function seedWorld(harness: Harness, users: FixtureUsers): Promise<World> {
  const { superuser } = harness;
  const now = Date.now();

  const largemouth = await superuser.collection("species").getFirstListItem('name = "largemouth bass"');
  const smallmouth = await superuser.collection("species").getFirstListItem('name = "smallmouth bass"');
  const walleye = await superuser.collection("species").create({ name: "walleye" });

  const window = (key: EventKey): { starts: number; ends: number } => {
    switch (key) {
      case "E1":
      case "E2":
      case "EL":
        return { starts: now - 7 * DAY, ends: now + 30 * DAY };
      case "ED":
        return { starts: now + 10 * DAY, ends: now + 40 * DAY };
      case "EC":
        return { starts: now - 60 * DAY, ends: now - 20 * DAY };
      case "EF":
        return { starts: now - 120 * DAY, ends: now - 80 * DAY };
    }
  };
  const STATUS: Record<EventKey, string> = { E1: "live", E2: "live", EL: "live", ED: "draft", EC: "closed", EF: "final" };
  const NAMES: Record<EventKey, string> = {
    E1: "E1 Spring Bass",
    E2: "E2 Second Live",
    EL: "EL Length Live",
    ED: "ED Draft",
    EC: "EC Closed",
    EF: "EF Final",
  };

  const events = {} as Record<EventKey, RecordModel>;
  for (const key of Object.keys(STATUS) as EventKey[]) {
    const { starts, ends } = window(key);
    events[key] = await superuser.collection("events").create({
      name: NAMES[key],
      status: STATUS[key],
      starts_at: iso(starts),
      ends_at: iso(ends),
      deadline_ext_min: 0,
      submit_deadline: iso(ends + DAY),
      metric: key === "EL" ? "length" : "weight",
      best_n: 10,
      judge: users.K.id,
      backup_judge: users[BACKUP[key]].id,
      species: [largemouth.id, smallmouth.id],
      code_word_on: key === "E1",
      code_word: key === "E1" ? "OAK" : "",
    });
  }

  const entries: Record<string, RecordModel> = {};
  for (const key of Object.keys(ANGLERS) as EventKey[]) {
    for (const who of ANGLERS[key]) {
      const withdrawn = key === "E1" && who === "W";
      entries[`${key}.${who}`] = await superuser.collection("entries").create({
        event: events[key].id,
        angler: users[who].id,
        display_name: users[who].name,
        withdrawn,
        withdraw_reason: withdrawn ? "Not fishing this one" : "",
        withdrawn_by: withdrawn ? users.K.id : "",
      });
    }
  }

  const photos = [await photo("clean-1.jpg"), await photo("clean-2.jpg")];
  const catches: Partial<Record<CatchKey, RecordModel>> = {};
  for (const [index, key] of CATCH_KEYS.entries()) {
    const { event, angler, status } = parseCatchKey(key);
    const capturedAt = iso(now - (CATCH_KEYS.length - index) * HOUR);
    const decided = status === "verified" || status === "rejected";
    const judge = angler === "K" ? BACKUP[event] : "K";
    const entry = entries[`${event}.${angler}`];
    if (entry === undefined) throw new Error(`catch ${key} has no entry ${event}.${angler}`);
    catches[key] = await superuser.collection("catches").create({
      entry: entry.id,
      species: index % 2 === 0 ? largemouth.id : smallmouth.id,
      ...(event === "EL" ? { length_q: 60 + index } : { weight_hoz: 4000 + index * 100 }),
      photo: photos,
      captured_at: capturedAt,
      photo_captured_at: [capturedAt, capturedAt],
      client_uuid: randomUUID(),
      rev: 1,
      status,
      judged_by: decided ? users[judge].id : "",
      reason: status === "rejected" ? "Readout not legible" : "",
      flags: [],
    });
  }

  return { users, species: { largemouth, smallmouth, walleye }, events, entries, catches };
}
