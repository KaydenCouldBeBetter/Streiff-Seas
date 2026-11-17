// JDG-02 Review catch: one catch in full for the judge, from the server. No DOM: the tests run
// loadReview against a real PocketBase.
//
// What the screen may do comes from the same facts the rule checks (security.md "catches"
// Update, the judge branch): the viewer's role in the event, the angler, the catch's status and
// the event's status. The rule is the real gate; this decides which row of screens.md to show:
// 02a pending, 02d decided, 02e retracted, 02f own catch, 02g outside the backup judge's scope,
// 02h final. The code word card follows decisions.md 2026-10-03 "Which code word a catch must
// show" and 2026-10-05 "Code word history is stored on the event" (JDG-02i).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { catchBaseOf, type CatchBase } from "./changeCatch";
import { photoSlotLabel } from "./catchForm";
import type { CatchAuditRow } from "./catchTimeline";
import { displayMeasurement } from "./displayWeight";
import { flagContextOf, roleIn, type JudgeRole, type QueueFlag } from "./judging";
import { flagLabel, flagSpoken, flagsOf, gapText } from "./flags";
import { formatClubClock, formatClubTime, formatClubTimeShort } from "./format";
import { parsePbDate } from "./liveBoard";
import { speciesLabel } from "./liveTournament";
import { actorOf, auditRows, photosOf, type Shaping } from "./loadMyCatches";
import type { DisplayUnits } from "./profile";
import type { Metric } from "./scoring";
import type { SpeciesChoice } from "./catchSender";

const DAY_MS = 24 * 3600_000;

export type ReviewRow = "JDG-02a" | "JDG-02d" | "JDG-02e" | "JDG-02f" | "JDG-02g" | "JDG-02h";

export interface ReviewPhoto {
  url?: string;
  /** "1 · Holding the fish", "2 · On the scale", "3 · Added later". */
  label: string;
  /** "Taken Sat, Jul 10, 6:02 AM", "No capture time". */
  note: string;
}

/** The code word card: one word, or both when it's unclear which applied (JDG-02i). */
export type CodeWordCheck =
  | { kind: "one"; word: string }
  | { kind: "both"; previous: string; current: string; changedAt: Date; explanation: string };

export interface ReviewData {
  base: CatchBase;
  row: ReviewRow;
  role: JudgeRole | null;
  metric: Metric;
  eventId: string;
  eventName: string;
  anglerName: string;
  entryWithdrawn: boolean;
  status: "pending" | "verified" | "rejected" | "retracted";
  reason: string;
  /** Verified or rejected: who decided and when ("Approved by the judge, Sat, Jul 10, 9:14 AM"). */
  decision?: { by: string; at: Date; corrected: boolean };
  species: string;
  speciesId: string;
  /** The event's species, for a correction (JDG-04a). */
  speciesChoices: SpeciesChoice[];
  measurement: { value: string; unit: string };
  created: Date;
  capturedAt: Date | null;
  /** "2 h", or null without a capture time. */
  photoToReceived: string | null;
  /** "Jul 4, 6:00 AM – Aug 15, 8:00 PM". */
  window: string;
  photos: ReviewPhoto[];
  flags: QueueFlag[];
  codeWord: CodeWordCheck | null;
  history: CatchAuditRow[];
}

/** May the viewer decide this catch now (JDG-02a, 02d)? */
export function canDecide(row: ReviewRow): boolean {
  return row === "JDG-02a" || row === "JDG-02d";
}

/** Which screens.md row the review is. Pure. */
export function reviewRow(input: { me: string; angler: string; judge: string; backupJudge: string; status: string; eventStatus: string }): ReviewRow {
  if (input.eventStatus === "final") return "JDG-02h";
  if (input.angler === input.me) return "JDG-02f";
  const scope = input.judge === input.me || (input.backupJudge === input.me && input.angler === input.judge);
  if (!scope) return "JDG-02g";
  if (input.status === "retracted") return "JDG-02e";
  return input.status === "pending" ? "JDG-02a" : "JDG-02d";
}

/** The code word the judge looks for in photo 1 or 2, or both when it's unclear. Pure. */
export function codeWordCheck(event: RecordModel, capturedAt: Date | null): CodeWordCheck | null {
  if (!event.code_word_on) return null;
  const current = String(event.code_word ?? "");
  const previous = String(event.code_word_prev ?? "");
  const changedRaw = String(event.code_word_changed_at ?? "");
  if (previous === "" || changedRaw === "") return { kind: "one", word: current };
  const changedAt = parsePbDate(changedRaw);
  if (!capturedAt) {
    return {
      kind: "both",
      previous,
      current,
      changedAt,
      explanation: `The word changed from ${previous} to ${current} at ${formatClubTime(changedAt)}, and photo 1 has no capture time. You decide which word applies.`,
    };
  }
  if (Math.abs(capturedAt.getTime() - changedAt.getTime()) < DAY_MS) {
    const before = capturedAt.getTime() < changedAt.getTime();
    return {
      kind: "both",
      previous,
      current,
      changedAt,
      explanation: `The word changed from ${previous} to ${current} at ${formatClubTime(changedAt)}, within 24 h of photo 1 (${formatClubClock(capturedAt)}). ${before ? previous : current} was in effect then; you decide if ${before ? current : previous} is fine.`,
    };
  }
  return { kind: "one", word: capturedAt.getTime() < changedAt.getTime() ? previous : current };
}

