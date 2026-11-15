// The real CatchSender (catchSender.ts lists what it must do). No DOM: the photo preparation
// (capture time, then re-encode) is passed in, so the tests run this against a real PocketBase
// with a pass-through preparation.
//
// Every attempt for one draft carries the same client_uuid (R-CAT-C-10). Each attempt first looks
// the catch up by it, so a resend after a lost response answers "already-received" instead of
// sending twice (decisions.md 2026-10-05 "No reply"). The body never holds status, judged_by,
// reason, flags or rev (R-CAT-C-03 to C-05, C-15): the server sets them.

import type PocketBase from "pocketbase";
import { ClientResponseError, type RecordModel } from "pocketbase";
import type { CatchDraft, CatchSender, ReceivedCatch } from "./catchSender";
import type { Metric } from "./catchForm";
import { displayMeasurement } from "./displayWeight";
import { parsePbDate } from "./liveBoard";
import type { DisplayUnits } from "./profile";

export interface PreparedPhoto {
  file: File;
  capturedAt: Date | null;
}

export interface SendCatchOptions {
  pb: PocketBase;
  /** The viewer's entry in the draft's event. */
  entryId: string;
  metric: Metric;
  units: DisplayUnits;
  /** Reads the capture time, then re-encodes (photoPrepare.ts in the app). */
  prepare: (file: File, index: number) => Promise<PreparedPhoto>;
}

export type FailureKind = "not-sent" | "not-accepted";

/**
 * What a refused or failed request means for the angler. No reply at all (offline, timeout,
 * aborted) or a server error may succeed on a retry; a 4xx is the server saying no, which a
 * retry won't change (window closed, withdrawn, deadline passed: SUB-02e).
 */
export function failureKind(error: unknown): FailureKind {
  if (!(error instanceof ClientResponseError)) return "not-sent";
  if (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500) return "not-sent";
  return "not-accepted";
}

/** True when the create was refused only because a catch with this client_uuid already exists. */
function isDuplicateUuid(error: unknown): boolean {
  if (!(error instanceof ClientResponseError) || error.status !== 400) return false;
  const data = error.response.data as Record<string, { code?: string }> | undefined;
  return data?.client_uuid?.code === "validation_not_unique";
}

export function receivedCatch(record: RecordModel, metric: Metric, units: DisplayUnits): ReceivedCatch {
  const species = (record.expand?.species as RecordModel | undefined)?.name;
  const measurement = displayMeasurement(metric, units, record);
  return {
    id: record.id,
    created: parsePbDate(String(record.created)),
    species: species ? species.charAt(0).toUpperCase() + species.slice(1) : "",
    measurement,
    photoCount: (record.photo as string[] | undefined)?.length ?? 0,
  };
}

/** The member's catch with this client_uuid, if it landed. */
async function findByUuid(pb: PocketBase, clientUuid: string): Promise<RecordModel | null> {
  const found = await pb.collection("catches").getList(1, 1, {
    filter: pb.filter("client_uuid = {:uuid}", { uuid: clientUuid }),
    expand: "species",
  });
  return found.items[0] ?? null;
}

/** The multipart body the create rule expects (docs/security.md "catches" Create). */
export function catchBody(draft: CatchDraft, entryId: string, metric: Metric, photos: readonly PreparedPhoto[]): FormData {
  const times = photos.map((photo) => (photo.capturedAt ? photo.capturedAt.toISOString() : ""));
  const body = new FormData();
  body.set("entry", entryId);
  body.set("species", draft.species.id);
  if (metric === "weight") body.set("weight_hoz", String(draft.weightHoz));
  body.set("client_uuid", draft.clientUuid);
  body.set("captured_at", times[0] ?? "");
  body.set("photo_captured_at", JSON.stringify(times));
  for (const photo of photos) body.append("photo", photo.file);
  return body;
}

export function createCatchSender({ pb, entryId, metric, units, prepare }: SendCatchOptions): CatchSender {
  return async (draft, onProgress) => {
    const photoCount = draft.photos.length;

    let landed: RecordModel | null;
    try {
      landed = await findByUuid(pb, draft.clientUuid);
    } catch (error) {
      return { kind: failureKind(error) };
    }
    if (landed) return { kind: "already-received", catch: receivedCatch(landed, metric, units) };

    const prepared: PreparedPhoto[] = [];
    for (const [index, photo] of draft.photos.entries()) {
      onProgress({ photo: index + 1, photoCount, fraction: null });
      try {
        prepared.push(await prepare(photo.file, index));
      } catch {
        // A photo the browser can't decode won't decode on a retry either.
        return { kind: "not-accepted" };
      }
    }

    try {
      const created = await pb.collection("catches").create(catchBody(draft, entryId, metric, prepared), { expand: "species" });
      return { kind: "received", catch: receivedCatch(created, metric, units) };
    } catch (error) {
      if (isDuplicateUuid(error)) {
        // Another attempt landed between the lookup and this one.
        const again = await findByUuid(pb, draft.clientUuid).catch(() => null);
        if (again) return { kind: "already-received", catch: receivedCatch(again, metric, units) };
      }
      return { kind: failureKind(error) };
    }
  };
}
