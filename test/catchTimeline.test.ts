import { describe, expect, it } from "vitest";
import { timelineEntries, type AuditSnapshot, type CatchAuditRow } from "../web/src/lib/catchTimeline";
import { SAMPLE_ANGLER_CATCHES } from "../web/src/lib/sampleAnglerCatches";
import { SAMPLE_CATCH_HISTORY } from "../web/src/lib/sampleCatchHistory";

function snap(overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return { species: "Largemouth bass", measurement: { value: "4.20", unit: "lb" }, status: "pending", reason: "", photos: 2, ...overrides };
}

function auditRow(overrides: Partial<CatchAuditRow> & Pick<CatchAuditRow, "action" | "after">): CatchAuditRow {
  return { id: overrides.action, actor: "Angler", created: new Date("2027-07-10T11:42:00Z"), before: null, ...overrides };
}

// Figma 60:2986: the three rows of Dana R.'s 4.02 lb catch, newest first.
describe("timelineEntries on the LB-03a frame", () => {
  const submitted = snap();
  const withPhoto = snap({ photos: 3 });
  const rows: CatchAuditRow[] = [
    auditRow({ id: "a", action: "create", after: submitted }),
    auditRow({ id: "b", action: "edit", created: new Date("2027-07-10T12:05:00Z"), before: submitted, after: withPhoto }),
    auditRow({
      id: "c",
      action: "correct",
      actor: "Judge",
      created: new Date("2027-07-10T13:14:00Z"),
      before: withPhoto,
      after: snap({ status: "verified", photos: 3, measurement: { value: "4.02", unit: "lb" }, reason: "Scale readout shows 4.02." }),
    }),
  ];
  const entries = timelineEntries(rows, "weight");

  it("lists them newest first with the Figma kinds, markers, actors and times", () => {
    expect(entries.map((e) => [e.kind, e.tone, e.meta])).toEqual([
      ["Corrected and approved", "success", "Judge · Sat, Jul 10, 9:14 AM"],
      ["Photo added", "neutral", "Angler · Sat, Jul 10, 8:05 AM"],
      ["Submitted", "neutral", "Angler · Sat, Jul 10, 7:42 AM"],
    ]);
  });

  it("shows what changed from the before and after snapshots", () => {
    expect(entries.map((e) => e.detail.map((line) => line.text))).toEqual([
      ["Weight 4.20 → 4.02 lb", "Reason: “Scale readout shows 4.02.”"],
      ["Photo 3 added"],
      ["4.20 lb · Largemouth bass · 2 photos"],
    ]);
  });

  it("reads each item as one sentence (Figma Timeline item VoiceOver note)", () => {
    expect(entries[0]?.spoken).toBe(
      "Corrected and approved by the judge, Saturday July 10, 9:14 AM. Weight 4.20 to 4.02 pounds. Reason: Scale readout shows 4.02.",
    );
    expect(entries[2]?.spoken).toBe("Submitted by the angler, Saturday July 10, 7:42 AM. 4.20 pounds, Largemouth bass, 2 photos.");
  });
});

