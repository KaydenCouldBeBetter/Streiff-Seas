// How a request ended, for tests that expect PocketBase to refuse it.

import { ClientResponseError } from "pocketbase";
import { expect } from "vitest";

/** The HTTP status a request was refused with, or "allowed". */
export async function statusOf(request: Promise<unknown>): Promise<number | "allowed"> {
  const outcome: unknown = await request.then(
    () => "allowed",
    (error: unknown) => error,
  );
  if (outcome === "allowed") return outcome;
  if (!(outcome instanceof ClientResponseError)) throw outcome;
  return outcome.status;
}

/** The validation code PocketBase gave each refused field, e.g. { name: "validation_not_unique" }. */
export async function refusedFields(request: Promise<unknown>): Promise<Record<string, string>> {
  const outcome: unknown = await request.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof ClientResponseError)) throw new Error("the request was not refused");
  expect(outcome.status).toBe(400);
  const data = outcome.response.data as Record<string, { code: string }>;
  return Object.fromEntries(Object.entries(data).map(([field, problem]) => [field, problem.code]));
}
