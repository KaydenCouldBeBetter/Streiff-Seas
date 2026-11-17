// LB-01 Leaderboard from the server (features.json S2b): one tournament's standings, worked out in
// the browser by scoring.ts from the entries and catches the viewer can read, and shaped in the
// viewer's display units. No DOM: the tests run loadLeaderboard against a real PocketBase.
//
// Reads: the event (R-EVT-L-02), its entries (R-ENT-L-02, L-03) and its catches with their species
// (R-CAT-L-02, L-07, L-10). Judges, the organizer and a withdrawn viewer can read more than
// members (rejected, retracted, withdrawn), and scoring leaves all of it out, so every viewer sees
// the same board (screens.md LB-01a). The judge and backup judge are tagged by comparing IDs with
// the event's, since members can't read `users` (decisions.md 2026-10-03, Gap 13). Names are each
// entry's `display_name`, which the users hook keeps in step with renames until the event is final
// (R-USR-U-06). Display units change only the words, never a total or a place (R-USR-U-01).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { displayMeasurement } from "./displayWeight";
import { parsePbDate } from "./liveBoard";
import type { DisplayUnits } from "./profile";
import { computeStandings, type CatchStatus, type Metric, type Standing } from "./scoring";

export interface LeaderboardRow {
  /** The entry's id; the row opens that angler's catches (LB-02). */
  entryId: string;
  place: number;
  /** A shared place: shown "T-2", and the next place is skipped. */
  tied: boolean;
  displayName: string;
  /** Judge and backup judge are named on their rows (decisions.md 2026-10-03). */
  role?: "Judge" | "Backup judge";
  /** The signed-in member's own row: tint, left bar and "(you)", never color alone. */
  isViewer: boolean;
  /** Already rounded for display in the viewer's units (scoring.md: display rounding). */
  total: string;
  /** Verified fish that count toward the total, of the event's best_n. */
  counted: number;
  biggest: { size: string; species: string } | null;
  pending: number;
}

export interface LeaderboardView {
  name: string;
  /** "Weight · best 10 · Week 3 of 6 · 14 anglers". */
  subtitle: string;
  /** The unit after every total and biggest fish: "lb", "oz" (after "27 lb 2.4") or "in". */
  unit: string;
  bestN: number;
  /** The viewer's row, for the "Your place" card; null when they have no row (LB-01e). */
  you: LeaderboardRow | null;
  rows: LeaderboardRow[];
}

export type EventStatus = "draft" | "live" | "closed" | "final";

export interface LeaderboardData {
  eventId: string;
  /** events.status: a final board shows no realtime badge (Gap 25). */
  status: EventStatus;
  metric: Metric;
  view: LeaderboardView;
  /** The viewer's own catches in the event that the Tournament page counts (EVT-02d). */
  mine: { submitted: number; pending: number; rejected: number };
}

export interface LeaderboardRecords {
  event: RecordModel;
  /** The event's entries the viewer can read. */
  entries: readonly RecordModel[];
  /** The event's catches the viewer can read, with `expand.species`. */
  catches: readonly RecordModel[];
  viewerId: string;
  units: DisplayUnits;
  /** The server's time now (serverClock), for the week in the subtitle. */
  nowMs: number;
}

const WEEK_MS = 7 * 24 * 3600_000;

