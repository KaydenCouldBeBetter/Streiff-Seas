// The judge's decisions (JDG-02a Approve, JDG-03 Reject, JDG-04 Correct, JDG-05 Change decision)
// and what each outcome means for the screen. No DOM: the tests run them against a real
// PocketBase (test/judgeDecision.test.ts). Mirrors lib/changeCatch.ts, the angler's side.
//
// Every decision echoes the `rev` the review loaded (R-CAT-U-13): a catch the angler edited since
// is refused, reloaded and shown as JDG-02b with what changed. With no reply the screen shows NOT
// SENT (JDG-02j, 03b, 04b, 05c); Retry reloads first, and if the catch already shows the decision
// it says so and sends nothing (decisions.md 2026-10-05 "No reply on any change").

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { catchBaseOf, type CatchBase, type EditFields } from "./changeCatch";
import { failureKind } from "./sendCatch";

export type Decision =
  | { kind: "approve" }
  | { kind: "reject"; reason: string }
  /** JDG-04: a new species and/or measurement; saving approves at the corrected value. */
  | { kind: "correct"; fields: EditFields; reason: string }
  /** JDG-05: verified → rejected, or rejected → verified, with a reason either way. */
  | { kind: "rejudge"; to: "verified" | "rejected"; reason: string };

export type DecisionResult =
  | { kind: "saved" }
  | { kind: "already-saved" }
  | { kind: "not-sent" }
  /** The angler edited the catch since it was loaded (JDG-02b); `reloaded` is the catch now. */
  | { kind: "changed"; reloaded: CatchBase }
  /** The angler retracted it (JDG-02c). */
  | { kind: "retracted" }
  /** Someone else's decision landed first, or the event moved on: reload and look again. */
  | { kind: "refused"; reason: "decided" | "final" | "unknown" };

/** The request body: the loaded rev, and only what the decision changes. */
export function decisionBody(base: CatchBase, decision: Decision): Record<string, unknown> {
  switch (decision.kind) {
    case "approve":
      return { rev: base.rev, status: "verified" };
    case "reject":
      return { rev: base.rev, status: "rejected", reason: decision.reason.trim() };
    case "correct":
      return { rev: base.rev, ...decision.fields, reason: decision.reason.trim() };
    case "rejudge":
      return { rev: base.rev, status: decision.to, reason: decision.reason.trim() };
  }
}

/** The catch as a reload finds it, as the judge. */
export interface JudgeReloaded {
  base: CatchBase;
  status: string;
  judgedBy: string;
  reason: string;
  eventStatus: string;
}

export async function reloadForJudge(pb: PocketBase, id: string): Promise<JudgeReloaded> {
  const record: RecordModel = await pb.collection("catches").getOne(id, { expand: "entry.event", requestKey: null });
  const event = (record.expand?.entry as RecordModel | undefined)?.expand?.event as RecordModel | undefined;
  return {
    base: catchBaseOf(record),
    status: String(record.status),
    judgedBy: String(record.judged_by ?? ""),
    reason: String(record.reason ?? ""),
    eventStatus: String(event?.status ?? ""),
  };
}

/** True when the reloaded catch already shows this decision, made by `me` (a Retry after no reply). Pure. */
export function decisionLanded(decision: Decision, base: CatchBase, reloaded: JudgeReloaded, me: string): boolean {
  if (reloaded.base.rev <= base.rev || reloaded.judgedBy !== me) return false;
  switch (decision.kind) {
    case "approve":
      return reloaded.status === "verified";
    case "reject":
      return reloaded.status === "rejected" && reloaded.reason === decision.reason.trim();
    case "rejudge":
      return reloaded.status === decision.to && reloaded.reason === decision.reason.trim();
    case "correct": {
      const { fields } = decision;
      return (
        reloaded.status === "verified" &&
        (fields.species === undefined || fields.species === reloaded.base.speciesId) &&
        (fields.weight_hoz === undefined || fields.weight_hoz === reloaded.base.weightHoz) &&
        (fields.length_q === undefined || fields.length_q === reloaded.base.lengthQ)
      );
    }
  }
}

/** Why a decision was refused, from what the reload shows (screens.md Gap 16). Pure. */
export function refusalOf(base: CatchBase, reloaded: JudgeReloaded, wasStatus: string): DecisionResult {
  if (reloaded.status === "retracted") return { kind: "retracted" };
  if (reloaded.eventStatus === "final") return { kind: "refused", reason: "final" };
  if (reloaded.status !== wasStatus) return { kind: "refused", reason: "decided" };
  if (reloaded.base.rev !== base.rev) return { kind: "changed", reloaded: reloaded.base };
  return { kind: "refused", reason: "unknown" };
}

async function refused(pb: PocketBase, base: CatchBase, wasStatus: string): Promise<DecisionResult> {
  try {
    return refusalOf(base, await reloadForJudge(pb, base.id), wasStatus);
  } catch {
    return { kind: "refused", reason: "unknown" };
  }
}

/** Sends one decision with the loaded rev. `wasStatus` is the catch's status when it was loaded. */
export async function sendDecision(pb: PocketBase, base: CatchBase, wasStatus: string, decision: Decision): Promise<DecisionResult> {
  try {
    await pb.collection("catches").update(base.id, decisionBody(base, decision), { requestKey: null });
    return { kind: "saved" };
  } catch (error) {
    if (failureKind(error) === "not-sent") return { kind: "not-sent" };
    return refused(pb, base, wasStatus);
  }
}

/** Retry after NOT SENT: reload first; already there → already-saved and nothing is sent. */
export async function retryDecision(pb: PocketBase, base: CatchBase, wasStatus: string, decision: Decision, me: string): Promise<DecisionResult> {
  let reloaded: JudgeReloaded;
  try {
    reloaded = await reloadForJudge(pb, base.id);
  } catch (error) {
    return failureKind(error) === "not-sent" ? { kind: "not-sent" } : { kind: "refused", reason: "unknown" };
  }
  if (decisionLanded(decision, base, reloaded, me)) return { kind: "already-saved" };
  if (reloaded.base.rev !== base.rev) return refusalOf(base, reloaded, wasStatus);
  return sendDecision(pb, base, wasStatus, decision);
}
