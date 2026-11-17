// The Judge tab (S3): the Judging home (JDG-00a, 00b) and one tournament's queue (JDG-01a to 01g),
// from the server. No DOM: the tests run the loaders against a real PocketBase.
//
// Who judges what (security.md "catches" Update, the judge branch; scoring.md §7): the event's
// judge decides every catch but their own; its backup judge decides only the judge's catches.
// The queue lists exactly those, in live and closed events. Retracted catches never appear
// (decisions.md 2026-10-03 "Judge queue filters"); a catch on a withdrawn entry does, marked, since
// it is still judged (scoring.md §3). Reads: the events list (R-EVT-L-02), the catches list
// (R-CAT-L-05, L-06) and the audit rows of those catches (R-AUD-L-04, L-05) for when each was
// decided. Names come from each entry's display_name: the backup judge can't read `users`.

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { displayMeasurement } from "./displayWeight";
import { flagLabel, flagSpoken, flagsOf, receiptGap, type FlagContext } from "./flags";
import { formatClubTime } from "./format";
import { parsePbDate } from "./liveBoard";
import { speciesLabel } from "./liveTournament";
import type { DisplayUnits } from "./profile";
import type { Metric } from "./scoring";

export type JudgeRole = "Judge" | "Backup judge";
export type QueueFilter = "pending" | "verified" | "rejected";

export interface QueueFlag {
  label: string;
  spoken: string;
}

export interface QueueItem {
  id: string;
  /** The angler's display_name. */
  name: string;
  /** "3.80 lb · Smallmouth · 3 photos". */
  summary: string;
  /** "Received Sat, Jul 10, 8:10 AM · 2 h after photo". */
  received: string;
  flags: QueueFlag[];
  status: "pending" | "verified" | "rejected";
  entryWithdrawn: boolean;
  /** Verified and Rejected filters: when the latest decision was made, and whether it was a correction. */
  decidedAt?: Date;
  corrected: boolean;
  /** Rejected: the judge's reason. */
  reason?: string;
  /** Photo 1, with the file token; undefined when there's no token yet. */
  thumbnailUrl?: string;
  created: Date;
}

export interface QueueData {
  eventId: string;
  eventName: string;
  eventStatus: "live" | "closed" | "final" | "draft";
  role: JudgeRole | null;
  metric: Metric;
  /** Pending oldest first; Verified and Rejected most recently decided first (decisions.md 2026-10-03). */
  lists: Record<QueueFilter, QueueItem[]>;
}

export interface JudgingSection {
  eventId: string;
  name: string;
  status: "live" | "closed";
  role: JudgeRole;
  pending: number;
  /** The three oldest pending catches (JDG-00a). */
  oldest: QueueItem[];
}

/** The viewer's role in an event, or null when they judge nothing there. */
export function roleIn(event: RecordModel, me: string): JudgeRole | null {
  if (event.judge === me) return "Judge";
  if (event.backup_judge === me) return "Backup judge";
  return null;
}

/** Whether `me` may decide a catch by `angler` in `event` (the rule's judge branch, scope only). */
export function inScope(event: RecordModel, angler: string, me: string): boolean {
  if (angler === me) return false;
  if (event.judge === me) return true;
  return event.backup_judge === me && angler === event.judge;
}

function statusOf(value: unknown): QueueData["eventStatus"] {
  return value === "closed" || value === "final" || value === "draft" ? value : "live";
}

export function flagContextOf(record: RecordModel): FlagContext {
  const captured = String(record.captured_at ?? "");
  const times = Array.isArray(record.photo_captured_at) ? record.photo_captured_at : [];
  return {
    capturedAt: captured === "" ? null : parsePbDate(captured),
    created: parsePbDate(String(record.created)),
    photoTimes: times.map((time: unknown) => (typeof time === "string" && time !== "" ? parsePbDate(time) : null)),
  };
}

export interface QueueShaping {
  metric: Metric;
  units: DisplayUnits;
  /** The audit rows of the event's catches that record a decision, any order. */
  decisions: readonly RecordModel[];
  photoUrl?: (record: RecordModel, filename: string) => string;
}

