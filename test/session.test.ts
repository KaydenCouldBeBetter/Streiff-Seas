// web/src/lib/auth.ts checkSession: what a held session is when the app opens (features.json S1
// step 3; screens.md SYS-04a). A token past its expiry or refused by the server has ended; no
// signal, a server error or a rate limit keeps it. The sessions here come from a real emailed-code
// sign-in: the harness's impersonation tokens can't be refreshed.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import PocketBase, { type RecordModel } from "pocketbase";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkSession, requestCode, resumeSession, signInWithCode } from "../web/src/lib/auth";
import { usePocketBase } from "./harness/pocketbase";
import { decodedText, startFakeSmtp, type FakeSmtp } from "./harness/smtp";
import { actAsAnon, createFixtureUsers, type FixtureUsers } from "./harness/users";

const pocketbase = usePocketBase();
let smtp: FakeSmtp;
let users: FixtureUsers;
/** One emailed-code sign-in for the whole file: PocketBase limits code attempts. */
let m: { pb: PocketBase; token: string; record: RecordModel };

beforeAll(async () => {
  smtp = await startFakeSmtp();
  users = await createFixtureUsers(pocketbase());
  await pocketbase().superuser.settings.update({
    meta: { senderName: "Chromie Fishing", senderAddress: "codes@example.test" },
    smtp: { enabled: true, host: smtp.host, port: smtp.port, tls: false, authMethod: "PLAIN", username: "", password: "" },
  });
  m = await signedInAsM();
});

afterAll(() => smtp?.stop());

/** M signed in by emailed code on a fresh client, as on a phone. */
async function signedInAsM(): Promise<{ pb: PocketBase; token: string; record: RecordModel }> {
  const pb = actAsAnon(pocketbase());
  const email = users.M.email as string;
  smtp.mails.length = 0;
  const otpId = await requestCode(pb, email);
  let code: string | undefined;
  for (let tries = 0; tries < 50 && code === undefined; tries++) {
    const mail = smtp.mails.filter((sent) => sent.to.includes(email)).at(-1);
    code = mail && decodedText(mail).match(/\b\d{8}\b/)?.[0];
    if (code === undefined) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (code === undefined) throw new Error("no code mailed to M");
  const record = await signInWithCode(pb, otpId, code);
  return { pb, token: pb.authStore.token, record };
}

/** The token with its payload's `exp` replaced; the signature no longer matches. */
function withExpiry(token: string, expSeconds: number): string {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(String(payload), "base64url").toString()) as Record<string, unknown>;
  return [header, Buffer.from(JSON.stringify({ ...claims, exp: expSeconds })).toString("base64url"), signature].join(".");
}

/** A client on `baseUrl` holding M's session, as a phone that signed in earlier would. */
function holding(baseUrl: string, token: string, record: RecordModel): PocketBase {
  const pb = new PocketBase(baseUrl);
  pb.authStore.save(token, record);
  return pb;
}

/** A server that answers every request with `status`, and counts them. */
async function stubServer(status: number): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let hits = 0;
  const server: Server = createServer((_request, response) => {
    hits++;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ status, message: "stub", data: {} }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hits: () => hits, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

describe("checkSession", () => {
  it("has no session for a phone nobody signed in on", async () => {
    expect(await checkSession(actAsAnon(pocketbase()))).toEqual({ kind: "none" });
  });

  it("renews a good session, and the renewed token is a new one", async () => {
    const { pb, token } = m;
    // A token carries its issue time in whole seconds: one renewed in the same second is identical.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const session = await checkSession(pb);

    expect(session).toMatchObject({ kind: "active", user: { id: users.M.id } });
    expect(pb.authStore.isValid).toBe(true);
    expect(pb.authStore.token).not.toBe(token);
  });

  it("ends a token past its expiry without asking the server, and keeps the email for sign-in", async () => {
    const { token, record } = m;
    const stub = await stubServer(200);
    const pb = holding(stub.url, withExpiry(token, Math.floor(Date.now() / 1000) - 60), record);

    expect(await checkSession(pb)).toEqual({ kind: "ended", email: users.M.email });
    expect(stub.hits()).toBe(0);
    expect(pb.authStore.token).toBe("");
    await stub.close();
  });

  it("ends a token the server refuses (here a forged expiry, so a bad signature), and clears it", async () => {
    const { token, record } = m;
    const pb = holding(pocketbase().url, withExpiry(token, Math.floor(Date.now() / 1000) + 3600), record);

    expect(await checkSession(pb)).toEqual({ kind: "ended", email: users.M.email });
    expect(pb.authStore.token).toBe("");
  });

  it.each([500, 503, 429])("keeps the session when the server answers %i", async (status) => {
    const { token, record } = m;
    const stub = await stubServer(status);
    const pb = holding(stub.url, token, record);

    expect(await checkSession(pb)).toMatchObject({ kind: "active", user: { id: users.M.id } });
    expect(stub.hits()).toBe(1);
    expect(pb.authStore.token).toBe(token);
    await stub.close();
  });

  it("keeps the session when there is no signal", async () => {
    const { token, record } = m;
    const stub = await stubServer(200);
    await stub.close(); // Nothing listens on that port now.
    const pb = holding(stub.url, token, record);

    expect(await checkSession(pb)).toMatchObject({ kind: "active", user: { id: users.M.id } });
    expect(pb.authStore.token).toBe(token);
  });
});

describe("resumeSession", () => {
  it("answers the user for a good session and null once it has ended", async () => {
    const { token, record } = m;
    expect(await resumeSession(holding(pocketbase().url, token, record))).toMatchObject({ id: users.M.id });

    const expired = holding(pocketbase().url, withExpiry(token, Math.floor(Date.now() / 1000) - 60), record);
    expect(await resumeSession(expired)).toBeNull();
  });
});