describe("timelineEntries kinds", () => {
  const kindOf = (row: CatchAuditRow) => timelineEntries([row], "weight")[0];

  it("calls an edit of species or measurement Edited, and names the metric", () => {
    const edited = kindOf(auditRow({ action: "edit", before: snap(), after: snap({ species: "Smallmouth bass" }) }));
    expect(edited?.kind).toBe("Edited");
    expect(edited?.detail.map((l) => l.text)).toEqual(["Species Largemouth bass → Smallmouth bass"]);

    const length = timelineEntries(
      [auditRow({ action: "edit", before: snap({ measurement: { value: "17 1/2", unit: "in" } }), after: snap({ measurement: { value: "18", unit: "in" } }) })],
      "length",
    )[0];
    expect(length?.detail[0]).toEqual({ text: "Length 17 1/2 → 18 in", spoken: "Length 17 1/2 to 18 inches" });
  });

  it("calls an edit that also adds a photo Edited, with the photo line last", () => {
    const entry = kindOf(auditRow({ action: "edit", before: snap(), after: snap({ species: "Smallmouth bass", photos: 3 }) }));
    expect(entry?.kind).toBe("Edited");
    expect(entry?.detail.map((l) => l.text)).toEqual(["Species Largemouth bass → Smallmouth bass", "Photo 3 added"]);
  });

  it("names two added photos", () => {
    expect(kindOf(auditRow({ action: "edit", before: snap(), after: snap({ photos: 4 }) }))?.detail[0]?.text).toBe("Photos 3 and 4 added");
  });

  it("says Approved, or Re-approved when the catch had been rejected, with the judge's reason", () => {
    expect(kindOf(auditRow({ action: "approve", actor: "Judge", before: snap(), after: snap({ status: "verified" }) }))).toMatchObject({ kind: "Approved", tone: "success", detail: [] });
    const again = kindOf(
      auditRow({ action: "approve", actor: "Backup judge", before: snap({ status: "rejected", reason: "Blurry." }), after: snap({ status: "verified", reason: "Clear on photo 3." }) }),
    );
    expect(again).toMatchObject({ kind: "Re-approved", tone: "success" });
    expect(again?.detail.map((l) => l.text)).toEqual(["Reason: “Clear on photo 3.”"]);
    expect(again?.spoken).toBe("Re-approved by the backup judge, Saturday July 10, 7:42 AM. Reason: Clear on photo 3.");
  });

  it("shows a rejection in red with its reason, and a retraction with no detail", () => {
    expect(kindOf(auditRow({ action: "reject", actor: "Judge", before: snap(), after: snap({ status: "rejected", reason: "Not legible." }) }))).toMatchObject({
      kind: "Rejected",
      tone: "danger",
    });
    expect(kindOf(auditRow({ action: "retract", before: snap(), after: snap({ status: "retracted" }) }))).toMatchObject({ kind: "Retracted", tone: "neutral", detail: [] });
  });

  it("keeps the order the rows came in when two share a time, the later one being newer", () => {
    const at = new Date("2027-07-10T11:42:00Z");
    const rows = [auditRow({ id: "first", action: "create", after: snap(), created: at }), auditRow({ id: "second", action: "edit", before: snap(), after: snap({ photos: 3 }), created: at })];
    expect(timelineEntries(rows, "weight").map((e) => e.id)).toEqual(["second", "first"]);
  });

  it("never shows a flag code: the snapshot has no field for one", () => {
    const entry = kindOf(auditRow({ action: "create", after: snap() }));
    expect(JSON.stringify(entry)).not.toMatch(/flag|extra_photo|late/i);
  });
});

describe("SAMPLE_CATCH_HISTORY", () => {
  const all = Object.values(SAMPLE_ANGLER_CATCHES).flat();

  it("has a history for every sample catch, starting with its create row", () => {
    for (const c of all) {
      const rows = SAMPLE_CATCH_HISTORY[c.id];
      expect(rows?.[0]?.action, c.id).toBe("create");
      expect(rows?.[0]?.before, c.id).toBeNull();
    }
  });

  it("ends where the catch stands now", () => {
    for (const c of all) {
      const last = SAMPLE_CATCH_HISTORY[c.id]?.at(-1)?.after;
      expect(last, c.id).toMatchObject({ species: c.species, measurement: c.measurement, status: c.status, photos: c.photos.length });
    }
  });

  it("is in time order, each row's before being the row's predecessor's after", () => {
    for (const c of all) {
      const rows = SAMPLE_CATCH_HISTORY[c.id] ?? [];
      rows.forEach((r, i) => {
        if (i === 0) return;
        const prev = rows[i - 1]!;
        expect(r.created.getTime(), r.id).toBeGreaterThan(prev.created.getTime());
        expect(r.before?.status, r.id).toBe(prev.after.status);
        expect(r.before?.photos, r.id).toBe(prev.after.photos);
      });
    }
  });

  it("has no decision on a pending catch and one on every verified catch", () => {
    for (const c of all) {
      const decided = (SAMPLE_CATCH_HISTORY[c.id] ?? []).some((r) => r.action === "approve" || r.action === "correct");
      expect(decided, c.id).toBe(c.status === "verified");
    }
  });

  it("only lets an angler change a catch while it is pending (R-CAT-U-18)", () => {
    for (const c of all) {
      for (const r of SAMPLE_CATCH_HISTORY[c.id] ?? []) {
        if (r.action === "edit") expect(r.before?.status, r.id).toBe("pending");
      }
    }
  });

  it("has the backup judge approve the judge's own catches (R-CAT-U-06)", () => {
    const kayden = SAMPLE_ANGLER_CATCHES["sample-3"] ?? [];
    for (const c of kayden) {
      const approver = (SAMPLE_CATCH_HISTORY[c.id] ?? []).find((r) => r.action === "approve")?.actor;
      expect(approver, c.id).toBe("Backup judge");
    }
  });

  it("reproduces Figma 60:2986 for Dana R.'s 4.02 lb catch", () => {
    const entries = timelineEntries(SAMPLE_CATCH_HISTORY["sample-1-catch-1"] ?? [], "weight");
    expect(entries.map((e) => [e.kind, e.meta])).toEqual([
      ["Corrected and approved", "Judge · Sat, Jul 10, 9:14 AM"],
      ["Photo added", "Angler · Sat, Jul 10, 8:05 AM"],
      ["Submitted", "Angler · Sat, Jul 10, 7:42 AM"],
    ]);
  });
});
