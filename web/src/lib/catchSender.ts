// The seam between the submit screens and the backend (SUB-01a → SUB-02). The screens build a
// CatchDraft and hand it to a CatchSender; they only know the SendResult that comes back.
//
// S1 replaces sampleSender.ts with the real sender, which must, for each draft:
// - before re-encoding, read the first photo's capture time into `captured_at` and every
//   photo's into `photo_captured_at` (screens.md SUB-01a; R-CAT-C-19);
// - send every photo through the location strip: re-encode to JPEG, 2560 px long edge, 5 MB
//   at most (CLAUDE.md; decisions.md "Photo field limits"; the M0-04 spike proves it);
// - create the catch with `client_uuid` and never `status`, `judged_by`, `reason`, `flags` or
//   `rev` (R-CAT-C-03 to C-05, C-15);
// - on a resend with the same `client_uuid`, look the catch up first and answer
//   "already-received" if it landed (R-CAT-C-10, SUB-02d; decisions.md 2026-10-05 "No reply").

export interface PickedPhoto {
  /** The file as picked, untouched: the sender reads capture times from it, then strips it. */
  file: File;
  /** An object URL for the preview; the submit flow revokes it. */
  previewUrl: string;
}

export interface SpeciesChoice {
  id: string;
  name: string;
}

export interface CatchDraft {
  /** One per submission, kept for every resend (R-CAT-C-10). */
  clientUuid: string;
  eventId: string;
  species: SpeciesChoice;
  /** Hundredths of an ounce (scoring.md §4); weight events only (R-CAT-C-12). */
  weightHoz: number;
  /** In slot order: holding the fish, on the scale, then up to 2 extras. */
  photos: readonly PickedPhoto[];
  /** What the angler typed ("3.44 lb"), shown as "Catch as entered" on SUB-02a and SUB-02c. */
  enteredMeasurement: string;
}

/** Upload progress while sending (SUB-02a). fraction is null when the transport can't tell. */
export interface SendProgress {
  /** 1-based: the photo being uploaded now. */
  photo: number;
  photoCount: number;
  fraction: number | null;
}

/** The stored catch, as SUB-02b shows it. */
export interface ReceivedCatch {
  id: string;
  /** Server receive time, authoritative (screens.md §0). */
  created: Date;
  species: string;
  /** Already in the viewer's display units (screens.md §3.2): { value: "3.44", unit: "lb" }. */
  measurement: { value: string; unit: string };
  photoCount: number;
}

export type SendResult =
  /** SUB-02b: created now. */
  | { kind: "received"; catch: ReceivedCatch }
  /** SUB-02d: a resend found the catch by `client_uuid`. */
  | { kind: "already-received"; catch: ReceivedCatch }
  /** SUB-02c: no reply (offline, timeout, error); Retry may help. */
  | { kind: "not-sent" }
  /** SUB-02e: the server refused; Retry won't help (deadline, closed, withdrawn). */
  | { kind: "not-accepted" };

export type CatchSender = (draft: CatchDraft, onProgress: (progress: SendProgress) => void) => Promise<SendResult>;
