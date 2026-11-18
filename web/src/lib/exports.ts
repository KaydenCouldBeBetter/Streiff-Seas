// ORG-07a Exports and the ORG-01d preview: the results CSV and the audit CSV of one tournament,
// built in the organizer's browser, and the SHA-256 of each for the group chat (decisions.md
// 2026-09-30 "Finalize", 2026-10-05 "Results and audit CSV format", 2026-11-17 "Export columns").
// No DOM: the tests build the same files against a real PocketBase.
//
// One file for the same data, whoever builds it and wherever: UTF-8 without a byte-order mark, LF
// line endings, a header row, comma-separated with RFC 4180 quoting, timestamps in UTC ISO 8601,
// a fixed sort, raw integers plus readable columns in a fixed unit (never the viewer's display
// units). The results come from web/src/lib/scoring.ts, the leaderboard's own path.

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { displayWeight } from "./displayWeight";
import { computeStandings, type CatchStatus, type Metric } from "./scoring";

export type ExportKind = "results" | "audit";

/** One CSV field, quoted only when it has to be (a comma, a quote or a line break). */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Rows to CSV text: header first, LF after every line, the last one included. */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(field).join(",") + "\n").join("");
}

const PB_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A PocketBase date ("2027-07-04 10:00:00.000Z") as UTC ISO 8601; anything else as it was. */
export function isoTime(value: string): string {
  return PB_DATE.test(value) ? new Date(value.replace(" ", "T")).toISOString() : value;
}

/** JSON with object keys sorted, so the same value always gives the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** One audit snapshot value as a cell: dates in ISO, lists as JSON, nothing as "". */
function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return isoTime(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return stableJson(value);
}

/** Pounds to 0.01 lb ("27.15"), from hundredths of an ounce. */
const pounds = (hoz: number) => displayWeight(hoz, "lb").value;
/** Inches to 0.25 in ("17.50"), from quarter inches. */
const inches = (q: number) => `${Math.floor(q / 4)}.${["00", "25", "50", "75"][q % 4]}`;

export interface ResultsInput {
  event: { metric: string };
  /** Every entry of the event, withdrawn ones included (scoring leaves those out). */
  entries: readonly RecordModel[];
  /** Every catch of the event, any status, with `expand.species` for the biggest fish's name. */
  catches: readonly RecordModel[];
}

/** The results file's header for the event's metric (decisions.md 2026-11-17 "Export columns"). */
export function resultsHeader(metric: Metric): string[] {
  return metric === "length"
    ? ["place", "angler_id", "display_name", "counted_fish", "total_q", "total_in", "biggest_q", "biggest_in", "biggest_species"]
    : ["place", "angler_id", "display_name", "counted_fish", "total_hoz", "total_lb", "biggest_hoz", "biggest_lb", "biggest_species"];
}

