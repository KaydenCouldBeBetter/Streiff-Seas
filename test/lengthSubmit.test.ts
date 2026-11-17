// Length catches end to end (S1 step 6): N submits to EL, the fixture world's live length event,
// through the app's real sender, then edits the length, against a PocketBase booted from
// pb_migrations/ and pb_hooks/. features.json S1: "Length entry in EL: 17 5/8 in is stored as
// length_q 70 and 14 7/8 in as 59 (scoring.md example 6)". Needs exiftool, as the server does.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatchDraft } from "../web/src/lib/catchSender";
import { catchBaseOf, editFields, sendChange } from "../web/src/lib/changeCatch";
import { enteredLengthText, lengthEntryFromQ, parseLength, type LengthEntry } from "../web/src/lib/lengthEntry";
import { catchBody, createCatchSender, type PreparedPhoto } from "../web/src/lib/sendCatch";
import { REPO_ROOT, usePocketBase } from "./harness/pocketbase";
import { actAs, createFixtureUsers, type FixtureUsers } from "./harness/users";
import { entryOf, seedWorld, type World } from "./harness/world";

const pocketbase = usePocketBase();
const HOUR = 3600_000;

let users: FixtureUsers;
let world: World;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
  world = await seedWorld(pocketbase(), users);
});

async function photo(name: "clean-1.jpg" | "clean-2.jpg"): Promise<File> {
  return new File([await readFile(path.join(REPO_ROOT, "test", "fixtures", name))], name, { type: "image/jpeg" });
}

const capturedAt = new Date(Date.now() - HOUR);
const passThrough = async (file: File): Promise<PreparedPhoto> => ({ file, capturedAt });

/** A draft as SUB-01b builds it from what the angler entered on the board. */
async function draft(entry: LengthEntry): Promise<Omit<CatchDraft, "clientUuid"> & { clientUuid: string }> {
  const parsed = parseLength(entry);
  if (!parsed.ok) throw new Error(`not a length: ${JSON.stringify(entry)}`);
  return {
    clientUuid: randomUUID(),
    eventId: world.events.EL.id,
    species: { id: world.species.largemouth.id, name: "Largemouth bass" },
    lengthQ: parsed.q,
    photos: [
      { file: await photo("clean-1.jpg"), previewUrl: "" },
      { file: await photo("clean-2.jpg"), previewUrl: "" },
    ],
    enteredMeasurement: enteredLengthText(entry),
  };
}

async function sendAsN(entry: LengthEntry) {
  const n = await actAs(pocketbase(), users.N);
  const sender = createCatchSender({ pb: n, entryId: entryOf(world, "EL.N").id, metric: "length", units: "lb", prepare: passThrough });
  const result = await sender(await draft(entry), () => {});
  if (result.kind !== "received") throw new Error(`not received: ${result.kind}`);
  return { n, result, record: await pocketbase().superuser.collection("catches").getOne(result.catch.id) };
}

describe("submit a length (SUB-01b)", () => {
  it.each([
    [{ inches: "17", eighths: 5 }, 70, "17 1/2"],
    [{ inches: "14", eighths: 7 }, 59, "14 3/4"],
  ])("scoring.md example 6: %o is stored as length_q %i, no weight", async (entry, q, shown) => {
    const { result, record } = await sendAsN(entry);

    expect(record).toMatchObject({ length_q: q, weight_hoz: 0, status: "pending" });
    expect(result.catch.measurement).toEqual({ value: shown, unit: "in" });
  });

  it("sends length_q and never weight_hoz on a length event", async () => {
    const body = catchBody(await draft({ inches: "17", eighths: 5 }), entryOf(world, "EL.N").id, "length", []);

    expect(body.get("length_q")).toBe("70");
    expect(body.has("weight_hoz")).toBe(false);
  });

  it("sends weight_hoz and never length_q on a weight event", async () => {
    const body = catchBody({ ...(await draft({ inches: "17", eighths: 5 })), weightHoz: 5500 }, entryOf(world, "E1.M").id, "weight", []);

    expect(body.get("weight_hoz")).toBe("5500");
    expect(body.has("length_q")).toBe(false);
  });
});

describe("edit a length (MY-03a)", () => {
  it("an untouched prefill sends nothing; a new length saves with the loaded rev", async () => {
    const { n, record } = await sendAsN({ inches: "17", eighths: 5 });
    const base = catchBaseOf(record);
    const untouched = parseLength(lengthEntryFromQ(base.lengthQ));
    if (!untouched.ok) throw new Error("prefill didn't parse");

    expect(editFields(base, "length", base.speciesId, untouched.q)).toBeNull();

    const changed = parseLength({ inches: "14", eighths: 7 });
    if (!changed.ok) throw new Error("not a length");
    const fields = editFields(base, "length", base.speciesId, changed.q);
    expect(fields).toEqual({ length_q: 59 });
    expect(await sendChange(n, base, { action: "edit", fields: fields! }, Date.now())).toEqual({ kind: "saved" });
    expect(await pocketbase().superuser.collection("catches").getOne(base.id)).toMatchObject({ length_q: 59, weight_hoz: 0, rev: 2 });
  });
});
