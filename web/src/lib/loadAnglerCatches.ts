// LB-02 Angler's catches and LB-03 Catch detail from the server (S2b): one angler's pending and
// verified catches in the tournament, newest first, with every audit row of them and a file token
// for the photos. No DOM: the tests run it against a real PocketBase.
//
// Reads: the entry and the event (R-ENT-L-02, R-EVT-L-02), the catches list rule (R-CAT-L-02),
// the audit_log list rule (R-AUD-L-02) and a file token (R-CAT-F-02). The list asks for pending
// and verified only, so a judge, the organizer or the angler sees the same page as everyone
// (screens.md LB-02c; decisions.md 2026-10-05). `inBest` comes from scoring.ts. Actors are
// labelled by comparing IDs: the angler's own steps read "Angler" (screens.md LB-03a). Read when
// the page opens and when the app comes back to the foreground; it is not live (Gap 25).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { AnglerCatchView } from "./anglerCatches";
import type { CatchAuditRow } from "./catchTimeline";
import { displayMeasurement } from "./displayWeight";
import { parsePbDate } from "./liveBoard";
import { speciesLabel } from "./liveTournament";
import { auditRows, photosOf, type People, type Shaping } from "./loadMyCatches";
import type { DisplayUnits } from "./profile";
import { computeStandings, type CatchStatus, type Metric } from "./scoring";

export interface AnglerCatchesData {
  entryId: string;
  /** The event is final (LB-02b, LB-03b): every photo shows "Photo archived" and none is requested. */
  final: boolean;
  /** Newest first; pending and verified only. */
  catches: AnglerCatchView[];
  /** Each catch's audit rows, oldest first, by catch id. */
  history: Record<string, CatchAuditRow[]>;
}

export interface AnglerCatchRecords {
  entryId: string;
  metric: Metric;
  units: DisplayUnits;
  people: People;
  /** The entry's pending and verified catches, newest first, with `expand.species`. */
  catches: readonly RecordModel[];
  /** Every audit row of those catches the viewer can read, oldest first. */
  audit: readonly RecordModel[];
  /** The photo URL for one file, already carrying the file token. */
  photoUrl: (record: RecordModel, filename: string) => string;
  /** The event is final: photos are archived, so no URL is built (S4 step 9). */
  final?: boolean;
}

/** The pages' view model from the records. Pure. */
export function anglerCatchesFromRecords(input: AnglerCatchRecords): AnglerCatchesData {
  const { entryId, metric, units, people } = input;
  const visible = input.catches.filter((record) => record.status === "pending" || record.status === "verified");

  const species = new Map<string, string>();
  for (const record of visible) {
    const expanded = record.expand?.species as RecordModel | undefined;
    if (expanded) species.set(expanded.id, speciesLabel(String(expanded.name)));
  }
  const shaping: Shaping = { metric, units, species };

  // The entry is visible, so it isn't withdrawn: its best 10 verified fish count.
  const standing = computeStandings(
    metric,
    [{ id: entryId, withdrawn: false }],
    visible.map((record) => ({
      id: record.id,
      entry: entryId,
      status: record.status as CatchStatus,
      ...(metric === "length" ? { length_q: Number(record.length_q) } : { weight_hoz: Number(record.weight_hoz) }),
    })),
  )[0];
  const counted = new Set(standing?.countedIds ?? []);

  const byCatch = new Map<string, RecordModel[]>();
  for (const record of input.audit) {
    const list = byCatch.get(String(record.catch)) ?? [];
    list.push(record);
    byCatch.set(String(record.catch), list);
  }

  const history: Record<string, CatchAuditRow[]> = {};
  const catches = visible
    .map((record): AnglerCatchView => {
      history[record.id] = auditRows(byCatch.get(record.id) ?? [], people, shaping);
      const capturedAt = String(record.captured_at ?? "");
      return {
        id: record.id,
        species: species.get(String(record.species)) ?? "",
        measurement: displayMeasurement(metric, units, record),
        status: record.status as CatchStatus,
        created: parsePbDate(String(record.created)),
        ...(capturedAt !== "" && { capturedAt: parsePbDate(capturedAt) }),
        photos: photosOf(record).map((name) => ({ url: input.final ? "" : input.photoUrl(record, name) })),
        inBest: counted.has(record.id),
      };
    })
    .sort((a, b) => b.created.getTime() - a.created.getTime() || (a.id < b.id ? 1 : -1));

  return { entryId, final: input.final === true, catches, history };
}

/**
 * Reads one angler's page as the signed-in member. A withdrawn entry, or one the viewer can't
 * read, comes back as a refusal (404), which the screen shows as an error. Requests are never
 * auto-cancelled, so a refresh that overlaps the last one can't turn it into an error.
 */
export async function loadAnglerCatches(pb: PocketBase, entryId: string, viewerId: string, units: DisplayUnits): Promise<AnglerCatchesData> {
  const entry = await pb.collection("entries").getOne(entryId, { expand: "event", requestKey: null });
  const event = entry.expand?.event as RecordModel | undefined;
  const metric: Metric = event?.metric === "length" ? "length" : "weight";
  const [catches, audit] = await Promise.all([
    pb.collection("catches").getFullList({
      filter: pb.filter('entry = {:entry} && (status = "pending" || status = "verified")', { entry: entryId }),
      sort: "-created",
      expand: "species",
      requestKey: null,
    }),
    pb.collection("audit_log").getFullList({ filter: pb.filter("catch.entry = {:entry}", { entry: entryId }), sort: "created", requestKey: null }),
  ]);
  // Once final the photos are archived (and later removed from the server): no token, no URL.
  const final = event?.status === "final";
  const token = !final && catches.some((record) => photosOf(record).length > 0) ? await pb.files.getToken({ requestKey: null }) : "";
  return anglerCatchesFromRecords({
    final,
    entryId,
    metric,
    units,
    people: { me: viewerId, angler: String(entry.angler ?? ""), judge: String(event?.judge ?? ""), backupJudge: String(event?.backup_judge ?? "") },
    catches,
    audit,
    photoUrl: (record, filename) => pb.files.getURL(record, filename, { token }),
  });
}