/** The results CSV: one line per angler on the board, by place, then display_name. Pure. */
export function resultsCsv(input: ResultsInput): string {
  const metric: Metric = input.event.metric === "length" ? "length" : "weight";
  const entryById = new Map(input.entries.map((entry) => [entry.id, entry]));
  const catches = input.catches.filter((record) => entryById.has(String(record.entry)));
  const standings = computeStandings(
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
  const readable = metric === "length" ? inches : pounds;

  const rows = standings.map((standing) => {
    const entry = entryById.get(standing.entry)!;
    const biggestId = standing.countedIds[0];
    const species = biggestId ? ((catchById.get(biggestId)?.expand?.species as RecordModel | undefined)?.name ?? "") : "";
    return {
      place: standing.place,
      name: String(entry.display_name ?? ""),
      cells: [
        String(standing.place),
        String(entry.angler ?? ""),
        String(entry.display_name ?? ""),
        String(standing.counted.length),
        String(standing.total),
        readable(standing.total),
        standing.biggest === null ? "" : String(standing.biggest),
        standing.biggest === null ? "" : readable(standing.biggest),
        String(species),
      ],
    };
  });
  // By place, then name; the angler id settles two anglers with the same name and place.
  rows.sort((a, b) => a.place - b.place || compare(a.name, b.name) || compare(a.cells[1]!, b.cells[1]!));
  return toCsv(resultsHeader(metric), rows.map((row) => row.cells));
}

/** Code-point order, the same in every browser and locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every snapshot field of every row kind (security.md "Audit snapshots"): catch, then entry, then
 * event. A field two kinds share (species, status) is one column; a row fills only its own kind's.
 */
export const AUDIT_SNAPSHOT_FIELDS = [
  "species", "weight_hoz", "length_q", "status", "reason", "photo", "photo_captured_at", "flags", "rev",
  "withdrawn", "withdraw_reason", "withdrawn_by",
  "name", "starts_at", "ends_at", "deadline_ext_min", "submit_deadline", "metric", "best_n", "judge", "backup_judge",
  "code_word_on", "code_word", "code_word_prev", "code_word_changed_at",
] as const;

export const AUDIT_HEADER = [
  "id", "created", "action", "actor", "event", "catch", "target_id",
  ...AUDIT_SNAPSHOT_FIELDS.map((name) => `before_${name}`),
  ...AUDIT_SNAPSHOT_FIELDS.map((name) => `after_${name}`),
];

/** The audit CSV: one line per audit_log row of the event, by created, then id. Pure. */
export function auditCsv(rows: readonly RecordModel[]): string {
  const sorted = [...rows].sort((a, b) => compare(isoTime(String(a.created)), isoTime(String(b.created))) || compare(a.id, b.id));
  const snapshot = (value: unknown, name: string) => cell((value as Record<string, unknown> | null | undefined)?.[name]);
  return toCsv(
    AUDIT_HEADER,
    sorted.map((row) => [
      row.id,
      isoTime(String(row.created)),
      String(row.action ?? ""),
      String(row.actor ?? ""),
      String(row.event ?? ""),
      String(row.catch ?? ""),
      String(row.target_id ?? ""),
      ...AUDIT_SNAPSHOT_FIELDS.map((name) => snapshot(row.before, name)),
      ...AUDIT_SNAPSHOT_FIELDS.map((name) => snapshot(row.after, name)),
    ]),
  );
}

/** The SHA-256 of the file's exact bytes (UTF-8, no BOM), as 64 lowercase hex digits. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The hash as ORG-07a shows it: 8 groups of 8 characters (copied as one string). */
export function hashGroups(hex: string): string[] {
  return hex.match(/.{1,8}/g) ?? [];
}

/** "summer-bass-2027-results.csv" (Figma ORG-07a). */
export function exportFileName(eventName: string, kind: ExportKind): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "tournament"}-${kind}.csv`;
}

export interface ExportFile {
  kind: ExportKind;
  fileName: string;
  text: string;
  /** Data lines, the header not counted. */
  rows: number;
  sha256: string;
}

export interface ExportData {
  event: RecordModel;
  entries: RecordModel[];
  catches: RecordModel[];
  auditRows: RecordModel[];
}

/**
 * Reads what both files need as the organizer: the event, every entry (R-ENT-L-05), every catch
 * (R-CAT-L-08) and every audit row of the event (R-AUD-L-04).
 */
export async function loadExportData(pb: PocketBase, eventId: string): Promise<ExportData> {
  const [event, entries, catches, auditRows] = await Promise.all([
    pb.collection("events").getOne(eventId, { requestKey: null }),
    pb.collection("entries").getFullList({ filter: pb.filter("event = {:event}", { event: eventId }), requestKey: null }),
    pb.collection("catches").getFullList({
      filter: pb.filter("entry.event = {:event}", { event: eventId }),
      fields: "id,entry,status,weight_hoz,length_q,species,expand.species.id,expand.species.name",
      expand: "species",
      requestKey: null,
    }),
    pb.collection("audit_log").getFullList({ filter: pb.filter("event = {:event}", { event: eventId }), requestKey: null }),
  ]);
  return { event, entries, catches, auditRows };
}

/** Both files with their hashes. */
export async function buildExports(data: ExportData): Promise<Record<ExportKind, ExportFile>> {
  const name = String(data.event.name ?? "");
  const results = resultsCsv({ event: { metric: String(data.event.metric) }, entries: data.entries, catches: data.catches });
  const audit = auditCsv(data.auditRows);
  const lines = (text: string) => text.split("\n").length - 2;
  return {
    results: { kind: "results", fileName: exportFileName(name, "results"), text: results, rows: lines(results), sha256: await sha256Hex(results) },
    audit: { kind: "audit", fileName: exportFileName(name, "audit"), text: audit, rows: lines(audit), sha256: await sha256Hex(audit) },
  };
}
