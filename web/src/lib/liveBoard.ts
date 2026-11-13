// What the bare live page (M0-03, /#live) shows: each live tournament's pending and verified
// catches, as the API rules return them to the viewer (security.md R-CAT-L-02 and the rest):
// angler, species, measurement, status and when it was submitted. No photos, no scoring; the
// leaderboard (S2b) replaces this page. No DOM here: the tests run fetchLiveBoard against a
// real PocketBase.

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { formatClubTime } from "./format";

export interface LiveRow {
  id: string;
  angler: string;
  species: string;
  measurement: string;
  /** "Pending" or "Verified". */
  status: string;
  /** Club time, e.g. "Sat, Jul 11, 9:05 AM". */
  submitted: string;
  /** The stored `created`, in ms, for ordering. */
  createdMs: number;
}

export interface LiveEvent {
  id: string;
  name: string;
  /** events.status as stored; shown through statusWord(). */
  status: string;
  rows: LiveRow[];
}

export interface LiveBoard {
  events: LiveEvent[];
}

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  live: "Live",
  closed: "Closed",
  final: "Final",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  retracted: "Retracted",
};

/**
 * The words for an event or catch status (decisions.md 2026-10-05 "Event status and the live
 * badge use different words"): Draft, Live, Closed, Final. The realtime badge never uses this.
 */
export function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

/**
 * A stored weight (hundredths of an ounce) in decimal pounds to 0.01 lb, as scoring.md §4
 * displays it: 5,500 (3 lb 7 oz) reads "3.44 lb". Display only, in whole numbers; the
 * viewer's display units come with the leaderboard (S2b).
 */
export function weightText(weightHoz: number): string {
  // 0.01 lb is 16 hundredths of an ounce.
  const hundredths = Math.round(weightHoz / 16);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")} lb`;
}

const QUARTERS = ["", "1/4", "1/2", "3/4"];

/** A stored length (quarter inches) as scoring.md writes it: 70 reads "17 1/2 in". */
export function lengthText(lengthQ: number): string {
  const whole = Math.floor(lengthQ / 4);
  const quarter = QUARTERS[lengthQ % 4];
  if (whole === 0 && quarter !== "") return `${quarter} in`;
  return quarter === "" ? `${whole} in` : `${whole} ${quarter} in`;
}

/** PocketBase writes dates as "2026-07-11 13:05:00.000Z". */
export function parsePbDate(value: string): Date {
  return new Date(value.replace(" ", "T"));
}

function row(record: RecordModel, metric: string): LiveRow {
  const entry = record.expand?.entry as RecordModel | undefined;
  const species = record.expand?.species as RecordModel | undefined;
  const created = parsePbDate(String(record.created));
  return {
    id: record.id,
    angler: String(entry?.display_name ?? "") || "—",
    species: String(species?.name ?? "") || "—",
    measurement: metric === "length" ? lengthText(Number(record.length_q)) : weightText(Number(record.weight_hoz)),
    status: statusWord(String(record.status)),
    submitted: formatClubTime(created),
    createdMs: created.getTime(),
  };
}

/**
 * Groups catches under their live events. Events keep the order given (start time, then
 * name); each event's catches are newest first. An event with no catches still shows.
 */
export function buildBoard(events: RecordModel[], catches: RecordModel[]): LiveBoard {
  return {
    events: events.map((event) => ({
      id: event.id,
      name: String(event.name),
      status: String(event.status),
      rows: catches
        .filter((record) => (record.expand?.entry as RecordModel | undefined)?.event === event.id)
        .map((record) => row(record, String(event.metric)))
        .sort((a, b) => b.createdMs - a.createdMs || (a.id < b.id ? 1 : -1)),
    })),
  };
}

/** Everything the page shows, in two requests. */
export async function fetchLiveBoard(pb: PocketBase): Promise<LiveBoard> {
  const events = await pb.collection("events").getFullList({ filter: 'status = "live"', sort: "starts_at,name" });
  if (events.length === 0) return { events: [] };
  const catches = await pb.collection("catches").getFullList({
    filter: 'entry.event.status = "live" && (status = "pending" || status = "verified")',
    expand: "entry,species",
    sort: "-created",
  });
  return buildBoard(events, catches);
}
