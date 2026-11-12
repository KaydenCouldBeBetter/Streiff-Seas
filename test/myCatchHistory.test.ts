import { describe, expect, it } from "vitest";
import { historySubtitle, timelineEntries, type AuditSnapshot, type CatchAuditRow } from "../web/src/lib/catchTimeline";
import { SAMPLE_MY_CATCH_HISTORY } from "../web/src/lib/sampleMyCatchHistory";
import { SAMPLE_MY_CATCHES } from "../web/src/lib/sampleMyCatches";

function snap(overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return { species: "Largemouth bass", measurement: { value: "4.20", unit: "lb" }, status: "pending", reason: "", photos: 2, ...overrides };
}

const catchById = (id: string) => SAMPLE_MY_CATCHES.find((c) => c.id === id)!;
const historyOf = (id: string) => SAMPLE_MY_CATCH_HISTORY[id] ?? [];

// MY-06a, Figma 49:2287: the angler's own steps are "You", never "Angler" (screens.md MY-06a).
describe("the own-catch history on the MY-06a frame", () => {
  const entries = timelineEntries(historyOf("sample-corrected"), "weight");

  it("lists the four Figma items newest first, with You for the angler's own steps", () => {
    expect(entries.map((e) => [e.kind, e.tone, e.meta])).toEqual([
      ["Corrected and approved", "success", "Judge · Fri, Jul 9, 9:14 PM"],
      ["Photo added", "neutral", "You · Fri, Jul 9, 6:05 PM"],
      ["Edited", "neutral", "You · Fri, Jul 9, 5:20 PM"],
      ["Submitted", "neutral", "You · Fri, Jul 9, 5:15 PM"],
    ]);
  });

  it("shows what changed in each item", () => {
    expect(entries.map((e) => e.detail.map((line) => line.text))).toEqual([
      ["Weight 4.20 → 4.02 lb", "Reason: “Scale readout shows 4.02.”"],
      ["Photo 3 added"],
      ["Species Largemouth bass → Smallmouth bass"],
      ["4.20 lb · Largemouth bass · 2 photos"],
    ]);
  });

  it("reads the angler's own steps as done by you", () => {
    expect(entries[1]?.spoken).toBe("Photo added by you, Friday July 9, 6:05 PM. Photo 3 added.");
    expect(entries[3]?.spoken).toBe("Submitted by you, Friday July 9, 5:15 PM. 4.20 pounds, Largemouth bass, 2 photos.");
  });

  it("still names the judge as the judge", () => {
    expect(entries[0]?.spoken).toBe(
      "Corrected and approved by the judge, Friday July 9, 9:14 PM. Weight 4.20 to 4.02 pounds. Reason: Scale readout shows 4.02.",
    );
  });

  it("puts the subtitle line under the nav bar, as the Figma frame words it", () => {
    expect(historySubtitle(catchById("sample-corrected"))).toBe("4.02 lb Smallmouth bass · newest first");
  });
});

describe("timelineEntries with You", () => {
  it("calls a retraction by the angler Retracted, by you", () => {
    const row: CatchAuditRow = {
      id: "r",
      action: "retract",
      actor: "You",
      created: new Date("2027-07-08T23:41:00Z"),
      before: snap(),
      after: snap({ status: "retracted" }),
    };
    const [entry] = timelineEntries([row], "weight");
    expect(entry).toMatchObject({ kind: "Retracted", tone: "neutral", meta: "You · Thu, Jul 8, 7:41 PM", detail: [] });
    expect(entry?.spoken).toBe("Retracted by you, Thursday July 8, 7:41 PM.");
  });

  it("leaves LB-03's Angler wording alone", () => {
    const row: CatchAuditRow = { id: "c", action: "create", actor: "Angler", created: new Date("2027-07-10T11:42:00Z"), before: null, after: snap() };
    expect(timelineEntries([row], "weight")[0]?.spoken).toContain("Submitted by the angler,");
  });
});

describe("SAMPLE_MY_CATCH_HISTORY", () => {
  it("has a history for every sample catch, starting with its create row at the time MY-02 shows", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      const first = historyOf(c.id)[0];
      expect(first?.action, c.id).toBe("create");
      expect(first?.before, c.id).toBeNull();
      expect(first?.created, c.id).toEqual(c.created);
    }
  });

  it("ends where the catch stands now", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      const last = historyOf(c.id).at(-1)?.after;
      expect(last, c.id).toMatchObject({ species: c.species, measurement: c.measurement, status: c.status, photos: c.photos.length });
    }
  });

  it("is in time order, each row's before being its predecessor's after", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      historyOf(c.id).forEach((r, i, rows) => {
        if (i === 0) return;
        const prev = rows[i - 1]!;
        expect(r.created.getTime(), r.id).toBeGreaterThan(prev.created.getTime());
        expect(r.before, r.id).toEqual(prev.after);
      });
    }
  });

  it("labels only the angler's own steps You and never Angler", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      for (const r of historyOf(c.id)) {
        expect(r.actor, r.id).not.toBe("Angler");
        const own = r.action === "create" || r.action === "edit" || r.action === "retract";
        expect(r.actor === "You", r.id).toBe(own);
      }
    }
  });

  it("records each decision by the judge MY-02 names, at the time MY-02 shows", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      const decision = historyOf(c.id).find((r) => r.action === "approve" || r.action === "reject" || r.action === "correct");
      if (c.decision) {
        expect(decision?.actor, c.id).toBe(c.decision.by);
        expect(decision?.created, c.id).toEqual(c.decision.at);
      } else {
        expect(decision, c.id).toBeUndefined();
      }
    }
  });

  it("shows a rejection with its reason, a retraction at the time MY-02 shows, and a correction on the corrected catch only", () => {
    const rejected = timelineEntries(historyOf("sample-rejected"), "weight")[0];
    expect(rejected).toMatchObject({ kind: "Rejected", tone: "danger", meta: "Judge · Fri, Jul 9, 9:02 AM" });
    expect(rejected?.detail.map((l) => l.text)).toEqual(["Reason: “Readout not legible.”"]);

    const retracted = timelineEntries(historyOf("sample-retracted"), "weight")[0];
    expect(retracted).toMatchObject({ kind: "Retracted", meta: "You · Thu, Jul 8, 7:41 PM" });

    for (const c of SAMPLE_MY_CATCHES) {
      const corrected = historyOf(c.id).some((r) => r.action === "correct");
      expect(corrected, c.id).toBe(c.correction !== undefined);
    }
  });

  it("only lets the angler change a catch while it is pending (R-CAT-U-18)", () => {
    for (const c of SAMPLE_MY_CATCHES) {
      for (const r of historyOf(c.id)) {
        if (r.action === "edit") expect(r.before?.status, r.id).toBe("pending");
      }
    }
  });

  it("has the corrected catch's one line agree with MY-02's banner", () => {
    const corrected = catchById("sample-corrected");
    const line = timelineEntries(historyOf(corrected.id), "weight")[0]?.detail[0]?.text;
    expect(line).toBe(corrected.correction?.change);
  });
});
