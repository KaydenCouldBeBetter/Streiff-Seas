// PRF-01c Profile stats from PocketBase (decisions.md 2026-11-18 "Demo data on prod for grading",
// which replaced lib/sampleProfile.ts on the screen): the member's own entries and catches in
// every status, the events they entered, and their place in each final one, worked out by
// scoring.ts from what the viewer can read, the leaderboard's own path. lib/profileStats.ts then
// counts and groups it. No DOM: the tests run it against a real PocketBase.
//
// Reads: the events list rule (R-EVT-L-01 to L-03), the entries list rule (R-ENT-L-02, own
// withdrawn entry L-04) and the catches list rule (R-CAT-L-02; own rejected L-04, own retracted
// and on a withdrawn entry L-11, L-12). No new rule. Read when Profile opens and on focus (Gap 25).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { displayMeasurement, displayWeight } from "./displayWeight";
import { shortSpecies } from "./leaderboard";
import { parsePbDate } from "./liveBoard";
import type { CatchStatus } from "./myCatches";
import { clubYear, type FinalResult, type JudgingRole, type MeasureFormat, type ProfileStatsInput, type StatsCatch, type StatsEvent } from "./profileStats";
import { computeStandings, type Metric } from "./scoring";

export interface ProfileStatsData {
  input: ProfileStatsInput;
  /** The club-time year the "Season" option names, by the server's clock. */
  season: number;
}

export interface ProfileStatsRecords {
  viewerId: string;
  /** Every event the viewer can read. */
  events: readonly RecordModel[];
  /** Every entry the viewer can read: their own, and everyone's on the boards. */
  entries: readonly RecordModel[];
  /** Every catch the viewer can read, with `expand.species`. */
  catches: readonly RecordModel[];
  /** The server's time now (serverClock), for the season. */
  nowMs: number;
}

/** Weights in the viewer's units and lengths in inches, as every other screen shows them. */
export const PROFILE_FORMAT: MeasureFormat = {
  weight: displayWeight,
  length: (quarters) => displayMeasurement("length", "lb", { length_q: quarters }),
};

const metricOf = (event: RecordModel): Metric => (event.metric === "length" ? "length" : "weight");
const dateOf = (value: unknown): Date | undefined => (typeof value === "string" && value !== "" ? parsePbDate(value) : undefined);

/** The stats input from the records. Pure. */
export function profileStatsFromRecords(input: ProfileStatsRecords): ProfileStatsData {
  // Drafts have no catches and no dates to place them by; members can't read them anyway.
  const eventById = new Map(input.events.filter((event) => event.status !== "draft").map((event) => [event.id, event]));
  const own = input.entries.filter((entry) => entry.angler === input.viewerId && eventById.has(String(entry.event)));
  const ownById = new Map(own.map((entry) => [entry.id, entry]));

  const events: StatsEvent[] = [];
  for (const entry of own) {
    const event = eventById.get(String(entry.event))!;
    const startsAt = dateOf(event.starts_at);
    if (startsAt) events.push({ id: event.id, name: String(event.name), startsAt, metric: metricOf(event) });
  }
  const placed = new Set(events.map((event) => event.id));

  const catches: StatsCatch[] = [];
  for (const record of input.catches) {
    const entry = ownById.get(String(record.entry));
    if (!entry || !placed.has(String(entry.event))) continue;
    const event = eventById.get(String(entry.event))!;
    const species = record.expand?.species as RecordModel | undefined;
    const capturedAt = dateOf(record.captured_at);
    catches.push({
      id: record.id,
      eventId: event.id,
      species: species ? shortSpecies(String(species.name)) : "Unknown",
      status: record.status as CatchStatus,
      entryWithdrawn: entry.withdrawn === true,
      created: dateOf(record.created) ?? new Date(input.nowMs),
      ...(capturedAt ? { capturedAt } : {}),
      ...(metricOf(event) === "length" ? { lengthQ: Number(record.length_q) } : { weightHoz: Number(record.weight_hoz) }),
    });
  }

  // A final tournament they fished: their place on its board. One where they never got a fish on
  // the board has no place to show, so it isn't listed; a withdrawn entry shows "Withdrawn".
  const finals: FinalResult[] = [];
  for (const mine of own) {
    const event = eventById.get(String(mine.event))!;
    if (event.status !== "final" || !placed.has(event.id)) continue;
    const metric = metricOf(event);
    if (mine.withdrawn === true) {
      finals.push({ eventId: event.id, place: null, tied: false, fieldSize: 0 });
      continue;
    }
    const boardEntries = input.entries.filter((entry) => entry.event === event.id);
    const ids = new Set(boardEntries.map((entry) => entry.id));
    const standings = computeStandings(
      metric,
      boardEntries.map((entry) => ({ id: entry.id, withdrawn: entry.withdrawn === true })),
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
    if (!standing) continue;
    finals.push({
      eventId: event.id,
      place: standing.place,
      tied: standings.some((other) => other !== standing && other.place === standing.place),
      fieldSize: standings.length,
      ...(metric === "length" ? { totalQ: standing.total } : { totalHoz: standing.total }),
    });
  }

  // The tournaments they judge now: live or closed (PRF-01c identity card).
  const judging: JudgingRole[] = [];
  for (const event of [...eventById.values()].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))) {
    if (event.status !== "live" && event.status !== "closed") continue;
    if (event.judge === input.viewerId) judging.push({ role: "Judge", eventName: String(event.name) });
    else if (event.backup_judge === input.viewerId) judging.push({ role: "Backup judge", eventName: String(event.name) });
  }

  const ownEvents = new Set(events.map((event) => event.id));
  return {
    input: {
      events,
      entries: own.filter((entry) => ownEvents.has(String(entry.event))).map((entry) => ({ eventId: String(entry.event), withdrawn: entry.withdrawn === true })),
      catches,
      finals,
      judging,
    },
    season: clubYear(new Date(input.nowMs)),
  };
}

/** Reads Profile's stats as the signed-in member. */
export async function loadProfileStats(pb: PocketBase, viewerId: string, nowMs: number): Promise<ProfileStatsData> {
  const [events, entries, catches] = await Promise.all([
    pb.collection("events").getFullList({ fields: "id,name,status,starts_at,metric,judge,backup_judge", requestKey: null }),
    pb.collection("entries").getFullList({ fields: "id,event,angler,withdrawn", requestKey: null }),
    pb.collection("catches").getFullList({
      fields: "id,entry,status,weight_hoz,length_q,captured_at,created,expand.species.name",
      expand: "species",
      requestKey: null,
    }),
  ]);
  return profileStatsFromRecords({ viewerId, events, entries, catches, nowMs });
}
