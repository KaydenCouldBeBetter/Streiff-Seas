// The new-device sign-in alert (decisions.md Open item 16, migration 1794939210): an emailed-code
// sign-in from a second device sends it, with the club's wording, through the fake SMTP server.
// Found on v0.40.4: the first sign-in ever and a device already seen send nothing.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usePocketBase } from "./harness/pocketbase";
import { decodedText, startFakeSmtp, type FakeSmtp, type Mail } from "./harness/smtp";
import { newUser } from "./harness/users";

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

async function nextMail(subject: RegExp): Promise<Mail | undefined> {
  for (let tries = 0; tries < 30; tries++) {
    const mail = smtp.mails.find((m) => subject.test(m.raw));
    if (mail !== undefined) return mail;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

/** Signs in by emailed code with this user agent, as a phone would; returns the HTTP status. */
async function signIn(email: string, device: string): Promise<number> {
  const { url } = pocketbase();
  const headers = { "content-type": "application/json", "user-agent": device };
  smtp.mails.length = 0;
  const requested = await fetch(`${url}/api/collections/users/request-otp`, { method: "POST", headers, body: JSON.stringify({ email }) });
  const { otpId } = (await requested.json()) as { otpId: string };
  const codeMail = await nextMail(/Subject:.*(OTP|code)/i);
  const code = codeMail === undefined ? undefined : /\b\d{8}\b/.exec(decodedText(codeMail))?.[0];
  smtp.mails.length = 0;
  const auth = await fetch(`${url}/api/collections/users/auth-with-otp`, { method: "POST", headers, body: JSON.stringify({ otpId, password: code }) });
  return auth.status;
}

describe("new-device sign-in alert", () => {
  it("is stored with the club's wording", async () => {
    const users = await pocketbase().superuser.collections.getOne("users");

    expect(users.authAlert.enabled).toBe(true);
    expect(users.authAlert.emailTemplate.subject).toBe("New sign-in to Chromie Fishing");
    expect(users.authAlert.emailTemplate.body).toContain("Secure your email account, then talk to a club organizer or admin.");
    expect(users.authAlert.emailTemplate.body).not.toMatch(/password/i);
  });

  it("reaches the member when they sign in from a new device, and never mentions a password", async () => {
    const email = "alert-member@example.test";
    await pocketbase().superuser.collection("users").create(newUser({ email, verified: true }));

    expect(await signIn(email, "Phone-A/1.0")).toBe(200);
    expect(await nextMail(/Subject: New sign-in/)).toBeUndefined();

    expect(await signIn(email, "Phone-B/2.0")).toBe(200);
    const alert = await nextMail(/Subject: New sign-in/);

    expect(alert?.to).toEqual([email]);
    const text = decodedText(alert!);
    expect(text).toContain("We noticed a sign-in to your Chromie Fishing account from a new device or location");
    expect(text).toContain("Phone-B/2.0");
    expect(text).toContain("If this was you, you don't need to do anything.");
    expect(text).toContain("someone may have access to your email, because sign-in codes go there");
    expect(text).toContain("talk to a club organizer or admin");
    expect(text).not.toMatch(/password/i);
    expect(text).not.toContain("Acme");
    // Every placeholder was filled in (PocketBase's HTML wrapper has CSS braces of its own).
    expect(text).not.toMatch(/\{[A-Z_]+\}/);
  });
});
