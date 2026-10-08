// The security.md "Test fixtures" users, and the ways a test acts as one of them or as nobody.
// No test signs in by email: each user is impersonated through the superuser endpoint.

import { randomBytes } from "node:crypto";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { Harness } from "./pocketbase";

export const FIXTURE_USERS = {
  K: { name: "Kayden", role: "organizer" },
  O: { name: "Olivia", role: "organizer" },
  S: { name: "Sam", role: "member" },
  N: { name: "Angler N", role: "member" },
  M: { name: "Angler M", role: "member" },
  W: { name: "Angler W", role: "member" },
  X: { name: "Angler X", role: "member" },
  Y: { name: "Angler Y", role: "member" },
} as const;

export type FixtureName = keyof typeof FIXTURE_USERS;

export const FIXTURE_NAMES = Object.keys(FIXTURE_USERS) as FixtureName[];

export type FixtureUsers = Record<FixtureName, RecordModel>;

const IMPERSONATE_SECONDS = 3600;

/** Creates K, O, S, N, M, W, X and Y through the superuser. Call once per PocketBase. */
export async function createFixtureUsers(harness: Harness): Promise<FixtureUsers> {
  const users: Partial<FixtureUsers> = {};
  for (const key of FIXTURE_NAMES) {
    // Nobody signs in with this password; the auth collection just requires one.
    const password = randomBytes(24).toString("base64url");
    users[key] = await harness.superuser.collection("users").create({
      email: `${key.toLowerCase()}@example.test`,
      emailVisibility: false,
      verified: true,
      password,
      passwordConfirm: password,
      ...FIXTURE_USERS[key],
    });
  }
  return users as FixtureUsers;
}

/** A client that acts as the given user, through the superuser impersonate endpoint. */
export async function actAs(harness: Harness, user: RecordModel): Promise<PocketBase> {
  const client = await harness.superuser.collection("users").impersonate(user.id, IMPERSONATE_SECONDS);
  // impersonate() returns a new client with the SDK's defaults; match harness.client().
  client.autoCancellation(false);
  return client;
}

/** A client with no auth at all. */
export function actAsAnon(harness: Harness): PocketBase {
  return harness.client();
}
