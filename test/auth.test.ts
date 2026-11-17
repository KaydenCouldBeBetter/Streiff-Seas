// Sign-up and OTP sign-in end to end, with PocketBase's mail going to a fake SMTP server:
// the code that arrives by email is the code that signs the member in.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { statusOf } from "./harness/requests";
import { decodedText, startFakeSmtp, type FakeSmtp, type Mail } from "./harness/smtp";
import { actAsAnon, newUser } from "./harness/users";

const pocketbase = usePocketBase();

let smtp: FakeSmtp;

beforeAll(async () => {
  smtp = await startFakeSmtp();
  await pocketbase().superuser.settings.update({
    meta: { senderName: "Chromie Fishing", senderAddress: "codes@example.test" },
    smtp: { enabled: true, host: smtp.host, port: smtp.port, tls: false, authMethod: "PLAIN", username: "", password: "" },
  });
});

afterAll(() => smtp?.stop());

beforeEach(() => {
  smtp.mails.length = 0;
});

/** Waits for the next mail to this address; PocketBase may send after it answers. */
async function mailTo(email: string): Promise<Mail> {
  for (let tries = 0; tries < 50; tries++) {
    const mail = smtp.mails.find((m) => m.to.includes(email));
    if (mail !== undefined) return mail;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no mail to ${email}`);
}

/** The one 8-digit code in a mail. */
function codeIn(mail: Mail): string {
  const codes = [...new Set(decodedText(mail).match(/\b\d{8}\b/g))];
  expect(codes).toHaveLength(1);
  return codes[0] as string;
}

describe("sign-up and sign-in by emailed code", () => {
  it("R-USR-A-03: a new member signs up, gets one 8-digit code by email, and signs in with it", async () => {
    const anon = actAsAnon(pocketbase());
    const body = newUser({ name: "Dana Ruiz" });
    const email = body.email as string;
    await anon.collection("users").create(body);

    const { otpId } = await anon.collection("users").requestOTP(email);
    const mail = await mailTo(email);
    expect(mail.from).toBe("codes@example.test");

    const auth = await anon.collection("users").authWithOTP(otpId, codeIn(mail));

    expect(auth.record).toMatchObject({ email, name: "Dana Ruiz", role: "member", verified: true });
    expect(anon.authStore.isValid).toBe(true);
  });

  it("refuses a wrong code and keeps the caller signed out", async () => {
    const anon = actAsAnon(pocketbase());
    const body = newUser();
    await anon.collection("users").create(body);
    const { otpId } = await anon.collection("users").requestOTP(body.email as string);
    const code = codeIn(await mailTo(body.email as string));
    const wrong = code === "00000000" ? "11111111" : "00000000";

    expect(await statusOf(anon.collection("users").authWithOTP(otpId, wrong))).toBe(400);
    expect(anon.authStore.isValid).toBe(false);
  });

  it("R-USR-A-02: answers an unlisted email like any other, but sends nothing and creates no user", async () => {
    const anon = actAsAnon(pocketbase());
    const email = newUser().email as string;

    const { otpId } = await anon.collection("users").requestOTP(email);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(otpId).toEqual(expect.any(String));
    expect(smtp.mails).toEqual([]);
    const { superuser } = pocketbase();
    expect((await superuser.collection("users").getList(1, 1, { filter: superuser.filter("email = {:email}", { email }) })).totalItems).toBe(0);
  });
});

describe("password sign-in", () => {
  it("R-USR-A-01: a real member's email with the right password is refused, and nobody is signed in", async () => {
    // The auth collection requires a password at create; this one is known, so the refusal
    // below is password sign-in being off, not a wrong password.
    const password = "right-password-1234";
    const body = newUser({ password, passwordConfirm: password, verified: true, emailVisibility: false });
    await pocketbase().superuser.collection("users").create(body);
    const anon = actAsAnon(pocketbase());

    expect(await statusOf(anon.collection("users").authWithPassword(body.email as string, password))).toBe(403);
    expect(anon.authStore.isValid).toBe(false);
  });
});
