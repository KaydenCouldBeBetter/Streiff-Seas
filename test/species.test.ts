// S4 step 2: the organizer adds a species for future tournaments (docs/security.md "species";
// R-SPC-C-01, C-02, C-04, U-01, U-02, D-01). R-SPC-C-03 (duplicates, the index) is in
// test/schema.test.ts; the reads (R-SPC-L-01 to L-03) are in test/rules.test.ts.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { refusedFields, statusOf } from "./harness/requests";
import { actAs, createFixtureUsers, type FixtureName, type FixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();

let users: FixtureUsers;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
});

const as = (who: FixtureName) => actAs(pocketbase(), users[who]);

/** A species name no other test uses: letters only, as the name pattern allows. */
const fresh = (word: string) => `${word} ${randomUUID().replace(/[^a-f]/g, "").slice(0, 6) || "x"}`;

async function speciesNamed(name: string) {
  const { superuser } = pocketbase();
  return superuser.collection("species").getFullList({ filter: superuser.filter("name = {:name}", { name }) });
}

describe("species", () => {
  it("stores create as the organizer only, and update and delete locked", async () => {
    const stored = await pocketbase().superuser.collections.getOne("species");
    expect(stored.createRule).toBe('@request.auth.role = "organizer"');
    expect(stored.updateRule).toBeNull();
    expect(stored.deleteRule).toBeNull();
  });

  it("R-SPC-C-01: K adds walleye", async () => {
    const created = await (await as("K")).collection("species").create({ name: "walleye" });
    expect(created.name).toBe("walleye");
    // Every member can then read it (R-SPC-L-02).
    expect((await (await as("M")).collection("species").getOne(created.id)).name).toBe("walleye");
  });

  it("R-SPC-C-01: O, an organizer who judges nothing, may add one too", async () => {
    const name = fresh("pike");
    expect(await statusOf((await as("O")).collection("species").create({ name }))).toBe("allowed");
  });

  it.each([["M"], ["S"]] as const)("R-SPC-C-02: %s can't add a species", async (who) => {
    const name = fresh("perch");
    expect(await statusOf((await as(who)).collection("species").create({ name }))).toBe(400);
    expect(await speciesNamed(name)).toEqual([]);
  });

  it.each([[""], ["   "], [" lake trout"], ["lake trout "], ["lake  trout"]])("R-SPC-C-04: K can't add the name %j", async (name) => {
    expect(await refusedFields((await as("K")).collection("species").create({ name }))).toHaveProperty("name");
  });

  it("R-SPC-C-03 (index): a duplicate that differs only in case fails, through the API too", async () => {
    expect(await refusedFields((await as("K")).collection("species").create({ name: "Largemouth Bass" }))).toEqual({ name: "validation_not_unique" });
  });

  it.each([["K"], ["M"]] as const)("R-SPC-U-01, U-02: %s can't rename a species", async (who) => {
    const { superuser } = pocketbase();
    const bass = await superuser.collection("species").getFirstListItem('name = "smallmouth bass"');
    expect(await statusOf((await as(who)).collection("species").update(bass.id, { name: "smallmouth" }))).toBe(403);
    expect((await superuser.collection("species").getOne(bass.id)).name).toBe("smallmouth bass");
  });

  it("R-SPC-D-01: K can't delete a species", async () => {
    const { superuser } = pocketbase();
    const bass = await superuser.collection("species").getFirstListItem('name = "largemouth bass"');
    expect(await statusOf((await as("K")).collection("species").delete(bass.id))).toBe(403);
    expect((await superuser.collection("species").getOne(bass.id)).id).toBe(bass.id);
  });
});
