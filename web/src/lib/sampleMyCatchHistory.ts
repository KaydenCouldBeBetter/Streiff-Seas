// Sample audit_log rows for the MY-06a skeleton, one history per catch in
// lib/sampleMyCatches.ts. Nothing here comes from PocketBase: audit rows can't be read
// through the API until M0-03 opens the audit_log list rule (R-AUD-L-02, L-09). Replace this
// module with those reads then (see lib/catchTimeline.ts for the row's shape).
//
// Every row's actor is "You" for the angler's own steps (MY-06a), and each history ends where
// the catch stands now, with its decision and retraction at the times MY-02 shows. Every catch
// is created with the photos it has now, except `sample-corrected`, which is Figma 49:2287:
// submitted 4.20 lb Largemouth bass with 2 photos, species edited, photo 3 added, then
// corrected by the judge to 4.02 lb.

import type { AuditActor, AuditSnapshot, CatchAuditRow } from "./catchTimeline";
import type { MyCatchView } from "./myCatches";
import { SAMPLE_MY_CATCHES } from "./sampleMyCatches";

const MINUTE = 60_000;

function snapshot(c: MyCatchView, overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return { species: c.species, measurement: c.measurement, status: c.status, reason: "", photos: c.photos.length, ...overrides };
}

function row(c: MyCatchView, n: number, action: CatchAuditRow["action"], actor: AuditActor, created: Date, before: AuditSnapshot | null, after: AuditSnapshot): CatchAuditRow {
  return { id: `${c.id}-audit-${n}`, action, actor, created, before, after };
}

/** The Figma frame's story: a species edit, a third photo, then the judge's correction. */
function corrected(c: MyCatchView): CatchAuditRow[] {
  const submitted = snapshot(c, { status: "pending", species: "Largemouth bass", measurement: { value: "4.20", unit: "lb" }, photos: 2 });
  const edited = { ...submitted, species: c.species };
  const withPhoto = { ...edited, photos: 3 };
  return [
    row(c, 1, "create", "You", c.created, null, submitted),
    row(c, 2, "edit", "You", new Date(c.created.getTime() + 5 * MINUTE), submitted, edited),
    row(c, 3, "edit", "You", new Date(c.created.getTime() + 50 * MINUTE), edited, withPhoto),
    row(c, 4, "correct", c.decision?.by ?? "Judge", c.decision?.at ?? c.created, withPhoto, snapshot(c, { reason: c.reason ?? "" })),
  ];
}

/** Submitted as it stands now, then decided or retracted as the catch's own fields say. */
function plain(c: MyCatchView): CatchAuditRow[] {
  const submitted = snapshot(c, { status: "pending" });
  const rows = [row(c, 1, "create", "You", c.created, null, submitted)];
  if (c.status === "verified" && c.decision) rows.push(row(c, 2, "approve", c.decision.by, c.decision.at, submitted, snapshot(c, { reason: c.reason ?? "" })));
  if (c.status === "rejected" && c.decision) rows.push(row(c, 2, "reject", c.decision.by, c.decision.at, submitted, snapshot(c, { reason: c.reason ?? "" })));
  if (c.status === "retracted" && c.retractedAt) rows.push(row(c, 2, "retract", "You", c.retractedAt, submitted, snapshot(c)));
  return rows;
}

// Keyed by the catch's id, each history oldest first as the list request returns it.
export const SAMPLE_MY_CATCH_HISTORY: Readonly<Record<string, readonly CatchAuditRow[]>> = Object.fromEntries(
  SAMPLE_MY_CATCHES.map((c) => [c.id, c.correction ? corrected(c) : plain(c)] as const),
);
