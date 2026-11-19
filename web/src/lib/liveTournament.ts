// The tournament page's data (screens.md EVT-02a, 02d, 02h, 02j, 02m), and joining it (R-ENT-C-01).
// No DOM: the tests run these against a real PocketBase.
//
// The app opens the first live event by start time, as before; the Tournaments list (EVT-01,
// lib/tournaments.ts) opens any other the member can read (decisions.md 2026-11-17 "Tournaments
// list"). Join, submit and rejoin are offered only on a live event, withdraw until final.

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { Metric } from "./catchForm";
import type { SpeciesChoice } from "./catchSender";
import { formatClubTime } from "./format";
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

export type TournamentStatus = "draft" | "live" | "closed" | "final";

export interface LiveTournament {
  /**
   * events.status. loadTournament always sets it; optional so a tournament built by hand (the
   * tests, the samples) reads as live.
   */
  status?: TournamentStatus;
  submit: SubmitTournament;
  startsAt: Date;
  bestN: number;
  /** "Weight · best 10 · Largemouth and smallmouth". */
  rulesLine: string;
  entry: EntryState;
  /**
   * `deadline_ext_min`: how far the final deadline was moved after an outage (screens.md Gap 28).
   * loadLiveTournament always sets it; optional so a tournament built by hand reads as not extended.
   */
  deadlineExtMin?: number;
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
/** events.status, live when a hand-built tournament leaves it out. */
export function statusOf(tournament: LiveTournament): TournamentStatus {
  return tournament.status ?? "live";
}

/**
 * Whether the leaderboard shows its realtime badge (Gap 25; screens.md LB-01). A live or closed board
 * still changes as catches are judged; a draft has no board yet and a final one can't change, so
 * neither says "Live". Found 2026-11-18: an organizer's draft showed Live.
 */
export function showsBoardBadge(tournament: LiveTournament): boolean {
  const status = statusOf(tournament);
  return status === "live" || status === "closed";
}

/**
 * SUB-01e, Submit: not available (screens.md). Why Submit a catch can't open, for the pop-up that
 * answers the button instead of doing nothing (found in Kayden's testing, 2026-11-18). Null when
 * it can open. `next` is the one way on: the tournament's page (Join, Rejoin, its dates) or the
 * Tournaments list (another tournament may be live); none while it's still loading.
 */
export interface SubmitClosed {
  title: string;
  message: string;
  next: "tournament" | "tournaments" | null;
}

export function submitClosed(live: "loading" | "none" | "error" | "ready", tournament: LiveTournament | null, nowMs: number): SubmitClosed | null {
  if (live === "loading") return { title: "Still loading", message: "The tournament is still loading. Try again in a moment.", next: null };
  if (live === "error") return { title: "Couldn't load the tournament", message: "Check your signal, then open the tournament again from Home.", next: "tournaments" };
  if (!tournament) {
    return { title: "No tournament is live", message: "There's no live tournament to submit to right now. When the organizer opens one, join it from Home.", next: "tournaments" };
  }
  if (canSubmit(tournament, nowMs)) return null;
  const name = tournament.submit.name;
  switch (statusOf(tournament)) {
    case "draft":
      return { title: "Not open yet", message: `${name} is still a draft. You can submit once the organizer opens it.`, next: "tournament" };
    case "closed":
      return { title: "Submitting has closed", message: `${name} is closed and takes no more catches. The judge is finishing the last ones.`, next: "tournaments" };
    case "final":
      return { title: "Submitting has closed", message: `${name} is final and takes no more catches.`, next: "tournaments" };
    case "live":
      break;
  }
  const entry = tournament.entry;
  if (entry.kind === "none") return { title: "Join first", message: `Join ${name} to submit catches to it.`, next: "tournament" };
  if (entry.kind === "withdrawn") {
    return entry.bySelf
      ? { title: "You've withdrawn", message: `You withdrew from ${name}. Rejoin it to submit catches.`, next: "tournament" }
      : { title: "Your entry was withdrawn", message: `An organizer withdrew your entry from ${name}, so it takes no catches from you. Ask them if that's a mistake.`, next: "tournament" };
  }
  if (livePhase(tournament, nowMs) === "pre") {
    return { title: "Not open yet", message: `Submitting opens when ${name} starts, ${formatClubTime(tournament.startsAt)}.`, next: "tournament" };
  }
  return { title: "Submitting has closed", message: `The submit deadline for ${name} passed ${formatClubTime(tournament.submit.submitDeadline)}.`, next: "tournament" };
}

/**
 * The back link My catches and the leaderboard show (decisions.md 2026-11-18): the tournament's
 * name when it isn't the live one (opened from Past, or a draft), so its tab isn't a dead end; null
 * while it's live, where those tabs are top-level. Found 2026-11-18: stuck on "Nothing submitted".
 */
export function backToTournamentLabel(tournament: LiveTournament | null): string | null {
  return tournament && statusOf(tournament) !== "live" ? tournament.submit.name : null;
}

/**
 * The leaderboard's back link (decisions.md 2026-11-18): "Profile" when it was opened from a Past
 * results row there (PRF-01c → LB-01g), else the tournament's own page when it isn't the live one
 * (backToTournamentLabel), else none: the live board is a top-level tab.
 */
export function leaderboardBack(from: "tournament" | "profile", tournament: LiveTournament | null): { label: string; to: "profile" | "tournament" } | null {
  if (from === "profile") return { label: "Profile", to: "profile" };
  const label = backToTournamentLabel(tournament);
  return label ? { label, to: "tournament" } : null;
}

export function canJoin(tournament: LiveTournament, nowMs: number): boolean {
  return statusOf(tournament) === "live" && tournament.entry.kind === "none" && livePhase(tournament, nowMs) !== "over";
}

/** Submitting is open inside the window, to an active entry, on a live event (R-CAT-C-06 to C-08, C-14). */
export function canSubmit(tournament: LiveTournament, nowMs: number): boolean {
  return statusOf(tournament) === "live" && tournament.entry.kind === "active" && livePhase(tournament, nowMs) === "window";
}

function entryState(entry: RecordModel | undefined, userId: string): EntryState {
  if (!entry) return { kind: "none" };
  if (!entry.withdrawn) return { kind: "active", id: entry.id };
  return { kind: "withdrawn", id: entry.id, bySelf: entry.withdrawn_by === userId, reason: String(entry.withdraw_reason ?? "") };
}

/** The first live event by start time, with the member's entry in it; null when none is live. */
export function loadLiveTournament(pb: PocketBase, userId: string): Promise<LiveTournament | null> {
  return loadTournament(pb, userId, null);
}

/**
 * One event with the member's entry in it: the one asked for (any status the member can read:
 * R-EVT-L-02, L-03), or, with no id, the first live one by start time. Null when there is none;
 * a refused or missing id throws, like any other failed read.
 */
export async function loadTournament(pb: PocketBase, userId: string, eventId: string | null): Promise<LiveTournament | null> {
  let event: RecordModel | undefined;
  if (eventId === null) {
    const events = await pb.collection("events").getList(1, 1, { filter: 'status = "live"', sort: "starts_at,name", expand: "species", requestKey: null });
    event = events.items[0];
  } else {
    event = await pb.collection("events").getOne(eventId, { expand: "species", requestKey: null });
  }
  if (!event) return null;

  const entries = await pb.collection("entries").getList(1, 1, {
    filter: pb.filter("event = {:event} && angler = {:angler}", { event: event.id, angler: userId }),
    requestKey: null,
  });

  const speciesRecords = ((event.expand?.species as RecordModel[] | undefined) ?? []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const species: SpeciesChoice[] = speciesRecords.map((record) => ({ id: record.id, name: speciesLabel(String(record.name)) }));
  const metric: Metric = event.metric === "length" ? "length" : "weight";
  const bestN = Number(event.best_n) || 10;

  const status = String(event.status);
  return {
    status: status === "draft" || status === "closed" || status === "final" ? status : "live",
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
    deadlineExtMin: Number(event.deadline_ext_min) || 0,
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

/** Withdrawing is open on an active entry while live or closed, never once final (R-ENT-U-01, U-02, U-10). */
export function canWithdraw(tournament: LiveTournament): boolean {
  const status = statusOf(tournament);
  return (status === "live" || status === "closed") && tournament.entry.kind === "active";
}

/** Rejoining is open only after withdrawing yourself, while live and before submit_deadline (R-ENT-U-03 to U-05). */
export function canRejoin(tournament: LiveTournament, nowMs: number): boolean {
  return statusOf(tournament) === "live" && tournament.entry.kind === "withdrawn" && tournament.entry.bySelf && livePhase(tournament, nowMs) !== "over";
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
