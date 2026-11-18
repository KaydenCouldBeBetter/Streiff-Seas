// ORG-01a Manage tournament: draft (web/src/lib/eventAdmin.ts draftAction). A draft saved
// incomplete (Gap 11) must lead back to the form (ORG-02b), never to a disabled button (P11).
// Found on prod 2026-11-18: a draft with no backup judge showed "Fix these to open", disabled, and
// nothing on the screen opened the form. Pure; no PocketBase.

import type { RecordModel } from "pocketbase";
import { describe, expect, it } from "vitest";
import { draftAction, manageFromRecords } from "../web/src/lib/eventAdmin";

const rec = (collectionName: string, fields: Record<string, unknown>) => ({ collectionId: "", collectionName, ...fields }) as RecordModel;

const complete = {
  id: "ev",
  name: "Summer Bass 2027",
  status: "draft",
  starts_at: "2027-07-04 10:00:00.000Z",
  ends_at: "2027-08-16 00:00:00.000Z",
  submit_deadline: "2027-08-17 00:00:00.000Z",
  metric: "weight",
  best_n: 10,
  species: ["s1"],
  judge: "k",
  backup_judge: "n",
  code_word_on: false,
  code_word: "",
};

const manage = (fields: Record<string, unknown> = {}) =>
  manageFromRecords({
    me: "k",
    nowMs: Date.UTC(2027, 0, 1),
    event: rec("events", { ...complete, ...fields }),
    entries: [],
    pending: [],
    users: [rec("users", { id: "k", name: "Kayden", role: "organizer" }), rec("users", { id: "n", name: "Nate", role: "member" })],
    species: [rec("species", { id: "s1", name: "largemouth bass" })],
  });

describe("ORG-01a: the draft's action bar", () => {
  it("a draft with no backup judge (as found on prod) offers Finish the draft, which opens the form", () => {
    const stuck = manage({ backup_judge: "" });
    expect(stuck).toMatchObject({ phase: "draft", canOpen: false });
    expect(stuck.checklist.filter((item) => !item.done).map((item) => item.id)).toEqual(["backup_judge"]);
    expect(draftAction(stuck)).toEqual({ kind: "edit", label: "Finish the draft" });
  });

  it("every unmet checklist item leads to the form", () => {
    for (const fields of [{ ends_at: complete.starts_at }, { species: [] }, { backup_judge: "k" }, { code_word_on: true, code_word: " " }]) {
      expect(draftAction(manage(fields))).toEqual({ kind: "edit", label: "Finish the draft" });
    }
  });

  it("a draft with the checklist met offers Open", () => {
    expect(draftAction(manage())).toEqual({ kind: "open", label: "Open tournament" });
  });

  it("no draft action once the tournament isn't a draft", () => {
    for (const status of ["live", "closed", "final"]) expect(draftAction(manage({ status }))).toBeNull();
  });
});
