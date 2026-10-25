// web/src/lib/auth.ts: the checks on what a person types, and the sign-up and sign-in calls
// run against a real PocketBase whose mail goes to a fake SMTP server.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODE_VALID_MS,
  COPY,
  RESEND_AFTER_MS,
  canResend,
  cleanCode,
  codeError,
  emailError,
  errorCopy,
  isExpired,
  nameError,
  normalizeName,
  requestCode,
  resumeSession,
  signInWithCode,
  signUp,
  throwawayPassword,
} from "../web/src/lib/auth";
import { usePocketBase } from "./harness/pocketbase";
import { decodedText, startFakeSmtp, type FakeSmtp } from "./harness/smtp";
import { actAsAnon, createFixtureUsers, type FixtureUsers } from "./harness/users";

describe("what a person types", () => {
  it("tidies a name to single spaces, and refuses one that is only spaces", () => {
    expect(normalizeName("  Dana    Ruiz ")).toBe("Dana Ruiz");
    expect(nameError(normalizeName("Dana Ruiz"))).toBeNull();
    expect(nameError(normalizeName("   "))).toBe(COPY.nameMissing);
  });

  it("takes an email with an @ and a dot after it", () => {
    expect(emailError("dana@example.com")).toBeNull();
    expect(emailError("dana@example")).toBe(COPY.emailInvalid);
    expect(emailError("")).toBe(COPY.emailInvalid);
  });

  it("keeps the digits of a pasted code, eight at most", () => {
    expect(cleanCode("Code: 1234 5678")).toBe("12345678");
    expect(cleanCode("1234567890")).toBe("12345678");
    expect(codeError("1234567")).toBe(COPY.codeIncomplete);
    expect(codeError("12345678")).toBeNull();
  });

  it("offers a new code after 60 seconds and calls a code expired after 10 minutes", () => {
    expect(canResend(0, RESEND_AFTER_MS - 1)).toBe(false);
    expect(canResend(0, RESEND_AFTER_MS)).toBe(true);
    expect(isExpired(0, CODE_VALID_MS - 1)).toBe(false);
    expect(isExpired(0, CODE_VALID_MS)).toBe(true);
  });

  it("makes a different 64-hex-character throwaway password each time", () => {
    expect(throwawayPassword()).toMatch(/^[0-9a-f]{64}$/);
    expect(throwawayPassword()).not.toBe(throwawayPassword());
  });
});

describe("against PocketBase", () => {
  const pocketbase = usePocketBase();
  let smtp: FakeSmtp;
  let users: FixtureUsers;

  beforeAll(async () => {
    smtp = await startFakeSmtp();
    users = await createFixtureUsers(pocketbase());
    await pocketbase().superuser.settings.update({
      meta: { senderName: "Chromie Fishing", senderAddress: "codes@example.test" },
      smtp: { enabled: true, host: smtp.host, port: smtp.port, tls: false, authMethod: "PLAIN", username: "", password: "" },
    });
  });

  afterAll(() => smtp?.stop());

  async function emailedCode(email: string): Promise<string> {
    for (let tries = 0; tries < 50; tries++) {
      const mail = smtp.mails.filter((m) => m.to.includes(email)).at(-1);
      const code = mail && decodedText(mail).match(/\b\d{8}\b/)?.[0];
      if (code) return code;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`no code mailed to ${email}`);
  }

  it("signs up a new member and signs them in with the emailed code", async () => {
    const pb = actAsAnon(pocketbase());
    const email = `dana-${Date.now()}@example.test`;

    const otpId = await signUp(pb, "Dana Ruiz", email);
    const record = await signInWithCode(pb, otpId, await emailedCode(email));

    expect(record).toMatchObject({ email, name: "Dana Ruiz", role: "member", verified: true });
    expect(await resumeSession(pb)).toMatchObject({ id: record.id });
  });

  it("sends a member who signs up again a sign-in code, and leaves their name alone (AUTH-03b)", async () => {
    const pb = actAsAnon(pocketbase());
    const email = users.S.email as string;
    smtp.mails.length = 0;

    const otpId = await signUp(pb, "Not Sam", email);
    const record = await signInWithCode(pb, otpId, await emailedCode(email));

    expect(record).toMatchObject({ id: users.S.id, name: "Sam" });
  });

  it("signs in an existing member by email", async () => {
    const pb = actAsAnon(pocketbase());
    const email = users.M.email as string;
    smtp.mails.length = 0;

    const otpId = await requestCode(pb, email);
    expect(await signInWithCode(pb, otpId, await emailedCode(email))).toMatchObject({ id: users.M.id });
  });

  it("words a wrong code, and the same refusal once the 10 minutes are up", async () => {
    const pb = actAsAnon(pocketbase());
    const otpId = await requestCode(pb, users.N.email as string);
    const refusal = await signInWithCode(pb, otpId, "00000000").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(errorCopy(refusal)).toBe(COPY.codeWrong);
    expect(errorCopy(refusal, true)).toBe(COPY.codeExpired);
  });

  it("has no session to resume for someone who never signed in", async () => {
    expect(await resumeSession(actAsAnon(pocketbase()))).toBeNull();
  });
});
