// The docs/security.md matrix rows that open a rule, one test per row ID, against a
// PocketBase booted from pb_migrations/. Rules still locked are swept in schema.test.ts.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { refusedFields, statusOf } from "./harness/requests";
import { actAs, actAsAnon, createFixtureUsers, newUser, type FixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();

let users: FixtureUsers;

beforeAll(async () => {
  users = await createFixtureUsers(pocketbase());
});

/** How many users records hold this email, read as the superuser. */
async function usersWithEmail(email: string): Promise<number> {
  const { superuser } = pocketbase();
  return (await superuser.collection("users").getList(1, 1, { filter: superuser.filter("email = {:email}", { email }) })).totalItems;
}

describe("users create", () => {
  it("R-USR-C-01: anon signs up as a member, unverified, with the email hidden", async () => {
    const body = newUser({ name: "Dana Ruiz" });
    const created = await actAsAnon(pocketbase()).collection("users").create(body);
    const stored = await pocketbase().superuser.collection("users").getOne(created.id);

    expect(stored).toMatchObject({ email: body.email, name: "Dana Ruiz", role: "member", verified: false, emailVisibility: false });
  });

  // A rule refusal on create is a 400 with no field named, as PocketBase gives it.
  it.each([
    ["R-USR-C-04", "as an organizer", { role: "organizer" }],
    ["R-USR-C-05", "already verified", { verified: true }],
    ["R-USR-C-06", "with the email visible", { emailVisibility: true }],
    ["R-USR-C-06", "with the email visibility sent as false", { emailVisibility: false }],
    ["R-USR-C-07", "with no role", { role: undefined }],
  ])("%s: anon may not sign up %s", async (_id, _case, overrides: Record<string, unknown>) => {
    const body = newUser(overrides);
    // newUser() fills in a role; a role given as undefined means leave it out.
    if ("role" in overrides && overrides.role === undefined) delete body.role;

    expect(await statusOf(actAsAnon(pocketbase()).collection("users").create(body))).toBe(400);
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });

  it("R-USR-C-08: anon may not sign up with a member's email, and the member is left as they were", async () => {
    const { superuser } = pocketbase();
    const before = await superuser.collection("users").getOne(users.M.id);

    expect(await refusedFields(actAsAnon(pocketbase()).collection("users").create(newUser({ email: before.email, name: "Someone Else" })))).toEqual({
      email: "validation_not_unique",
    });
    expect(await superuser.collection("users").getOne(users.M.id)).toEqual(before);
  });

  it.each([" Dana", "Dana ", "Dana  Ruiz", " "])("R-USR-C-09: anon may not sign up with the name %j", async (name) => {
    const body = newUser({ name });

    expect(await refusedFields(actAsAnon(pocketbase()).collection("users").create(body))).toEqual({ name: expect.stringMatching(/^validation_/) });
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });

  it.each([
    ["R-USR-C-02", "M" as const],
    ["R-USR-C-03", "K" as const],
  ])("%s: %s, signed in, may not create a user", async (_id, who) => {
    const body = newUser({ email: `${randomUUID()}@example.test` });

    expect(await statusOf((await actAs(pocketbase(), users[who])).collection("users").create(body))).toBe(400);
    expect(await usersWithEmail(body.email as string)).toBe(0);
  });
});

/** A member of its own, created through the superuser, so a test may change them freely. */
async function ownMember(name = "Test Member") {
  return pocketbase().superuser.collection("users").create(newUser({ name, emailVisibility: false, verified: true }));
}

describe("users update", () => {
  it("R-USR-U-01: a member changes their own name and display units", async () => {
    const member = await ownMember("Dana Ruiz");
    const client = await actAs(pocketbase(), member);

    await client.collection("users").update(member.id, { name: "Dana R.", display_units: "lb_oz" });

    expect(await pocketbase().superuser.collection("users").getOne(member.id)).toMatchObject({ name: "Dana R.", display_units: "lb_oz" });
  });

  it.each([
    ["R-USR-U-02", "make themself an organizer", { role: "organizer" }],
    ["R-USR-U-03", "change their email", { email: "someone.else@example.test" }],
    ["R-USR-U-03", "send verified as true", { verified: true }],
    ["R-USR-U-03", "send verified as false", { verified: false }],
  ])("%s: a member may not %s", async (_id, _case, body: Record<string, unknown>) => {
    const member = await ownMember();
    const before = await pocketbase().superuser.collection("users").getOne(member.id);

    expect(await statusOf((await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "Changed Name", ...body }))).toBe(404);
    // Refused whole: not even the name moved.
    expect(await pocketbase().superuser.collection("users").getOne(member.id)).toEqual(before);
  });

  it("R-USR-U-04: a member may not update another member's record", async () => {
    const mine = await ownMember();
    const theirs = await ownMember("Other Member");
    const before = await pocketbase().superuser.collection("users").getOne(theirs.id);

    expect(await statusOf((await actAs(pocketbase(), mine)).collection("users").update(theirs.id, { name: "Hacked" }))).toBe(404);
    expect(await pocketbase().superuser.collection("users").getOne(theirs.id)).toEqual(before);
  });

  it("R-USR-U-05: the organizer may not change a member's role", async () => {
    const member = await ownMember();

    expect(await statusOf((await actAs(pocketbase(), users.K)).collection("users").update(member.id, { role: "organizer" }))).toBe(404);
    expect((await pocketbase().superuser.collection("users").getOne(member.id)).role).toBe("member");
  });

  it("R-USR-U-06: a new name reaches the member's entries in live and closed tournaments, not in a final one", async () => {
    const { superuser } = pocketbase();
    const member = await ownMember("Before Name");
    const other = await ownMember("Other Member");
    const entryIn = async (status: string, angler: { id: string }, displayName: string) => {
      const event = await superuser.collection("events").create({ name: `Event ${status}`, status, metric: "weight", best_n: 10, judge: users.K.id });
      return superuser.collection("entries").create({ event: event.id, angler: angler.id, display_name: displayName });
    };
    const live = await entryIn("live", member, "Before Name");
    const closed = await entryIn("closed", member, "Before Name");
    const final = await entryIn("final", member, "Before Name");
    const othersLive = await entryIn("live", other, "Other Member");
    const displayName = async (id: string) => (await superuser.collection("entries").getOne(id)).display_name;

    // A change to display_units alone leaves every entry as it was.
    await (await actAs(pocketbase(), member)).collection("users").update(member.id, { display_units: "lb_oz" });
    expect(await displayName(live.id)).toBe("Before Name");

    await (await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "After Name" });

    expect(await displayName(live.id)).toBe("After Name");
    expect(await displayName(closed.id)).toBe("After Name");
    expect(await displayName(final.id)).toBe("Before Name");
    expect(await displayName(othersLive.id)).toBe("Other Member");
    expect((await superuser.collection("users").getOne(member.id)).name).toBe("After Name");
  });

  it("R-USR-U-06: a name refused by the field leaves the entries alone", async () => {
    const { superuser } = pocketbase();
    const member = await ownMember("Before Name");
    const event = await superuser.collection("events").create({ name: "Event live", status: "live", metric: "weight", best_n: 10, judge: users.K.id });
    const entry = await superuser.collection("entries").create({ event: event.id, angler: member.id, display_name: "Before Name" });

    await statusOf((await actAs(pocketbase(), member)).collection("users").update(member.id, { name: "Bad  Name" }));

    expect((await superuser.collection("entries").getOne(entry.id)).display_name).toBe("Before Name");
  });

  it.each([" Dana", "Dana ", "Dana  Ruiz", " "])("R-USR-U-07: a member may not rename themself %j", async (name) => {
    const member = await ownMember("Dana Ruiz");

    expect(await refusedFields((await actAs(pocketbase(), member)).collection("users").update(member.id, { name }))).toEqual({
      name: expect.stringMatching(/^validation_/),
    });
    expect((await pocketbase().superuser.collection("users").getOne(member.id)).name).toBe("Dana Ruiz");
  });
});
