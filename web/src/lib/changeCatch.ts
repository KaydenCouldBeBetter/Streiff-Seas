// Edit (MY-03), Add photos (MY-04) and Retract (MY-05): the angler's changes to their own pending
// catch, and what each outcome means for the screen. No DOM: the tests run it against a real
// PocketBase (test/changeCatch.test.ts).
//
// Every request echoes the `rev` the screen loaded (R-CAT-U-39). The server refuses a stale one:
// the update rule answers 404, and two requests racing with the same rev get 400 rev_stale from
// the compare-and-swap in pb_hooks/catches_update.pb.js (R-CAT-U-40). After any refusal the catch,
// its entry and its event are reloaded and the reason is inferred from what changed (screens.md
// Gap 16). With no reply at all the screen shows NOT SENT; Retry reloads first, and if the change
// already landed it says so and sends nothing (decisions.md 2026-10-05 "No reply on any change").

import type PocketBase from "pocketbase";
import { ClientResponseError, type RecordModel } from "pocketbase";
import { parsePbDate } from "./liveBoard";
import { MAX_PHOTOS } from "./myCatches";
import { failureKind, type PreparedPhoto } from "./sendCatch";

/** The catch as the screen loaded it: what a change starts from. */
export interface CatchBase {
  id: string;
  rev: number;
  speciesId: string;
  weightHoz: number;
  lengthQ: number;
  photoCount: number;
  /** photo_captured_at as stored; an added photo resends it unchanged (R-CAT-U-36). */
  photoCapturedAt: readonly string[];
}

export function catchBaseOf(record: RecordModel): CatchBase {
  const photos = Array.isArray(record.photo) ? record.photo : [];
  const times = Array.isArray(record.photo_captured_at) ? record.photo_captured_at.map((time) => (time === null ? "" : String(time))) : [];
  return {
    id: record.id,
    rev: Number(record.rev),
    speciesId: String(record.species ?? ""),
    weightHoz: Number(record.weight_hoz ?? 0),
    lengthQ: Number(record.length_q ?? 0),
    photoCount: photos.length,
    photoCapturedAt: times,
  };
}

/** The fields an edit sends; only the ones that change. */
export interface EditFields {
  species?: string;
  weight_hoz?: number;
  length_q?: number;
}

export type Change = { action: "edit"; fields: EditFields } | { action: "photos"; photos: readonly PreparedPhoto[] } | { action: "retract" };

/** Why a change wasn't saved, worded on the screen (copy in changeCopy.ts). */
export type RefusalReason = "approved" | "rejected" | "retracted" | "withdrawn" | "deadline" | "full" | "photo" | "changed" | "unknown";

export type ChangeResult =
  | { kind: "saved" }
  /** A Retry found the change already stored: nothing was sent again. */
  | { kind: "already-saved" }
  /** No reply: the change may or may not have landed. Retry finds out. */
  | { kind: "not-sent" }
  /** The server said no; the catch was reloaded. The deadline is there for its message. */
  | { kind: "refused"; reason: RefusalReason; submitDeadline?: Date };

/**
 * What an edit would send, or null when it changes nothing (the server refuses an empty edit:
 * nothing_changed). `measurement` is the parsed weight_hoz or length_q for the event's metric.
 */
export function editFields(base: CatchBase, metric: "weight" | "length", speciesId: string, measurement: number): EditFields | null {
  const fields: EditFields = {};
  if (speciesId !== base.speciesId) fields.species = speciesId;
  if (metric === "weight" && measurement !== base.weightHoz) fields.weight_hoz = measurement;
  if (metric === "length" && measurement !== base.lengthQ) fields.length_q = measurement;
  return Object.keys(fields).length > 0 ? fields : null;
}

/** The catch, entry and event as a reload finds them. */
export interface Reloaded {
  base: CatchBase;
  status: string;
  withdrawn: boolean;
  eventStatus: string;
  submitDeadline: Date | null;
}

function reloadedOf(record: RecordModel): Reloaded {
  const entry = record.expand?.entry as RecordModel | undefined;
  const event = entry?.expand?.event as RecordModel | undefined;
  const deadline = String(event?.submit_deadline ?? "");
  return {
    base: catchBaseOf(record),
    status: String(record.status),
    withdrawn: entry?.withdrawn === true,
    eventStatus: String(event?.status ?? ""),
    submitDeadline: deadline === "" ? null : parsePbDate(deadline),
  };
}

/** Reloads the catch with its entry and event, as the member: their own catch is always visible. */
export async function reloadCatch(pb: PocketBase, id: string): Promise<Reloaded> {
  return reloadedOf(await pb.collection("catches").getOne(id, { expand: "entry.event", requestKey: null }));
}