/** "largemouth bass" → "Largemouth", "walleye" → "Walleye": the board's short species name (Figma LB-01a). */
export function shortSpecies(name: string): string {
  const word = name.replace(/ bass$/, "");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "Week 3 of 6" inside the fishing window, counted from starts_at; null before or after it. */
export function weekOf(startsAt: Date, endsAt: Date, nowMs: number): string | null {
  const start = startsAt.getTime();
  const end = endsAt.getTime();
  if (nowMs < start || nowMs > end || end <= start) return null;
  const weeks = Math.ceil((end - start) / WEEK_MS);
  const week = Math.min(weeks, Math.floor((nowMs - start) / WEEK_MS) + 1);
  return `Week ${week} of ${weeks}`;
}

export function leaderboardSubtitle(metric: Metric, bestN: number, week: string | null, anglers: number): string {
  const parts = [metric === "length" ? "Length" : "Weight", `best ${bestN}`];
  if (week) parts.push(week);
  parts.push(`${anglers} ${anglers === 1 ? "angler" : "anglers"}`);
  return parts.join(" · ");
}

function statusOf(value: unknown): EventStatus {
  return value === "draft" || value === "closed" || value === "final" ? value : "live";
}

/** The board in the viewer's units from the records they can read. Pure. */
export function leaderboardFromRecords(input: LeaderboardRecords): LeaderboardData {
  const { event, units, viewerId } = input;
  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const bestN = Number(event.best_n) || 10;

  const entryById = new Map(input.entries.map((entry) => [entry.id, entry]));
  // A catch whose entry the viewer can't read can't be named on the board, so it can't score here.
  const catches = input.catches.filter((record) => entryById.has(String(record.entry)));
  const standings: Standing[] = computeStandings(
    metric,
    input.entries.map((entry) => ({ id: entry.id, withdrawn: entry.withdrawn === true })),
    catches.map((record) => ({
      id: record.id,
      entry: String(record.entry),
      status: record.status as CatchStatus,
      ...(metric === "length" ? { length_q: Number(record.length_q) } : { weight_hoz: Number(record.weight_hoz) }),
    })),
  );

  const catchById = new Map(catches.map((record) => [record.id, record]));
  const measure = (value: number) => displayMeasurement(metric, units, metric === "length" ? { length_q: value } : { weight_hoz: value });
  const unit = measure(0).unit;
  const judge = String(event.judge ?? "");
  const backupJudge = String(event.backup_judge ?? "");

  const rows = standings.map((standing): LeaderboardRow => {
    const entry = entryById.get(standing.entry)!;
    const angler = String(entry.angler ?? "");
    const biggestId = standing.countedIds[0];
    const biggestSpecies = biggestId ? (catchById.get(biggestId)?.expand?.species as RecordModel | undefined) : undefined;
    const role = angler !== "" && angler === judge ? "Judge" : angler !== "" && angler === backupJudge ? "Backup judge" : undefined;
    return {
      entryId: entry.id,
      place: standing.place,
      tied: standings.some((other) => other !== standing && other.place === standing.place),
      displayName: String(entry.display_name ?? "") || "—",
      ...(role && { role }),
      isViewer: angler === viewerId,
      total: measure(standing.total).value,
      counted: standing.counted.length,
      biggest: standing.biggest === null ? null : { size: measure(standing.biggest).value, species: shortSpecies(String(biggestSpecies?.name ?? "")) },
      pending: standing.pending,
    };
  });

  const ownEntries = new Set(input.entries.filter((entry) => entry.angler === viewerId).map((entry) => entry.id));
  const own = catches.filter((record) => ownEntries.has(String(record.entry)));
  const week = weekOf(parsePbDate(String(event.starts_at)), parsePbDate(String(event.ends_at)), input.nowMs);

  return {
    eventId: event.id,
    status: statusOf(event.status),
    metric,
    view: {
      name: String(event.name),
      subtitle: leaderboardSubtitle(metric, bestN, week, rows.length),
      unit,
      bestN,
      you: rows.find((row) => row.isViewer) ?? null,
      rows,
    },
    mine: {
      submitted: own.length,
      pending: own.filter((record) => record.status === "pending").length,
      rejected: own.filter((record) => record.status === "rejected").length,
    },
  };
}

/**
 * Reads one event's board as the signed-in member: three requests, never auto-cancelled, so a
 * refetch that overlaps the last one (every realtime message refetches) can't turn it into an error.
 */
export async function loadLeaderboard(pb: PocketBase, eventId: string, viewerId: string, units: DisplayUnits, nowMs: number): Promise<LeaderboardData> {
  const [event, entries, catches] = await Promise.all([
    pb.collection("events").getOne(eventId, { requestKey: null }),
    pb.collection("entries").getFullList({ filter: pb.filter("event = {:event}", { event: eventId }), requestKey: null }),
    pb.collection("catches").getFullList({
      filter: pb.filter("entry.event = {:event}", { event: eventId }),
      fields: "id,entry,status,weight_hoz,length_q,species,expand.species.id,expand.species.name",
      expand: "species",
      requestKey: null,
    }),
  ]);
  return leaderboardFromRecords({ event, entries, catches, viewerId, units, nowMs });
}
