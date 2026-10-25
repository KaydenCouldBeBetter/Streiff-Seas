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
