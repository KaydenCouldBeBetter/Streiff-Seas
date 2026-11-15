// My catches (MY-01), My catch (MY-02) and Catch history (MY-06a) from the server: the member's
// own catches in the live tournament, newest first, and every audit row of them. No DOM: the
// tests run it against a real PocketBase (test/loadMyCatches.test.ts).
//
// Reads: the catches list rule's angler branch (R-CAT-L-04, L-11, L-12), the audit_log list rule
// (R-AUD-L-02, L-09) and a file token for the protected photos (R-CAT-F-01). `inBest` comes from
// scoring.ts; nothing here scores. Actors are labelled by comparing IDs with the event's judge
// and backup judge, since members can't read `users` (screens.md Gap 13). The list is read when
// My catches opens and when the app comes back to the foreground; it is not live (Gap 25).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { changeSummary, type AuditAction, type AuditActor, type AuditSnapshot, type CatchAuditRow } from "./catchTimeline";
import { displayMeasurement } from "./displayWeight";
import { parsePbDate } from "./liveBoard";
import { speciesLabel, type LiveTournament } from "./liveTournament";
import type { CatchStatus, EntryState, EventPhase, MyCatchesContext, MyCatchView } from "./myCatches";
import type { DisplayUnits } from "./profile";
import { computeStandings } from "./scoring";

export interface MyCatchesData {
  context: MyCatchesContext;
  /** Newest first. */
  catches: MyCatchView[];
  /** Each catch's audit rows, oldest first, by catch id. */
  history: Record<string, CatchAuditRow[]>;
}

/** Who the IDs on a catch's audit rows belong to. */
export interface People {
  me: string;
  judge: string;
  backupJudge: string;
}

const CATCH_ACTIONS: readonly string[] = ["create", "edit", "retract", "approve", "reject", "correct"] satisfies AuditAction[];
const DECISIONS: readonly AuditAction[] = ["approve", "reject", "correct"];

/** screens.md §1 for a live event: before the window, in it, after it until submit_deadline, then over. */
export function myCatchesPhase(tournament: LiveTournament, nowMs: number): EventPhase {
  if (nowMs < tournament.startsAt.getTime()) return "live:pre";
  if (nowMs <= tournament.submit.endsAt.getTime()) return "live:window";
  if (nowMs <= tournament.submit.submitDeadline.getTime()) return "live:late";
  return "live:over";
}

function entryStateOf(tournament: LiveTournament): EntryState {
  const { entry } = tournament;
  if (entry.kind === "none") return "none";
  if (entry.kind === "active") return "active";
  return entry.bySelf ? "withdrawn-self" : "withdrawn-by-K";
}

export function myCatchesContext(tournament: LiveTournament, nowMs: number): MyCatchesContext {
  return {
    eventName: tournament.submit.name,
    metric: tournament.submit.metric,
    bestN: tournament.bestN,
    phase: myCatchesPhase(tournament, nowMs),
    entry: entryStateOf(tournament),
    submitDeadline: tournament.submit.submitDeadline,
  };
}

/** "You" for the viewer's own steps; empty (a superuser action) and anyone else read "Organizer". */
export function actorOf(id: string, people: People): AuditActor {
  if (id === "") return "Organizer";
  if (id === people.me) return "You";
  if (id === people.judge) return "Judge";
  if (id === people.backupJudge) return "Backup judge";
  return "Organizer";
}

function photosOf(record: Readonly<Record<string, unknown>>): string[] {
  return Array.isArray(record.photo) ? record.photo.map(String) : [];
}

interface Shaping {
  metric: "weight" | "length";
  units: DisplayUnits;
  /** Species id → label ("Largemouth bass"). */
  species: ReadonlyMap<string, string>;
}

/** An audit snapshot (security.md "Audit snapshots") shaped for the timeline; null when empty. */
function snapshotOf(value: unknown, shaping: Shaping): AuditSnapshot | null {
  if (value === null || typeof value !== "object" || Object.keys(value).length === 0) return null;
  const s = value as Record<string, unknown>;
  return {
    species: shaping.species.get(String(s.species ?? "")) ?? "",
    measurement: displayMeasurement(shaping.metric, shaping.units, s),
    status: String(s.status ?? "") as CatchStatus,
    reason: String(s.reason ?? ""),
    photos: photosOf(s).length,
  };
}

/** The catch rows of one audit list, oldest first, shaped for the timeline. Event and entry rows are skipped. */
export function auditRows(records: readonly RecordModel[], people: People, shaping: Shaping): CatchAuditRow[] {
  const rows: CatchAuditRow[] = [];
  for (const record of records) {
    const after = snapshotOf(record.after, shaping);
    if (!CATCH_ACTIONS.includes(String(record.action)) || after === null) continue;
    rows.push({
      id: record.id,
      action: record.action as AuditAction,
      actor: actorOf(String(record.actor ?? ""), people),
      created: parsePbDate(String(record.created)),
      before: snapshotOf(record.before, shaping),
      after,
    });
  }
  return rows;
}

