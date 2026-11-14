// The live tournament the member's home screen shows, and joining it (screens.md EVT-02a, 02d,
// 02h, 02j; R-ENT-C-01). No DOM: the tests run these against a real PocketBase.
//
// Until the Tournaments list (EVT-01) exists, home is the first live event by start time. The
// standing on that screen is still sample data until the leaderboard (S2b).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { Metric } from "./catchForm";
import type { SpeciesChoice } from "./catchSender";
import { parsePbDate } from "./liveBoard";
import type { SubmitTournament } from "./sampleSubmit";
import { failureKind, type FailureKind } from "./sendCatch";

/** screens.md §1 "Entry state". */
export type EntryState =
  | { kind: "none" }
  | { kind: "active"; id: string }
  | { kind: "withdrawn"; id: string; bySelf: boolean; reason: string };

/** Where `now` falls in the event (screens.md §1 phases, live only). */
export type LivePhase = "pre" | "window" | "over";

export interface LiveTournament {
  submit: SubmitTournament;
  startsAt: Date;
  bestN: number;
  /** "Weight · best 10 · Largemouth and smallmouth". */
  rulesLine: string;
  entry: EntryState;
}

/** "largemouth bass" → "Largemouth bass": species names are stored lower case. */
export function speciesLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "Weight · best 10 · Largemouth and smallmouth", as the Figma tournament frame writes it. */
export function rulesLine(metric: Metric, bestN: number, species: readonly string[]): string {
  const short = species.map((name, index) => {
    const word = name.replace(/ bass$/, "");
    return index === 0 ? speciesLabel(word) : word;
  });
  const list = short.length <= 1 ? (short[0] ?? "") : `${short.slice(0, -1).join(", ")} and ${short[short.length - 1]}`;
  return `${metric === "weight" ? "Weight" : "Length"} · best ${bestN} · ${list}`;
}

export function livePhase(tournament: LiveTournament, nowMs: number): LivePhase {
  if (nowMs < tournament.startsAt.getTime()) return "pre";
  if (nowMs <= tournament.submit.submitDeadline.getTime()) return "window";
  return "over";
}

/** Joining is open while live, up to submit_deadline (R-ENT-C-01, C-05). */
export function canJoin(tournament: LiveTournament, nowMs: number): boolean {
  return tournament.entry.kind === "none" && livePhase(tournament, nowMs) !== "over";
}

/** Submitting is open inside the window, to an active entry (R-CAT-C-06, C-07, C-14). */
export function canSubmit(tournament: LiveTournament, nowMs: number): boolean {
  return tournament.entry.kind === "active" && livePhase(tournament, nowMs) === "window";
}

function entryState(entry: RecordModel | undefined, userId: string): EntryState {
  if (!entry) return { kind: "none" };
  if (!entry.withdrawn) return { kind: "active", id: entry.id };
  return { kind: "withdrawn", id: entry.id, bySelf: entry.withdrawn_by === userId, reason: String(entry.withdraw_reason ?? "") };
}

/** The first live event by start time, with the member's entry in it; null when none is live. */
export async function loadLiveTournament(pb: PocketBase, userId: string): Promise<LiveTournament | null> {
  const events = await pb.collection("events").getList(1, 1, { filter: 'status = "live"', sort: "starts_at,name", expand: "species" });
  const event = events.items[0];
  if (!event) return null;

  const entries = await pb.collection("entries").getList(1, 1, {
    filter: pb.filter("event = {:event} && angler = {:angler}", { event: event.id, angler: userId }),
  });

  const speciesRecords = ((event.expand?.species as RecordModel[] | undefined) ?? []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const species: SpeciesChoice[] = speciesRecords.map((record) => ({ id: record.id, name: speciesLabel(String(record.name)) }));
  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const bestN = Number(event.best_n) || 10;

  return {
    submit: {
      eventId: event.id,
      name: String(event.name),
      metric,
      endsAt: parsePbDate(String(event.ends_at)),
      submitDeadline: parsePbDate(String(event.submit_deadline)),
      codeWord: event.code_word_on ? String(event.code_word) : null,
      species,
    },
    startsAt: parsePbDate(String(event.starts_at)),
    bestN,
    rulesLine: rulesLine(metric, bestN, speciesRecords.map((record) => String(record.name))),
    entry: entryState(entries.items[0], userId),
  };
}

/** Joins the event as the signed-in member (R-ENT-C-01): the entry's id, or why it failed. */
export async function joinTournament(pb: PocketBase, eventId: string, userId: string): Promise<{ kind: "joined"; id: string } | { kind: FailureKind }> {
  try {
    const entry = await pb.collection("entries").create({ event: eventId, angler: userId });
    return { kind: "joined", id: entry.id };
  } catch (error) {
    return { kind: failureKind(error) };
  }
}

/** Withdrawing is open on an active entry until the event is final (R-ENT-U-01, U-02, U-10). */
export function canWithdraw(tournament: LiveTournament): boolean {
  return tournament.entry.kind === "active";
}

/** Rejoining is open only after withdrawing yourself, while live and before submit_deadline (R-ENT-U-03 to U-05). */
export function canRejoin(tournament: LiveTournament, nowMs: number): boolean {
  return tournament.entry.kind === "withdrawn" && tournament.entry.bySelf && livePhase(tournament, nowMs) !== "over";
}

/** Sets the member's own entry withdrawn (true) or back in (false): R-ENT-U-01, U-03. */
export async function setWithdrawn(pb: PocketBase, entryId: string, withdrawn: boolean): Promise<{ kind: "done" } | { kind: FailureKind }> {
  try {
    await pb.collection("entries").update(entryId, { withdrawn });
    return { kind: "done" };
  } catch (error) {
    return { kind: failureKind(error) };
  }
}