export interface ReviewRecords {
  me: string;
  units: DisplayUnits;
  /** The catch with expand entry.event and species. */
  record: RecordModel;
  /** The event, with expand species. */
  event: RecordModel;
  /** Every audit row of the catch the viewer can read, oldest first. */
  audit: readonly RecordModel[];
  photoUrl: (record: RecordModel, filename: string) => string;
}

/** The review from the records. Pure. */
export function reviewFromRecords(input: ReviewRecords): ReviewData {
  const { record, event, me, units } = input;
  const entry = record.expand?.entry as RecordModel | undefined;
  const angler = String(entry?.angler ?? "");
  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const choices = ((event.expand?.species as RecordModel[] | undefined) ?? [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((species) => ({ id: species.id, name: speciesLabel(String(species.name)) }));
  const speciesNames = new Map(choices.map((choice) => [choice.id, choice.name]));
  const expanded = record.expand?.species as RecordModel | undefined;
  if (expanded) speciesNames.set(expanded.id, speciesLabel(String(expanded.name)));
  const shaping: Shaping = { metric, units, species: speciesNames };
  const people = { me, angler, judge: String(event.judge ?? ""), backupJudge: String(event.backup_judge ?? "") };
  const history = auditRows(input.audit, people, shaping);

  const ctx = flagContextOf(record);
  const files = photosOf(record);
  // Photos past the ones sent with the catch were added later (they flag photo_added).
  const atSubmit = history.find((row) => row.action === "create")?.after.photos ?? files.length;
  const photos = files.map((name, i): ReviewPhoto => {
    const time = ctx.photoTimes[i] ?? null;
    const label = i < 2 ? photoSlotLabel(i + 1, metric) : `${i + 1} · ${i < atSubmit ? "Extra photo" : "Added later"}`;
    // How far a later photo is from photo 1, once that's an hour or more (extra_photo_far is 24 h).
    const gap = time && ctx.capturedAt && i > 0 ? time.getTime() - ctx.capturedAt.getTime() : 0;
    const far = Math.abs(gap) >= 3600_000 ? ` · ${gapText(gap)} ${gap > 0 ? "after" : "before"} photo 1` : "";
    return { url: input.photoUrl(record, name), label, note: time ? `Taken ${formatClubTime(time)}${far}` : "No capture time" };
  });

  const status = String(record.status) as ReviewData["status"];
  const decisionRow = input.audit.filter((row) => ["approve", "reject", "correct"].includes(String(row.action))).at(-1);
  const decidedBy = decisionRow ? actorOf(String(decisionRow.actor ?? ""), people) : null;

  return {
    base: catchBaseOf(record),
    row: reviewRow({ me, angler, judge: people.judge, backupJudge: people.backupJudge, status, eventStatus: String(event.status) }),
    role: roleIn(event, me),
    metric,
    eventId: event.id,
    eventName: String(event.name),
    anglerName: String(entry?.display_name ?? "") || "—",
    entryWithdrawn: entry?.withdrawn === true,
    status,
    reason: String(record.reason ?? ""),
    ...(decisionRow &&
      (status === "verified" || status === "rejected") && {
        decision: { by: decidedBy === "You" ? "you" : `the ${String(decidedBy).toLowerCase()}`, at: parsePbDate(String(decisionRow.created)), corrected: decisionRow.action === "correct" },
      }),
    species: speciesNames.get(String(record.species)) ?? "",
    speciesId: String(record.species ?? ""),
    speciesChoices: choices,
    measurement: displayMeasurement(metric, units, record),
    created: ctx.created,
    capturedAt: ctx.capturedAt,
    photoToReceived: ctx.capturedAt ? gapText(ctx.created.getTime() - ctx.capturedAt.getTime()) : null,
    window: `${formatClubTimeShort(parsePbDate(String(event.starts_at)))} – ${formatClubTimeShort(parsePbDate(String(event.ends_at)))}`,
    photos,
    flags: flagsOf(record.flags).map((code) => ({ label: flagLabel(code, ctx), spoken: flagSpoken(code, ctx) })),
    codeWord: codeWordCheck(event, ctx.capturedAt),
    history,
  };
}

/** Reads one catch for review as the signed-in judge, with its event, history and a file token. */
export async function loadReview(pb: PocketBase, catchId: string, me: string, units: DisplayUnits): Promise<ReviewData> {
  const record = await pb.collection("catches").getOne(catchId, { expand: "entry,species", requestKey: null });
  const entry = record.expand?.entry as RecordModel | undefined;
  const [event, audit, token] = await Promise.all([
    pb.collection("events").getOne(String(entry?.event ?? ""), { expand: "species", requestKey: null }),
    pb.collection("audit_log").getFullList({ filter: pb.filter("catch = {:id}", { id: catchId }), sort: "created", requestKey: null }),
    pb.files.getToken({ requestKey: null }),
  ]);
  return reviewFromRecords({ me, units, record, event, audit, photoUrl: (r, name) => pb.files.getURL(r, name, { token }) });
}
