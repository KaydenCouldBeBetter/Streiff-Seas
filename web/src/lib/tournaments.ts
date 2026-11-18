// EVT-01 Tournaments, the Home tab (Figma 90:4446 EVT-01b; decisions.md 2026-10-03 "Home screen
// and landing", 2026-11-17 "Tournaments list"): every tournament the member can read, as cards in
// three groups. Live now; Drafts, for organizers only (R-EVT-L-03); Past, closed and final. Each
// card says where the viewer stands. No DOM: the tests run it against a real PocketBase.
//
// Reads: the events list rule (R-EVT-L-01 to L-03), the entries list rule (R-ENT-L-02) and the
// catches list rule (R-CAT-L-02), so a place is worked out by scoring.ts from what the viewer can
// see, the leaderboard's own path. Read when Home opens and on focus; not live (Gap 25).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { displayMeasurement } from "./displayWeight";
import { formatClubDay, placeLabel } from "./format";
import { parsePbDate } from "./liveBoard";
import type { TournamentStatus } from "./liveTournament";
import type { DisplayUnits } from "./profile";
import { computeStandings, type CatchStatus, type Metric } from "./scoring";

export interface TournamentCardView {
  id: string;
  name: string;
  status: TournamentStatus;
  /** "Sun, Jul 4 – Sun, Aug 15 · Weight · best 10"; past ones carry the year. */
  dates: string;
  /** The viewer's own position: "Judge · you're 6th · 15.10 lb", "Not joined yet", "Final results". */
  entry: string;
}

export interface TournamentsData {
  live: TournamentCardView[];
  /** Organizers only; empty for everyone else. */
  drafts: TournamentCardView[];
  /** Closed and final, the most recent first. */
  past: TournamentCardView[];
  /** For the organizer's Species link: "2 species · add one for a new tournament". */
  speciesCount: number;
}

export interface TournamentsRecords {
  viewerId: string;
  units: DisplayUnits;
  events: readonly RecordModel[];
  /** Every entry the viewer can read in those events. */
  entries: readonly RecordModel[];
  /** Every catch the viewer can read in those events (id, entry, status, measurement). */
  catches: readonly RecordModel[];
  speciesCount: number;
}

const statusOf = (value: unknown): TournamentStatus => (value === "draft" || value === "closed" || value === "final" ? value : "live");

const YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" });

/** The card's second line. A tournament still being set up may have no dates yet. */
function datesLine(event: RecordModel, past: boolean): string {
  const metric = event.metric === "length" ? "Length" : "Weight";
  const rules = `${metric} · best ${Number(event.best_n) || 10}`;
  const starts = String(event.starts_at ?? "");
  const ends = String(event.ends_at ?? "");
  if (starts === "" || ends === "") return `Dates not set · ${rules}`;
  const from = parsePbDate(starts);
  const to = parsePbDate(ends);
  if (!past) return `${formatClubDay(from)} – ${formatClubDay(to)} · ${rules}`;
  // Past ones drop the weekday and add the year: "Sep 6 – Oct 18, 2026" (Figma EVT-01b).
  const short = (at: Date) => formatClubDay(at).replace(/^\w+, /, "");
  return `${short(from)} – ${short(to)}, ${YEAR.format(to)} · ${rules}`;
}

/** The card's last line: the viewer's own position in the tournament (Figma Tournament card note). */
function entryLine(event: RecordModel, input: TournamentsRecords): string {
  const status = statusOf(event.status);
  if (status === "draft") return "Not open yet · only you can see it";

  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const entries = input.entries.filter((entry) => entry.event === event.id);
  const mine = entries.find((entry) => entry.angler === input.viewerId);
  const role = status !== "final" && event.judge === input.viewerId ? "Judge" : status !== "final" && event.backup_judge === input.viewerId ? "Backup judge" : null;
  const withRole = (text: string) => (role ? `${role} · ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);

  if (!mine) return role ?? (status === "final" ? "Final results" : status === "closed" ? "Closed · judging continues" : "Not joined yet");
  if (mine.withdrawn === true) return withRole(mine.withdrawn_by === input.viewerId ? "You withdrew" : "Withdrawn by the organizer");

  const ids = new Set(entries.map((entry) => entry.id));
  const standings = computeStandings(
    metric,
    entries.map((entry) => ({ id: entry.id, withdrawn: entry.withdrawn === true })),
    input.catches
      .filter((record) => ids.has(String(record.entry)))
      .map((record) => ({
        id: record.id,
        entry: String(record.entry),
        status: record.status as CatchStatus,
        ...(metric === "length" ? { length_q: Number(record.length_q) } : { weight_hoz: Number(record.weight_hoz) }),
      })),
  );
  const standing = standings.find((candidate) => candidate.entry === mine.id);
  if (!standing) return withRole(status === "final" ? "Final results" : "Joined · nothing on the board yet");

  const tied = standings.some((other) => other !== standing && other.place === standing.place);
  const place = placeLabel(standing.place, tied);
  const { value, unit } = displayMeasurement(metric, input.units, metric === "length" ? { length_q: standing.total } : { weight_hoz: standing.total });
  const total = `${value} ${unit}`;
  if (status === "final") return withRole(`You finished ${place} · ${total}`);
  return role ? withRole(`You're ${place} · ${total}`) : `You're ${place} · ${total} · ${standing.counted.length} of ${Number(event.best_n) || 10} counted`;
}

/** The list from the records. Pure. */
export function tournamentsFromRecords(input: TournamentsRecords): TournamentsData {
  const card = (event: RecordModel, past: boolean): TournamentCardView => ({
    id: event.id,
    name: String(event.name),
    status: statusOf(event.status),
    dates: datesLine(event, past),
    entry: entryLine(event, input),
  });
  const time = (event: RecordModel, field: string) => {
    const value = String(event[field] ?? "");
    return value === "" ? Number.POSITIVE_INFINITY : parsePbDate(value).getTime();
  };
  const byStart = (a: RecordModel, b: RecordModel) => time(a, "starts_at") - time(b, "starts_at") || String(a.name).localeCompare(String(b.name));
  const of = (...statuses: TournamentStatus[]) => input.events.filter((event) => statuses.includes(statusOf(event.status)));
  return {
    live: of("live").sort(byStart).map((event) => card(event, false)),
    drafts: of("draft").sort(byStart).map((event) => card(event, false)),
    past: of("closed", "final")
      .sort((a, b) => time(b, "ends_at") - time(a, "ends_at") || String(a.name).localeCompare(String(b.name)))
      .map((event) => card(event, true)),
    speciesCount: input.speciesCount,
  };
}

/**
 * Reads Home as the signed-in member: every event they can read (drafts only for organizers, by
 * the rule), the entries and catches behind their own line, and how many species there are.
 */
export async function loadTournaments(pb: PocketBase, viewerId: string, units: DisplayUnits): Promise<TournamentsData> {
  const [events, entries, catches, species] = await Promise.all([
    pb.collection("events").getFullList({ sort: "starts_at", requestKey: null }),
    pb.collection("entries").getFullList({ fields: "id,event,angler,withdrawn,withdrawn_by", requestKey: null }),
    pb.collection("catches").getFullList({ filter: 'status = "pending" || status = "verified"', fields: "id,entry,status,weight_hoz,length_q", requestKey: null }),
    pb.collection("species").getList(1, 1, { requestKey: null }),
  ]);
  return tournamentsFromRecords({ viewerId, units, events, entries, catches, speciesCount: species.totalItems });
}