/** The fields a refusal's body names, e.g. ["rev"] for rev_stale or ["photo"] for a photo the server wouldn't take. */
function refusedFields(error: unknown): string[] {
  if (!(error instanceof ClientResponseError)) return [];
  return Object.keys((error.response?.data ?? {}) as Record<string, unknown>);
}

/** Why a refused change was refused, from what the reload shows (screens.md Gap 16). Pure. */
export function refusalReason(change: Change, base: CatchBase, reloaded: Reloaded, nowMs: number, fields: readonly string[] = []): RefusalReason {
  if (reloaded.status === "verified") return "approved";
  if (reloaded.status === "rejected") return "rejected";
  if (reloaded.status === "retracted") return "retracted";
  if (reloaded.withdrawn) return "withdrawn";
  if (reloaded.eventStatus !== "live" || (reloaded.submitDeadline !== null && nowMs > reloaded.submitDeadline.getTime())) return "deadline";
  if (change.action === "photos" && reloaded.base.photoCount + change.photos.length > MAX_PHOTOS) return "full";
  // Not a JPEG, over 5 MB, or the strip failed (catch_lib.js photoError and the schema both name `photo`).
  if (change.action === "photos" && fields.includes("photo")) return "photo";
  if (reloaded.base.rev !== base.rev) return "changed";
  return "unknown";
}

/** True when the reloaded catch already shows this change (a Retry after no reply). */
export function changeLanded(change: Change, base: CatchBase, reloaded: Reloaded): boolean {
  switch (change.action) {
    case "retract":
      return reloaded.status === "retracted";
    case "photos":
      return reloaded.base.rev > base.rev && reloaded.base.photoCount === base.photoCount + change.photos.length;
    case "edit": {
      const { fields } = change;
      if (reloaded.base.rev <= base.rev) return false;
      return (
        (fields.species === undefined || fields.species === reloaded.base.speciesId) &&
        (fields.weight_hoz === undefined || fields.weight_hoz === reloaded.base.weightHoz) &&
        (fields.length_q === undefined || fields.length_q === reloaded.base.lengthQ)
      );
    }
  }
}

/** The request body. Photos go as multipart: `photo+` appends, and the times resend the stored list. */
export function changeBody(base: CatchBase, change: Change): FormData | Record<string, unknown> {
  switch (change.action) {
    case "edit":
      return { rev: base.rev, ...change.fields };
    case "retract":
      return { rev: base.rev, status: "retracted" };
    case "photos": {
      const added = change.photos.map((photo) => (photo.capturedAt ? photo.capturedAt.toISOString() : ""));
      const body = new FormData();
      body.set("rev", String(base.rev));
      body.set("photo_captured_at", JSON.stringify([...base.photoCapturedAt, ...added]));
      for (const photo of change.photos) body.append("photo+", photo.file);
      return body;
    }
  }
}

function refusal(reason: RefusalReason, reloaded: Reloaded): ChangeResult {
  return reloaded.submitDeadline ? { kind: "refused", reason, submitDeadline: reloaded.submitDeadline } : { kind: "refused", reason };
}

async function refused(pb: PocketBase, change: Change, base: CatchBase, nowMs: number, fields: string[]): Promise<ChangeResult> {
  try {
    const reloaded = await reloadCatch(pb, base.id);
    return refusal(refusalReason(change, base, reloaded, nowMs, fields), reloaded);
  } catch {
    return { kind: "refused", reason: change.action === "photos" && fields.includes("photo") ? "photo" : "unknown" };
  }
}

/** Sends one change with the loaded rev. */
export async function sendChange(pb: PocketBase, base: CatchBase, change: Change, nowMs: number): Promise<ChangeResult> {
  try {
    await pb.collection("catches").update(base.id, changeBody(base, change), { requestKey: null });
    return { kind: "saved" };
  } catch (error) {
    if (failureKind(error) === "not-sent") return { kind: "not-sent" };
    return refused(pb, change, base, nowMs, refusedFields(error));
  }
}

/**
 * Retry after NOT SENT (MY-03c, MY-04b, MY-05c): reload first. Already there → already-saved, and
 * nothing is sent. Changed some other way → refused, with the reason. Unchanged → send again.
 */
export async function retryChange(pb: PocketBase, base: CatchBase, change: Change, nowMs: number): Promise<ChangeResult> {
  let reloaded: Reloaded;
  try {
    reloaded = await reloadCatch(pb, base.id);
  } catch (error) {
    return failureKind(error) === "not-sent" ? { kind: "not-sent" } : { kind: "refused", reason: "unknown" };
  }
  if (changeLanded(change, base, reloaded)) return { kind: "already-saved" };
  if (reloaded.base.rev !== base.rev || reloaded.status !== "pending") {
    return refusal(refusalReason(change, base, reloaded, nowMs), reloaded);
  }
  return sendChange(pb, base, change, nowMs);
}
