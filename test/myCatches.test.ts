import { describe, expect, it } from "vitest";
import {
  myCatchesRow,
  myCatchesSubtitle,
  myCatchState,
  newestFirst,
  photoLabels,
  submittingOpen,
  type EventPhase,
  type MyCatchesContext,
  type MyCatchView,
} from "../web/src/lib/myCatches";
import { SAMPLE_MY_CATCHES, SAMPLE_MY_CATCHES_CONTEXT } from "../web/src/lib/sampleMyCatches";

const LIVE: MyCatchesContext = SAMPLE_MY_CATCHES_CONTEXT;

function at(phase: EventPhase, entry: MyCatchesContext["entry"] = "active"): MyCatchesContext {
  return { ...LIVE, phase, entry };
}

function aCatch(overrides: Partial<MyCatchView>): MyCatchView {
  return {
    id: "c1",
    species: "Largemouth bass",
    measurement: { value: "3.44", unit: "lb" },
    status: "pending",
    created: new Date("2027-07-11T10:20:00Z"),
    photos: [{}, {}],
    inBest: false,
    ...overrides,
  };
}

describe("submittingOpen (EVT-02d and EVT-02e states only)", () => {
  it("is open in the window and the late period with an active entry", () => {
    expect(submittingOpen(at("live:window"))).toBe(true);
    expect(submittingOpen(at("live:late"))).toBe(true);
  });

  it("is closed before the window, after the deadline, once closed or final, and when withdrawn", () => {
    for (const phase of ["live:pre", "live:over", "closed", "final"] as const) expect(submittingOpen(at(phase))).toBe(false);
    expect(submittingOpen(at("live:window", "withdrawn-self"))).toBe(false);
    expect(submittingOpen(at("live:window", "withdrawn-by-K"))).toBe(false);
  });
});

describe("myCatchesRow", () => {
  it("is MY-01a with no catches, in any state", () => {
    expect(myCatchesRow(at("live:window"), 0)).toBe("MY-01a");
    expect(myCatchesRow(at("final"), 0)).toBe("MY-01a");
  });

  it("is MY-01b while live or closed and MY-01c once final", () => {
    expect(myCatchesRow(at("live:window"), 3)).toBe("MY-01b");
    expect(myCatchesRow(at("closed"), 3)).toBe("MY-01b");
    expect(myCatchesRow(at("final"), 3)).toBe("MY-01c");
  });
});

describe("newestFirst", () => {
  it("orders by created, newest first, without changing the input", () => {
    const older = aCatch({ id: "older", created: new Date("2027-07-06T13:44:00Z") });
    const newer = aCatch({ id: "newer", created: new Date("2027-07-11T10:20:00Z") });
    const input = [older, newer];
    expect(newestFirst(input).map((c) => c.id)).toEqual(["newer", "older"]);
    expect(input.map((c) => c.id)).toEqual(["older", "newer"]);
  });
});

describe("myCatchesSubtitle", () => {
  it("counts every catch and the verified ones in the best n (Figma MY-01b)", () => {
    expect(myCatchesSubtitle(LIVE, SAMPLE_MY_CATCHES)).toBe("Summer Bass 2027 · 6 catches · 3 counted");
  });

  it("is the event's name alone when there's nothing yet (Figma MY-01a)", () => {
    expect(myCatchesSubtitle(LIVE, [])).toBe("Summer Bass 2027");
  });

  it("says catch for one", () => {
    expect(myCatchesSubtitle(LIVE, [aCatch({})])).toBe("Summer Bass 2027 · 1 catch · 0 counted");
  });
});

