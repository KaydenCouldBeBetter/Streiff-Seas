// LB-03 Catch detail's History (and MY-06a Catch history, JDG-02's timeline): one catch's
// audit_log rows turned into the lines the Figma Timeline item shows. Pure: no DOM, no
// PocketBase.
//
// Wiring: the rows come from the audit_log list rule for a catch the viewer can see
// (R-AUD-L-02, M0-03). Every row's `before` and `after` hold the same fixed snapshot
// (decisions.md 2026-10-02 "Audit rows store a fixed snapshot"), and the app compares them to
// show what changed. A row here carries that snapshot already shaped for display: the
// measurement rounded in the viewer's units (scoring.md), the photo filenames as a count.
// Flag codes are never part of it: members don't see them in the timeline (screens.md Gap 23).
// Until M0-03 the screens run on lib/sampleCatchHistory.ts.

import { formatClubTime, formatClubTimeSpoken } from "./format";
import type { CatchStatus } from "./myCatches";

/** Labelled by comparing IDs the viewer can read; members can't read `users` (screens.md Gap 13). */
export type AuditActor = "Angler" | "Judge" | "Backup judge" | "Organizer";

/** The catch actions in audit_log.action (security.md); join, withdraw and the event actions have no catch. */
export type AuditAction = "create" | "edit" | "retract" | "approve" | "reject" | "correct";

export interface AuditSnapshot {
  species: string;
  measurement: { value: string; unit: string };
  status: CatchStatus;
  /** "" when the judge gave none. */
  reason: string;
  /** How many files `photo` held. */
  photos: number;
}

export interface CatchAuditRow {
  id: string;
  action: AuditAction;
  actor: AuditActor;
  created: Date;
  /** Empty on the create row. */
  before: AuditSnapshot | null;
  after: AuditSnapshot;
}

/** The Figma Timeline item's variants. */
export type TimelineKind =
  | "Submitted"
  | "Edited"
  | "Photo added"
  | "Rejected"
  | "Re-approved"
  | "Corrected and approved"
  | "Approved"
  | "Retracted";

/** The marker's color: green for every approval, red for a rejection, grey for the rest. */
export type TimelineTone = "success" | "danger" | "neutral";

export interface TimelineLine {
  /** As drawn: "Weight 4.20 → 4.02 lb". */
  text: string;
  /** As read aloud: "Weight 4.20 to 4.02 pounds". */
  spoken: string;
}

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  tone: TimelineTone;
  actor: AuditActor;
  at: Date;
  /** "Judge · Sat, Jul 10, 9:14 AM" */
  meta: string;
  detail: readonly TimelineLine[];
  /** One sentence for a screen reader (Figma Timeline item VoiceOver note). */
  spoken: string;
}

const SPOKEN_UNIT: Record<string, string> = { lb: "pounds", in: "inches" };

function spokenUnit(unit: string): string {
  return SPOKEN_UNIT[unit] ?? unit;
}

function photoCount(n: number): string {
  return `${n} ${n === 1 ? "photo" : "photos"}`;
}

/** "Photo 3 added", "Photos 3 and 4 added". */
function photosAdded(before: number, after: number): TimelineLine {
  const numbers = Array.from({ length: after - before }, (_, i) => before + i + 1);
  const text =
    numbers.length === 1
      ? `Photo ${numbers[0]} added`
      : `Photos ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]} added`;
  return { text, spoken: text };
}

function reasonLine(reason: string): TimelineLine {
  return { text: `Reason: “${reason}”`, spoken: `Reason: ${reason}` };
}

/** What a row changed in species and measurement, from its two snapshots. */
function changedFields(before: AuditSnapshot, after: AuditSnapshot, metricLabel: string): TimelineLine[] {
  const lines: TimelineLine[] = [];
  if (before.species !== after.species) {
    const text = `Species ${before.species} → ${after.species}`;
    lines.push({ text, spoken: `Species ${before.species} to ${after.species}` });
  }
  if (before.measurement.value !== after.measurement.value) {
    const { unit } = after.measurement;
    lines.push({
      text: `${metricLabel} ${before.measurement.value} → ${after.measurement.value} ${unit}`,
      spoken: `${metricLabel} ${before.measurement.value} to ${after.measurement.value} ${spokenUnit(unit)}`,
    });
  }
  return lines;
}

function describe(row: CatchAuditRow, metricLabel: string): { kind: TimelineKind; tone: TimelineTone; detail: TimelineLine[] } {
  const { before, after } = row;
  switch (row.action) {
    case "create": {
      const { value, unit } = after.measurement;
      return {
        kind: "Submitted",
        tone: "neutral",
        detail: [
          {
            text: `${value} ${unit} · ${after.species} · ${photoCount(after.photos)}`,
            spoken: `${value} ${spokenUnit(unit)}, ${after.species}, ${photoCount(after.photos)}`,
          },
        ],
      };
    }
    case "edit": {
      const detail = before ? changedFields(before, after, metricLabel) : [];
      const added = before !== null && after.photos > before.photos;
      if (added) detail.push(photosAdded(before.photos, after.photos));
      // Only photos grew: "Photo added". Anything else the angler changed: "Edited".
      return { kind: added && detail.length === 1 ? "Photo added" : "Edited", tone: "neutral", detail };
    }
    case "approve": {
      const reapproved = before?.status === "rejected";
      return { kind: reapproved ? "Re-approved" : "Approved", tone: "success", detail: after.reason ? [reasonLine(after.reason)] : [] };
    }
    case "reject":
      return { kind: "Rejected", tone: "danger", detail: after.reason ? [reasonLine(after.reason)] : [] };
    case "correct": {
      const detail = before ? changedFields(before, after, metricLabel) : [];
      if (after.reason) detail.push(reasonLine(after.reason));
      return { kind: "Corrected and approved", tone: "success", detail };
    }
    case "retract":
      return { kind: "Retracted", tone: "neutral", detail: [] };
  }
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The timeline, newest first (Figma Timeline item note). Rows with the same time keep the
 * order the list returned them in, the later one counting as newer.
 */
export function timelineEntries(rows: readonly CatchAuditRow[], metric: "weight" | "length"): TimelineEntry[] {
  const metricLabel = metric === "weight" ? "Weight" : "Length";
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.created.getTime() - a.row.created.getTime() || b.index - a.index)
    .map(({ row }) => {
      const { kind, tone, detail } = describe(row, metricLabel);
      const spoken = [`${kind} by the ${row.actor.toLowerCase()}, ${formatClubTimeSpoken(row.created)}.`, ...detail.map((line) => sentence(line.spoken))].join(" ");
      return {
        id: row.id,
        kind,
        tone,
        actor: row.actor,
        at: row.created,
        meta: `${row.actor} · ${formatClubTime(row.created)}`,
        detail,
        spoken,
      };
    });
}
