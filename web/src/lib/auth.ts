// Sign-in and sign-up by emailed code (screens.md AUTH-01 to AUTH-03): checks on what the
// person typed, the calls to PocketBase, and the words shown when something goes wrong.
// No DOM here: the tests run this against a real PocketBase.

import { ClientResponseError, type RecordModel } from "pocketbase";
import type PocketBase from "pocketbase";

/** decisions.md 2026-10-07 "Sign-in values". */
export const CODE_LENGTH = 8;
export const CODE_VALID_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;

/** users.name's schema pattern: words with one space between them. */
const NAME_PATTERN = /^[^\s\p{Z}]+( [^\s\p{Z}]+)*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COPY = {
  emailInvalid: "Enter an email address, like name@example.com.",
  nameMissing: "Enter your name as it should appear on the leaderboard.",
  codeIncomplete: `Enter the ${CODE_LENGTH}-digit code from the email.`,
  codeWrong: "That code didn't work. Check it and try again, or send a new code.",
  codeExpired: "That code has expired. Send a new code.",
  tooMany: "Too many tries. Wait a minute, then try again.",
  offline: "Couldn't reach the scoreboard. Check your signal and try again.",
  unexpected: "Something went wrong. Try again.",
} as const;

/** The name as it will be saved: no leading, trailing or repeated spaces. */
export function normalizeName(raw: string): string {
  return raw.replace(/[\s\p{Z}]+/gu, " ").trim();
}

/** What's wrong with a name, or null. Call with the normalized name. */
export function nameError(name: string): string | null {
  return NAME_PATTERN.test(name) ? null : COPY.nameMissing;
}

export function normalizeEmail(raw: string): string {
  return raw.trim();
}

export function emailError(email: string): string | null {
  return EMAIL_PATTERN.test(email) ? null : COPY.emailInvalid;
}

/** Digits only, at most CODE_LENGTH of them, so a pasted "1234 5678" or "Code: 12345678" works. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function codeError(code: string): string | null {
  return code.length === CODE_LENGTH ? null : COPY.codeIncomplete;
}

export function isExpired(requestedAtMs: number, nowMs: number): boolean {
  return nowMs - requestedAtMs >= CODE_VALID_MS;
}

export function canResend(requestedAtMs: number, nowMs: number): boolean {
  return nowMs - requestedAtMs >= RESEND_AFTER_MS;
}

/** A password nobody uses: the auth collection requires one, but password sign-in is off. */
export function throwawayPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True when a create was refused only because the email already has a user. */
export function isEmailTaken(error: unknown): boolean {
  if (!(error instanceof ClientResponseError) || error.status !== 400) return false;
  const data = error.response.data as Record<string, { code?: string } | undefined> | undefined;
  return data?.email?.code === "validation_not_unique";
}

/** The words for a failed request. A refused code reads as expired once its 10 minutes are up. */
export function errorCopy(error: unknown, codeExpired = false): string {
  if (!(error instanceof ClientResponseError)) return COPY.unexpected;
  if (error.isAbort || error.status === 0) return COPY.offline;
  if (error.status === 429) return COPY.tooMany;
  if (error.status === 400) return codeExpired ? COPY.codeExpired : COPY.codeWrong;
  return COPY.unexpected;
}

/**
 * Asks PocketBase to email a sign-in code. It answers the same whether or not the email has
 * a user (an unknown email gets no mail), so the app never learns who is a member.
 */
export async function requestCode(pb: PocketBase, email: string): Promise<string> {
  return (await pb.collection("users").requestOTP(email)).otpId;
}

/**
 * Creates the account, then emails a sign-in code. An email that already has an account
 * gets a sign-in code all the same, and the name typed is dropped (screens.md AUTH-03b).
 */
export async function signUp(pb: PocketBase, name: string, email: string): Promise<string> {
  const password = throwawayPassword();
  try {
    await pb.collection("users").create({ name, email, role: "member", password, passwordConfirm: password });
  } catch (error) {
    if (!isEmailTaken(error)) throw error;
  }
  return requestCode(pb, email);
}

/** Signs in with the emailed code; the session is then in pb.authStore. */
export async function signInWithCode(pb: PocketBase, otpId: string, code: string): Promise<RecordModel> {
  return (await pb.collection("users").authWithOTP(otpId, code)).record;
}

/**
 * Renews a held session each time the app opens (decisions.md 2026-10-07: a 14-day token,
 * refreshed on open). Returns the user, or null when there is no session or it was refused.
 * A network failure keeps the stored session: the phone may simply be out of signal.
 */
export async function resumeSession(pb: PocketBase): Promise<RecordModel | null> {
  if (!pb.authStore.isValid) return null;
  try {
    return (await pb.collection("users").authRefresh()).record;
  } catch (error) {
    if (error instanceof ClientResponseError && (error.status === 0 || error.isAbort)) return pb.authStore.record;
    pb.authStore.clear();
    return null;
  }
}
