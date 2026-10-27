// My catches (MY-01) and My catch (MY-02): the view model the screens render, and the rules
// that pick a screens.md row and the actions it offers. Pure: no DOM, no PocketBase.
//
// Wiring: the angler's own catches in one event come from the catches list rule (angler
// branch, M0-03), newest first; `inBest` from scoring (S2a); `decision`, `correction` and
// `retractedAt` from the catch's audit_log rows (R-AUD-L-02). Until then the screens run on
// lib/sampleMyCatches.ts.

export type CatchStatus = "pending" | "verified" | "rejected" | "retracted";

/** The event's state as screens.md §1 names it: events.status, plus the window for live. */
export type EventPhase = "live:pre" | "live:window" | "live:late" | "live:over" | "closed" | "final";

/** The viewer's entry: withdrawn by themself, or by the organizer ("withdrawn-by-K"). */
export type EntryState = "active" | "withdrawn-self" | "withdrawn-by-K";

export interface MyCatchesContext {
  eventName: string;
  /** events.metric: picks "Edit species or weight" or "… or length". */
  metric: "weight" | "length";
  /** events.best_n: "In best 10". */
  bestN: number;
  phase: EventPhase;
  entry: EntryState;
  /** events.submit_deadline, extension included (Gap 28). */
  submitDeadline: Date;
}

export interface CatchPhoto {
  /** pb.files.getURL for this file. Absent in the skeleton, and never requested once final. */
  url?: string;
}

export interface MyCatchView {
  id: string;
  /** species.name, as the event lists it. */
  species: string;
  /** weight_hoz or length_q, already rounded for display in the viewer's units (scoring.md). */
  measurement: { value: string; unit: string };
  status: CatchStatus;
  created: Date;
  /** captured_at, when the first photo carried a capture time. */
  capturedAt?: Date;
  /** The photo field in upload order: 1 to 4. */
  photos: readonly CatchPhoto[];
  /** Always set on rejected; optional on verified. */
  reason?: string;
  /** A verified catch counted in the angler's best n (S2a). */
  inBest: boolean;
  /** The approve or reject audit row: who decided, labelled by comparing IDs, and when. */
  decision?: { by: "Judge" | "Backup judge"; at: Date };
  /** The latest correct audit row, as one line: "Weight 4.20 → 4.02 lb". */
  correction?: { change: string };
  /** The retract audit row's time. */
  retractedAt?: Date;
}

export const MAX_PHOTOS = 4;

/** Submitting is open in the EVT-02d and EVT-02e states only: window or late, entry active. */
export function submittingOpen(context: MyCatchesContext): boolean {
  return context.entry === "active" && (context.phase === "live:window" || context.phase === "live:late");
}

export type MyCatchesRow = "MY-01a" | "MY-01b" | "MY-01c";

export function myCatchesRow(context: MyCatchesContext, catchCount: number): MyCatchesRow {
  if (catchCount === 0) return "MY-01a";
  return context.phase === "final" ? "MY-01c" : "MY-01b";
}

/** Newest first (Figma MY-01b note); the list request sorts by -created the same way. */
export function newestFirst<T extends Pick<MyCatchView, "created">>(catches: readonly T[]): T[] {
  return [...catches].sort((a, b) => b.created.getTime() - a.created.getTime());
}

/** "Summer Bass 2027 · 6 catches · 3 counted", or just the event's name when empty. */
export function myCatchesSubtitle(context: MyCatchesContext, catches: readonly MyCatchView[]): string {
  if (catches.length === 0) return context.eventName;
  const counted = catches.filter((c) => c.status === "verified" && c.inBest).length;
  const noun = catches.length === 1 ? "catch" : "catches";
  return `${context.eventName} · ${catches.length} ${noun} · ${counted} counted`;
}

export type MyCatchRow = "MY-02a" | "MY-02b" | "MY-02c" | "MY-02d" | "MY-02e" | "MY-02f" | "MY-02g" | "MY-02h" | "MY-02i";

export interface MyCatchState {
  row: MyCatchRow;
  /** The status row MY-02i shows "the same as" once final; equal to row otherwise. */
  statusRow: Exclude<MyCatchRow, "MY-02i">;
  canEdit: boolean;
  canAddPhotos: boolean;
  canRetract: boolean;
  /** Rejected only, and only while submitting is open (MY-02g). */
  canSubmitNew: boolean;
  /** Final: "Photo archived" in place of every photo, and no file is requested. */
  photosArchived: boolean;
}

function statusRow(c: MyCatchView, context: MyCatchesContext): MyCatchState["statusRow"] {
  switch (c.status) {
    case "pending":
      if (context.entry !== "active") return "MY-02d";
      if (context.phase !== "live:window" && context.phase !== "live:late") return "MY-02c";
      return c.photos.length < MAX_PHOTOS ? "MY-02a" : "MY-02b";
    case "verified":
      return c.correction ? "MY-02f" : "MY-02e";
    case "rejected":
      return "MY-02g";
    case "retracted":
      return "MY-02h";
  }
}

/**
 * The MY-02 row for one own catch, and what it offers. The update rule (R-CAT-U-16 and the
 * refusals beside it) is the real gate; this only decides what the screen shows.
 */
export function myCatchState(c: MyCatchView, context: MyCatchesContext): MyCatchState {
  const base = statusRow(c, context);
  if (context.phase === "final") {
    return { row: "MY-02i", statusRow: base, canEdit: false, canAddPhotos: false, canRetract: false, canSubmitNew: false, photosArchived: true };
  }
  const editable = base === "MY-02a" || base === "MY-02b";
  return {
    row: base,
    statusRow: base,
    canEdit: editable,
    canAddPhotos: base === "MY-02a",
    canRetract: editable,
    canSubmitNew: base === "MY-02g" && submittingOpen(context),
    photosArchived: false,
  };
}

export interface PhotoLabel {
  /** Under the thumbnail: "Holding". */
  short: string;
  /** On the photo: "Holding the fish". */
  long: string;
}

/** The first two photos are the required holding and scale shots; the rest are extras. */
export function photoLabels(count: number): PhotoLabel[] {
  const extras = count - 2;
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return { short: "Holding", long: "Holding the fish" };
    if (i === 1) return { short: "On the scale", long: "On the scale" };
    const name = extras === 1 ? "Extra" : `Extra ${i - 1}`;
    return { short: name, long: name };
  });
}