export interface MyCatchRecords {
  tournament: LiveTournament;
  nowMs: number;
  units: DisplayUnits;
  people: People;
  /** The member's catches in the event, newest first, with `expand.species`. */
  catches: readonly RecordModel[];
  /** Every audit row of those catches, oldest first. */
  audit: readonly RecordModel[];
  /** The photo URL for one file, already carrying the file token. */
  photoUrl: (record: RecordModel, filename: string) => string;
}

/** The screens' view model from the records the member can read. Pure. */
export function myCatchesFromRecords(input: MyCatchRecords): MyCatchesData {
  const { tournament, units, people } = input;
  const context = myCatchesContext(tournament, input.nowMs);
  const metric = context.metric;

  const species = new Map<string, string>(tournament.submit.species.map((choice) => [choice.id, choice.name]));
  for (const record of input.catches) {
    const expanded = record.expand?.species as RecordModel | undefined;
    if (expanded) species.set(expanded.id, speciesLabel(String(expanded.name)));
  }
  const shaping: Shaping = { metric, units, species };

  const history: Record<string, CatchAuditRow[]> = {};
  const byCatch = new Map<string, RecordModel[]>();
  for (const record of input.audit) {
    const list = byCatch.get(String(record.catch)) ?? [];
    list.push(record);
    byCatch.set(String(record.catch), list);
  }

  // Scoring decides which verified catches count; a withdrawn entry counts none (scoring.md §3).
  const entryId = tournament.entry.kind === "none" ? "" : tournament.entry.id;
  const withdrawn = tournament.entry.kind === "withdrawn";
  const standing = computeStandings(
    metric,
    [{ id: entryId, withdrawn }],
    input.catches.map((record) => ({
      id: record.id,
      entry: entryId,
      status: record.status as CatchStatus,
      ...(metric === "length" ? { length_q: Number(record.length_q) } : { weight_hoz: Number(record.weight_hoz) }),
    })),
  )[0];
  const counted = new Set(standing?.countedIds ?? []);

  const catches = input.catches.map((record): MyCatchView => {
    const rows = auditRows(byCatch.get(record.id) ?? [], people, shaping);
    history[record.id] = rows;
    const decision = rows.filter((row) => DECISIONS.includes(row.action)).at(-1);
    const correction = rows.filter((row) => row.action === "correct").at(-1);
    const retract = rows.filter((row) => row.action === "retract").at(-1);
    const capturedAt = String(record.captured_at ?? "");
    const reason = String(record.reason ?? "");
    const expanded = record.expand?.species as RecordModel | undefined;
    return {
      id: record.id,
      species: species.get(String(record.species)) ?? (expanded ? speciesLabel(String(expanded.name)) : ""),
      measurement: displayMeasurement(metric, units, record),
      status: record.status as CatchStatus,
      created: parsePbDate(String(record.created)),
      ...(capturedAt !== "" && { capturedAt: parsePbDate(capturedAt) }),
      photos: photosOf(record).map((name) => ({ url: input.photoUrl(record, name) })),
      ...(reason !== "" && { reason }),
      inBest: counted.has(record.id),
      ...(decision && { decision: { by: decision.actor === "Backup judge" ? "Backup judge" : "Judge", at: decision.created } }),
      ...(correction?.before && { correction: { change: changeSummary(correction.before, correction.after, metric) } }),
      ...(retract && { retractedAt: retract.created }),
    };
  });

  return { context, catches, history };
}

/**
 * Reads the member's catches in the live tournament, their audit rows and a file token.
 * Nothing to read before joining. Requests are never auto-cancelled: a refresh that overlaps
 * the last one must not turn it into an error.
 */
export async function loadMyCatches(pb: PocketBase, tournament: LiveTournament, userId: string, units: DisplayUnits, nowMs: number): Promise<MyCatchesData> {
  const people = { me: userId, judge: "", backupJudge: "" };
  if (tournament.entry.kind === "none") {
    return myCatchesFromRecords({ tournament, nowMs, units, people, catches: [], audit: [], photoUrl: () => "" });
  }
  const entry = tournament.entry.id;
  const [event, catches, audit] = await Promise.all([
    pb.collection("events").getOne(tournament.submit.eventId, { fields: "id,judge,backup_judge", requestKey: null }),
    pb.collection("catches").getFullList({ filter: pb.filter("entry = {:entry}", { entry }), sort: "-created", expand: "species", requestKey: null }),
    pb.collection("audit_log").getFullList({ filter: pb.filter("catch.entry = {:entry}", { entry }), sort: "created", requestKey: null }),
  ]);
  const token = catches.some((record) => photosOf(record).length > 0) ? await pb.files.getToken({ requestKey: null }) : "";
  return myCatchesFromRecords({
    tournament,
    nowMs,
    units,
    people: { me: userId, judge: String(event.judge ?? ""), backupJudge: String(event.backup_judge ?? "") },
    catches,
    audit,
    photoUrl: (record, filename) => pb.files.getURL(record, filename, { token }),
  });
}