describe("myCatchState", () => {
  it("MY-02a: pending, editable, fewer than 4 photos: edit, add photos and retract", () => {
    const state = myCatchState(aCatch({ photos: [{}, {}, {}] }), at("live:late"));
    expect(state).toMatchObject({ row: "MY-02a", canEdit: true, canAddPhotos: true, canRetract: true, canSubmitNew: false, photosArchived: false });
  });

  it("MY-02b: pending with 4 photos: edit and retract, no more photos (R-CAT-U-27)", () => {
    const state = myCatchState(aCatch({ photos: [{}, {}, {}, {}] }), at("live:window"));
    expect(state).toMatchObject({ row: "MY-02b", canEdit: true, canAddPhotos: false, canRetract: true });
  });

  it("MY-02c: pending past the deadline or once closed: nothing to change (R-CAT-U-19, U-30)", () => {
    for (const phase of ["live:over", "closed"] as const) {
      expect(myCatchState(aCatch({}), at(phase))).toMatchObject({ row: "MY-02c", canEdit: false, canAddPhotos: false, canRetract: false });
    }
  });

  it("MY-02d: pending with the entry withdrawn, either way: nothing to change (R-CAT-U-23)", () => {
    for (const entry of ["withdrawn-self", "withdrawn-by-K"] as const) {
      expect(myCatchState(aCatch({}), at("live:window", entry))).toMatchObject({ row: "MY-02d", canEdit: false, canRetract: false });
    }
  });

  it("MY-02e and MY-02f: verified, corrected when a correct row exists; never changeable (R-CAT-U-18)", () => {
    const verified = aCatch({ status: "verified" });
    expect(myCatchState(verified, LIVE)).toMatchObject({ row: "MY-02e", canEdit: false, canAddPhotos: false, canRetract: false });
    const corrected = aCatch({ status: "verified", correction: { change: "Weight 4.20 → 4.02 lb" } });
    expect(myCatchState(corrected, LIVE).row).toBe("MY-02f");
  });

  it("MY-02g: rejected offers Submit a new catch only while submitting is open", () => {
    const rejected = aCatch({ status: "rejected", reason: "Readout not legible." });
    expect(myCatchState(rejected, at("live:window"))).toMatchObject({ row: "MY-02g", canSubmitNew: true, canEdit: false, canRetract: false });
    expect(myCatchState(rejected, at("live:over")).canSubmitNew).toBe(false);
    expect(myCatchState(rejected, at("live:window", "withdrawn-self")).canSubmitNew).toBe(false);
  });

  it("MY-02h: retracted: no un-retract and no edit (R-CAT-U-32, U-18)", () => {
    expect(myCatchState(aCatch({ status: "retracted" }), LIVE)).toMatchObject({ row: "MY-02h", canEdit: false, canRetract: false, canSubmitNew: false });
  });

  it("MY-02i: final keeps the matching status row, archives photos and allows nothing (R-CAT-U-12)", () => {
    const state = myCatchState(aCatch({ status: "verified" }), at("final"));
    expect(state).toEqual({
      row: "MY-02i",
      statusRow: "MY-02e",
      canEdit: false,
      canAddPhotos: false,
      canRetract: false,
      canSubmitNew: false,
      photosArchived: true,
    });
    expect(myCatchState(aCatch({ status: "rejected", reason: "x" }), at("final")).statusRow).toBe("MY-02g");
  });
});

describe("photoLabels", () => {
  it("names the holding and scale photos, then one Extra or numbered extras (Figma MY-02)", () => {
    expect(photoLabels(1).map((l) => l.long)).toEqual(["Holding the fish"]);
    expect(photoLabels(2).map((l) => l.short)).toEqual(["Holding", "On the scale"]);
    expect(photoLabels(3).map((l) => l.short)).toEqual(["Holding", "On the scale", "Extra"]);
    expect(photoLabels(4).map((l) => l.short)).toEqual(["Holding", "On the scale", "Extra 1", "Extra 2"]);
  });
});

describe("the sample data", () => {
  it("covers one catch for each status row the live sample can reach", () => {
    const rows = SAMPLE_MY_CATCHES.map((c) => myCatchState(c, LIVE).row);
    expect(new Set(rows)).toEqual(new Set(["MY-02a", "MY-02e", "MY-02f", "MY-02g", "MY-02h"]));
  });
});
