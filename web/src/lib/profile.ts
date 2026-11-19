// PRF-01 Profile: what the member can change (their name and display units), the checks on it,
// the words for each outcome, and the save itself. No DOM. The save runs against PocketBase's
// users update rule (R-USR-U-01, U-06, U-07); the name sync to entries is a server hook.
//
// "No reply on any change" (decisions.md 2026-10-05): a save that gets no reply shows NOT SENT
// with Retry, and Retry reloads the record first, so a save that landed but whose reply was
// lost reads as saved and is not sent twice.

import { ClientResponseError, type RecordModel } from "pocketbase";
import type PocketBase from "pocketbase";
import { COPY, nameError, normalizeName } from "./auth";

/** users.display_units; empty reads as lb (decisions.md 2026-10-12). */
export type DisplayUnits = "lb" | "lb_oz";

export const UNIT_OPTIONS: readonly { id: DisplayUnits; label: string }[] = [
  { id: "lb", label: "Decimal lb" },
  { id: "lb_oz", label: "lb + oz" },
];

/** What the two fields on Profile hold. */
export interface ProfileDraft {
  name: string;
  units: DisplayUnits;
}

/** The fields of a users record Profile reads (a RecordModel has them, and so does a plain object). */
export type ProfileFields = Record<string, unknown>;

export function unitsOf(user: ProfileFields): DisplayUnits {
  return user.display_units === "lb_oz" ? "lb_oz" : "lb";
}

/** The draft a signed-in user's record starts from. */
export function savedProfile(user: ProfileFields): ProfileDraft {
  return { name: String(user.name ?? ""), units: unitsOf(user) };
}

/** The fields to send: only what differs from the saved record, the name as it will be stored. */
export interface ProfileChanges {
  name?: string;
  display_units?: DisplayUnits;
}

export function profileChanges(saved: ProfileDraft, draft: ProfileDraft): ProfileChanges {
  const changes: ProfileChanges = {};
  const name = normalizeName(draft.name);
  if (name !== saved.name) changes.name = name;
  if (draft.units !== saved.units) changes.display_units = draft.units;
  return changes;
}

export function hasChanges(changes: ProfileChanges): boolean {
  return changes.name !== undefined || changes.display_units !== undefined;
}

/** What's wrong with the name as typed, or null. Blank and spaces-only both read as missing. */
export function draftNameError(rawName: string): string | null {
  return nameError(normalizeName(rawName));
}

/** "KR" for "Kayden R.": the first letters of the first and last words; one word gives its first two letters. */
export function initials(name: string): string {
  const words = normalizeName(name)
    .split(" ")
    .filter((word) => word !== "");
  const letters = (word: string) => Array.from(word);
  if (words.length === 0) return "";
  if (words.length === 1) return letters(words[0]!).slice(0, 2).join("").toUpperCase();
  return (letters(words[0]!)[0]! + letters(words[words.length - 1]!)[0]!).toUpperCase();
}

/** The Role row on Account (users.role). */
export function roleLabel(role: unknown): string {
  return role === "organizer" ? "Organizer" : "Member";
}

export const PROFILE_COPY = {
  // PRF-01b (Figma 104:8344): the one surprising case is that final results don't change.
  nameSavedTitle: "Name saved",
  nameSavedMessage: "Your board name updates in live and closed tournaments. Final results keep the name they were published with.",
  // Units alone have no Figma frame (proposed, decisions.md row for PRF-01c).
  unitsSavedTitle: "Saved",
  unitsSaved: { lb: "Weights now show as decimal pounds.", lb_oz: "Weights now show as pounds and ounces." },
  notSentTitle: "NOT SENT",
  notSentMessage: "Your changes didn't reach the club. Nothing here is lost. Tap Retry when you have signal.",
  nothingToSave: "Change your name to save. How weights show saves as soon as you choose.",
  nameHelp: "Shown on leaderboards and catch history.",
  unitsHelp: "Saves as soon as you choose, and every screen follows. Only changes how weights look to you; lengths always show in inches.",
  nameRefused: COPY.nameMissing,
} as const;

/**
 * The form after a save: only what was sent takes the saved value, so a name still being typed
 * survives a units save (units save as soon as they're chosen; decisions.md 2026-11-18).
 */
export function draftAfterSave(current: ProfileDraft, sent: ProfileChanges, user: ProfileFields): ProfileDraft {
  const next = savedProfile(user);
  return {
    name: sent.name !== undefined ? next.name : current.name,
    units: sent.display_units !== undefined ? next.units : current.units,
  };
}

export interface SavedNotice {
  title: string;
  message: string;
}

/** The success banner for what was just saved: the name's wording wins when the name changed. */
export function savedNotice(changes: ProfileChanges, units: DisplayUnits): SavedNotice {
  if (changes.name !== undefined) return { title: PROFILE_COPY.nameSavedTitle, message: PROFILE_COPY.nameSavedMessage };
  return { title: PROFILE_COPY.unitsSavedTitle, message: PROFILE_COPY.unitsSaved[units] };
}

export type SaveOutcome =
  | { kind: "saved"; user: RecordModel }
  /** The server refused the name (blank or badly spaced); the field says how to fix it. */
  | { kind: "name-refused" }
  /** No reply, or any other refusal: nothing is known to have been saved. */
  | { kind: "not-sent" };

function nameWasRefused(error: unknown): boolean {
  if (!(error instanceof ClientResponseError) || error.status !== 400) return false;
  const data = error.response.data as Record<string, unknown> | undefined;
  return data !== undefined && "name" in data;
}

/** Sends the changes; the SDK puts the updated record into pb.authStore. */
export async function saveProfile(pb: PocketBase, userId: string, changes: ProfileChanges): Promise<SaveOutcome> {
  try {
    return { kind: "saved", user: await pb.collection("users").update(userId, changes) };
  } catch (error) {
    return nameWasRefused(error) ? { kind: "name-refused" } : { kind: "not-sent" };
  }
}

/** Whether a record already holds every change. */
export function holdsChanges(user: ProfileFields, changes: ProfileChanges): boolean {
  if (changes.name !== undefined && user.name !== changes.name) return false;
  if (changes.display_units !== undefined && unitsOf(user) !== changes.display_units) return false;
  return true;
}

/**
 * Retry after NOT SENT: reload the record first; if it already shows the change, say it was
 * saved and send nothing. A reload that gets no reply is NOT SENT again.
 */
export async function retrySave(pb: PocketBase, userId: string, changes: ProfileChanges): Promise<SaveOutcome> {
  try {
    const reloaded = (await pb.collection("users").authRefresh()).record;
    if (holdsChanges(reloaded, changes)) return { kind: "saved", user: reloaded };
  } catch {
    return { kind: "not-sent" };
  }
  return saveProfile(pb, userId, changes);
}
