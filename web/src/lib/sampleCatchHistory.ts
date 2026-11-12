// Sample audit_log rows for the LB-03a skeleton, one history per catch in
// lib/sampleAnglerCatches.ts. Nothing here comes from PocketBase: audit rows can't be read
// through the API until M0-03 opens the audit_log list rule (R-AUD-L-02). Replace this
// module with those reads then (see lib/catchTimeline.ts for the row's shape).
//
// Every catch gets a create row and, when it is verified, an approve row two hours later (120 minutes).
// The judge can't approve their own catch (R-CAT-U-06), so the backup judge approves
// Kayden R.'s. Four catches have a longer story, one per Timeline item variant:
//   sample-1-catch-1  Dana R.'s 4.02 lb: submitted 4.20, photo 3 added, corrected (Figma 60:2986)
//   sample-2-catch-2  Marcus L.'s 3.80 lb: species edited before the judge looked
//   sample-5-catch-2  Priya N.'s 5.10 lb: a photo added, rejected, then re-approved

import type { AnglerCatchView } from "./anglerCatches";
import type { AuditActor, AuditSnapshot, CatchAuditRow } from "./catchTimeline";
import { SAMPLE_ANGLER_CATCHES } from "./sampleAnglerCatches";

const MINUTE = 60_000;

function snapshot(c: AnglerCatchView, overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return { species: c.species, measurement: c.measurement, status: c.status, reason: "", photos: c.photos.length, ...overrides };
}

function row(c: AnglerCatchView, n: number, action: CatchAuditRow["action"], actor: AuditActor, minutesAfterSubmit: number, before: AuditSnapshot | null, after: AuditSnapshot): CatchAuditRow {
  return { id: `${c.id}-audit-${n}`, action, actor, created: new Date(c.created.getTime() + minutesAfterSubmit * MINUTE), before, after };
}

/** Submitted as it stands now (all its photos), then approved if it is verified. */
function plainHistory(c: AnglerCatchView, judge: AuditActor): CatchAuditRow[] {
  const submitted = snapshot(c, { status: "pending" });
  const rows = [row(c, 1, "create", "Angler", 0, null, submitted)];
  if (c.status === "verified") rows.push(row(c, 2, "approve", judge, 120, submitted, snapshot(c)));
  return rows;
}

function dana(c: AnglerCatchView): CatchAuditRow[] {
  const submitted = snapshot(c, { status: "pending", measurement: { value: "4.20", unit: "lb" }, photos: 2 });
  const withPhoto = { ...submitted, photos: 3 };
  return [
    row(c, 1, "create", "Angler", 0, null, submitted),
    row(c, 2, "edit", "Angler", 23, submitted, withPhoto),
    row(c, 3, "correct", "Judge", 92, withPhoto, snapshot(c, { reason: "Scale readout shows 4.02." })),
  ];
}

function marcus(c: AnglerCatchView): CatchAuditRow[] {
  const submitted = snapshot(c, { status: "pending", species: "Largemouth bass" });
  const fixed = { ...submitted, species: c.species };
  return [
    row(c, 1, "create", "Angler", 0, null, submitted),
    row(c, 2, "edit", "Angler", 11, submitted, fixed),
    row(c, 3, "approve", "Judge", 150, fixed, snapshot(c)),
  ];
}

function priya(c: AnglerCatchView): CatchAuditRow[] {
  // An angler can't edit once the judge has decided (R-CAT-U-18), so the photo comes first.
  const submitted = snapshot(c, { status: "pending", photos: 2 });
  const withPhoto = { ...submitted, photos: 3 };
  const rejected = { ...withPhoto, status: "rejected" as const, reason: "Scale readout not legible." };
  return [
    row(c, 1, "create", "Angler", 0, null, submitted),
    row(c, 2, "edit", "Angler", 12, submitted, withPhoto),
    row(c, 3, "reject", "Judge", 95, withPhoto, rejected),
    row(c, 4, "approve", "Judge", 200, rejected, snapshot(c, { reason: "A second look at photo 3 shows the scale clearly." })),
  ];
}

const STORIES: Readonly<Record<string, (c: AnglerCatchView) => CatchAuditRow[]>> = {
  "sample-1-catch-1": dana,
  "sample-2-catch-2": marcus,
  "sample-5-catch-2": priya,
};

function historyFor(entryId: string, c: AnglerCatchView): CatchAuditRow[] {
  const story = STORIES[c.id];
  if (story) return story(c);
  return plainHistory(c, entryId === "sample-3" ? "Backup judge" : "Judge");
}

// Keyed by the catch's id, each history oldest first as the list request returns it.
export const SAMPLE_CATCH_HISTORY: Readonly<Record<string, readonly CatchAuditRow[]>> = Object.fromEntries(
  Object.entries(SAMPLE_ANGLER_CATCHES).flatMap(([entryId, catches]) => catches.map((c) => [c.id, historyFor(entryId, c)] as const)),
);