/** One catch as a queue card. Pure. */
export function queueItemOf(record: RecordModel, shaping: QueueShaping): QueueItem {
  const entry = record.expand?.entry as RecordModel | undefined;
  const species = record.expand?.species as RecordModel | undefined;
  const photos = Array.isArray(record.photo) ? record.photo.map(String) : [];
  const { value, unit } = displayMeasurement(shaping.metric, shaping.units, record);
  const ctx = flagContextOf(record);
  const rows = shaping.decisions.filter((row) => row.catch === record.id).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  const latest = rows.at(-1);
  const status = String(record.status) as QueueItem["status"];
  const reason = String(record.reason ?? "");
  const speciesName = species ? speciesLabel(String(species.name)).replace(/ bass$/, "") : "";
  return {
    id: record.id,
    name: String(entry?.display_name ?? "") || "—",
    summary: [`${value} ${unit}`, speciesName, `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`].filter(Boolean).join(" · "),
    received: `Received ${formatClubTime(ctx.created)} · ${receiptGap(ctx.capturedAt, ctx.created)}`,
    flags: flagsOf(record.flags).map((code) => ({ label: flagLabel(code, ctx), spoken: flagSpoken(code, ctx) })),
    status,
    entryWithdrawn: entry?.withdrawn === true,
    ...(latest && status !== "pending" && { decidedAt: parsePbDate(String(latest.created)) }),
    corrected: status === "verified" && latest?.action === "correct",
    ...(status === "rejected" && reason !== "" && { reason }),
    ...(shaping.photoUrl && photos[0] && { thumbnailUrl: shaping.photoUrl(record, photos[0]) }),
    created: ctx.created,
  };
}

/** Splits the event's catches into the three filters, in their orders. Pure. */
export function queueLists(event: RecordModel, catches: readonly RecordModel[], me: string, shaping: QueueShaping): Record<QueueFilter, QueueItem[]> {
  const items = catches
    .filter((record) => {
      const angler = String((record.expand?.entry as RecordModel | undefined)?.angler ?? "");
      return record.status !== "retracted" && inScope(event, angler, me);
    })
    .map((record) => queueItemOf(record, shaping));
  const decided = (a: QueueItem, b: QueueItem) => (b.decidedAt?.getTime() ?? b.created.getTime()) - (a.decidedAt?.getTime() ?? a.created.getTime());
  return {
    pending: items.filter((item) => item.status === "pending").sort((a, b) => a.created.getTime() - b.created.getTime() || (a.id < b.id ? -1 : 1)),
    verified: items.filter((item) => item.status === "verified").sort(decided),
    rejected: items.filter((item) => item.status === "rejected").sort(decided),
  };
}

/** The catches of one event that the viewer may read, with entry and species. */
function readCatches(pb: PocketBase, eventId: string): Promise<RecordModel[]> {
  return pb.collection("catches").getFullList({
    filter: pb.filter('entry.event = {:event} && status != "retracted"', { event: eventId }),
    expand: "entry,species",
    sort: "created",
    requestKey: null,
  });
}

function readDecisions(pb: PocketBase, eventId: string): Promise<RecordModel[]> {
  return pb.collection("audit_log").getFullList({
    filter: pb.filter('event = {:event} && catch != "" && (action = "approve" || action = "reject" || action = "correct")', { event: eventId }),
    fields: "id,catch,action,created",
    requestKey: null,
  });
}

/** One tournament's queue as the viewer sees it, every filter at once; live through useLive. */
export async function loadQueue(pb: PocketBase, eventId: string, me: string, units: DisplayUnits): Promise<QueueData> {
  const [event, catches, decisions] = await Promise.all([
    pb.collection("events").getOne(eventId, { requestKey: null }),
    readCatches(pb, eventId),
    readDecisions(pb, eventId),
  ]);
  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const token = catches.length > 0 ? await pb.files.getToken({ requestKey: null }) : "";
  return {
    eventId,
    eventName: String(event.name),
    eventStatus: statusOf(event.status),
    role: roleIn(event, me),
    metric,
    lists: queueLists(event, catches, me, { metric, units, decisions, photoUrl: (record, name) => pb.files.getURL(record, name, { token }) }),
  };
}

/** The events the viewer judges or backup-judges, live and closed only (JDG-00a; screens.md §0 Tabs). */
export function readJudgedEvents(pb: PocketBase, me: string): Promise<RecordModel[]> {
  return pb.collection("events").getFullList({
    filter: pb.filter('(status = "live" || status = "closed") && (judge = {:me} || backup_judge = {:me})', { me }),
    sort: "starts_at,name",
    requestKey: null,
  });
}

/** Whether the Judge tab shows: the viewer judges or backup-judges a live or closed tournament. */
export async function judgesAny(pb: PocketBase, me: string): Promise<boolean> {
  return (await readJudgedEvents(pb, me)).length > 0;
}

/** The Judging home: one section per tournament, stacked; refreshed on open and on focus (Gap 25). */
export async function loadJudging(pb: PocketBase, me: string, units: DisplayUnits): Promise<JudgingSection[]> {
  const events = await readJudgedEvents(pb, me);
  const sections = await Promise.all(
    events.map(async (event): Promise<JudgingSection> => {
      const queue = await loadQueue(pb, event.id, me, units);
      return {
        eventId: event.id,
        name: String(event.name),
        status: event.status === "closed" ? "closed" : "live",
        role: roleIn(event, me) ?? "Judge",
        pending: queue.lists.pending.length,
        oldest: queue.lists.pending.slice(0, 3),
      };
    }),
  );
  return sections;
}
