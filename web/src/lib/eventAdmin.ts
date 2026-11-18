// ORG-01 to ORG-06 and ORG-10: the organizer manages one tournament (Figma Flow 9a). Manage's view
// of the event, the tournament form (new, edit draft, edit live, edit closed), Open, Extend, Close,
// Finalize and adding a species. No DOM: the tests run these against a real PocketBase.
//
// Writes go through the events create and update rules and hooks (security.md "events"; S4 steps
// 1 to 5) and the species create rule (R-SPC-C-01). A refusal is explained from the hook's own
// code when it sent one, otherwise by reloading the event (screens.md Gap 16). A change that got
// no reply shows NOT SENT; Retry reloads first and says "saved" when the change already landed
// (decisions.md 2026-10-05 "No reply on any change"; ORG-04c, 05c, 06c).

import type PocketBase from "pocketbase";
import { ClientResponseError, type RecordModel } from "pocketbase";
import { clubInputToIso, isoToClubInput } from "./clubTime";
import { formatClubTime } from "./format";
import { parsePbDate } from "./liveBoard";
import { speciesLabel, type TournamentStatus } from "./liveTournament";
import { failureKind } from "./sendCatch";

export type ManagePhase = "draft" | "live:open" | "live:over" | "closed" | "final";

export interface Person {
  id: string;
  name: string;
  organizer: boolean;
}

export interface ChecklistItem {
  id: "window" | "species" | "backup_judge" | "code_word";
  label: string;
  done: boolean;
  /** What to fix, when not done: "To do: choose a backup judge". */
  fix: string;
}

export interface ManageData {
  eventId: string;
  name: string;
  status: TournamentStatus;
  phase: ManagePhase;
  /** ORG-01's facts panel, label and value, in Figma's order. */
  facts: { label: string; value: string }[];
  /** The Open checklist (ORG-01a; Gap 11): the hook's own four conditions. */
  checklist: ChecklistItem[];
  canOpen: boolean;
  endsAt: Date | null;
  submitDeadline: Date | null;
  deadlineExtMin: number;
  /** The fishing window is still open: ends_at hasn't passed (ORG-03a: end time later only). */
  windowOpen: boolean;
  counts: {
    /** Entries not withdrawn. */
    entries: number;
    pending: number;
    /** Pending catches the judge rules on: everyone's but the judge's own. */
    pendingForJudge: number;
    /** The judge's own pending catches, which the backup judge rules on. */
    pendingForBackup: number;
  };
  judge: Person | null;
  backupJudge: Person | null;
  /** For the tournament form's pickers: organizers can judge (R-EVT-C-07); anyone can back up. */
  people: Person[];
  /** Every species, for the form's checklist; the event's are ticked there. */
  species: { id: string; name: string }[];
  form: EventForm;
}

/** The tournament form (ORG-02, ORG-03) as the inputs hold it. Dates are `datetime-local`, Eastern. */
export interface EventForm {
  name: string;
  startsAt: string;
  endsAt: string;
  metric: "weight" | "length";
  bestN: string;
  species: string[];
  judge: string;
  backupJudge: string;
  codeWordOn: boolean;
  codeWord: string;
}

export const EMPTY_FORM: EventForm = {
  name: "",
  startsAt: "",
  endsAt: "",
  metric: "weight",
  bestN: "10",
  species: [],
  judge: "",
  backupJudge: "",
  codeWordOn: false,
  codeWord: "",
};

const statusOf = (value: unknown): TournamentStatus => (value === "draft" || value === "closed" || value === "final" ? value : "live");
const dateOf = (value: unknown): Date | null => (String(value ?? "") === "" ? null : parsePbDate(String(value)));

/** draft, live before or after the final deadline (by the server's clock: Gap 17), closed, final. */
export function managePhase(status: TournamentStatus, submitDeadline: Date | null, nowMs: number): ManagePhase {
  if (status !== "live") return status;
  return submitDeadline !== null && nowMs > submitDeadline.getTime() ? "live:over" : "live:open";
}

/** The same four conditions the events hook checks before Open (R-EVT-U-25). */
export function openChecklist(event: RecordModel): ChecklistItem[] {
  const starts = dateOf(event.starts_at);
  const ends = dateOf(event.ends_at);
  const backup = String(event.backup_judge ?? "");
  const items: ChecklistItem[] = [
    { id: "window", label: "Start is before the end", done: starts !== null && ends !== null && starts < ends, fix: "To do: set a start before the end" },
    { id: "species", label: "At least one species", done: ((event.species as string[] | undefined) ?? []).length > 0, fix: "To do: choose at least one species" },
    {
      id: "backup_judge",
      label: "Judge and backup judge are different people",
      done: backup !== "" && backup !== event.judge,
      fix: backup === "" ? "To do: choose a backup judge" : "To do: choose a backup judge who isn't the judge",
    },
    {
      id: "code_word",
      label: event.code_word_on ? "Code word is set" : "Code word is off",
      done: !event.code_word_on || String(event.code_word ?? "").trim() !== "",
      fix: "To do: write the code word, or turn it off",
    },
  ];
  return items;
}

/**
 * The action bar of a draft (ORG-01a): Open once the checklist is met, otherwise the form to finish
 * it (ORG-02b), never a disabled button (P11). Null when the tournament isn't a draft.
 */
export function draftAction(data: Pick<ManageData, "phase" | "canOpen">): { kind: "open" | "edit"; label: string } | null {
  if (data.phase !== "draft") return null;
  return data.canOpen ? { kind: "open", label: "Open tournament" } : { kind: "edit", label: "Finish the draft" };
}

export function eventFormFromRecord(event: RecordModel): EventForm {
  return {
    name: String(event.name ?? ""),
    startsAt: isoToClubInput(dateOf(event.starts_at)),
    endsAt: isoToClubInput(dateOf(event.ends_at)),
    metric: event.metric === "length" ? "length" : "weight",
    bestN: String(Number(event.best_n) || 10),
    species: [...((event.species as string[] | undefined) ?? [])],
    judge: String(event.judge ?? ""),
    backupJudge: String(event.backup_judge ?? ""),
    codeWordOn: event.code_word_on === true,
    codeWord: String(event.code_word ?? ""),
  };
}

/** Which form fields may change in each status (security.md events Update; ORG-03a, ORG-03b). */
export function editableFields(status: TournamentStatus | "new"): ReadonlySet<keyof EventForm> {
  if (status === "new" || status === "draft") return new Set(Object.keys(EMPTY_FORM) as (keyof EventForm)[]);
  if (status === "live") return new Set<keyof EventForm>(["name", "codeWordOn", "codeWord", "backupJudge", "endsAt"]);
  if (status === "closed") return new Set<keyof EventForm>(["backupJudge"]);
  return new Set();
}

/** Why a locked field can't change, shown beside it (ORG-03a; §14.3). */
export function lockReason(field: keyof EventForm, status: TournamentStatus): string {
  if (status === "final") return "The tournament is final.";
  if (status === "closed") return "Only the backup judge can change once closed.";
  if (field === "judge") return "The judge can't change while live, except by a step-down.";
  return "Can't change once the tournament is open.";
}

export type FormErrors = Partial<Record<keyof EventForm, string>>;

/**
 * What the form must fix before Save (validate on Save: ORG-02a). A draft may be saved incomplete
 * (Gap 11), so only what the server would refuse outright, or a typo, is checked here.
 */
export function formErrors(form: EventForm, status: TournamentStatus | "new", original?: EventForm, windowOpen = true): FormErrors {
  const errors: FormErrors = {};
  const editable = editableFields(status);
  if (form.name.trim() === "") errors.name = "Give the tournament a name.";
  for (const field of ["startsAt", "endsAt"] as const) {
    if (!editable.has(field) || form[field] === "") continue;
    try {
      clubInputToIso(form[field]);
    } catch {
      errors[field] = "Choose a date and time.";
    }
  }
  if (editable.has("bestN") && !(/^\d+$/.test(form.bestN) && Number(form.bestN) >= 1)) errors.bestN = "A whole number, 1 or more.";
  if (editable.has("judge") && form.judge === "") errors.judge = "Choose a judge.";
  if (form.backupJudge !== "" && form.backupJudge === form.judge) {
    errors.backupJudge = "The judge and the backup judge must be different people.";
    if (editable.has("judge")) errors.judge = "The judge and the backup judge must be different people.";
  }
  if (status !== "new" && status !== "draft" && form.backupJudge === "") errors.backupJudge = "Choose a backup judge.";
  if (status === "live" && original && form.endsAt !== original.endsAt) {
    if (!windowOpen) errors.endsAt = "Fishing has ended, so the end can't move now.";
    else if (form.endsAt === "" || (!errors.endsAt && clubInputToIso(form.endsAt) < clubInputToIso(original.endsAt))) errors.endsAt = "The end can only move later.";
  }
  return errors;
}

/**
 * The request body: for a new draft every field and `status: "draft"`; for an edit only the
 * fields that changed and may change in this status, so a body never trips a lock it didn't mean
 * to touch. Never submit_deadline, deadline_ext_min or the code word history (R-EVT-C-04, C-06, C-10).
 */
export function eventBody(form: EventForm, status: TournamentStatus | "new", original?: EventForm): Record<string, unknown> {
  const editable = editableFields(status);
  const value: Record<keyof EventForm, unknown> = {
    name: form.name.trim(),
    startsAt: form.startsAt === "" ? "" : clubInputToIso(form.startsAt),
    endsAt: form.endsAt === "" ? "" : clubInputToIso(form.endsAt),
    metric: form.metric,
    bestN: Number(form.bestN),
    species: [...form.species].sort(),
    judge: form.judge,
    backupJudge: form.backupJudge,
    codeWordOn: form.codeWordOn,
    codeWord: form.codeWord.trim(),
  };
  const column: Record<keyof EventForm, string> = {
    name: "name",
    startsAt: "starts_at",
    endsAt: "ends_at",
    metric: "metric",
    bestN: "best_n",
    species: "species",
    judge: "judge",
    backupJudge: "backup_judge",
    codeWordOn: "code_word_on",
    codeWord: "code_word",
  };
  const body: Record<string, unknown> = status === "new" ? { status: "draft" } : {};
  for (const field of Object.keys(column) as (keyof EventForm)[]) {
    if (!editable.has(field)) continue;
    if (original) {
      const before = field === "species" ? [...original.species].sort() : original[field];
      const after = field === "species" ? value.species : form[field];
      if (JSON.stringify(before) === JSON.stringify(after) || (field === "codeWord" && original.codeWord.trim() === value.codeWord) || (field === "name" && original.name.trim() === value.name)) continue;
    }
    body[column[field]] = value[field];
  }
  return body;
}

/** Why a change was refused, for the screens' words (ORG-02c, 04b, 05b, 06b; Gap 16). */
export type RefusalReason =
  | "open_incomplete"
  | "close_too_early"
  | "finalize_pending"
  | "ext_lower"
  | "ext_not_hours"
  | "ends_at_earlier"
  | "ends_at_window_closed"
  | "judge_is_backup"
  | "judge_not_organizer"
  | "backup_required"
  | "status_changed"
  | "final"
  | "nothing_changed"
  | "unknown";

export type EventChangeResult =
  | { kind: "saved"; event: RecordModel }
  | { kind: "already-saved" }
  | { kind: "not-sent" }
  | { kind: "refused"; reason: RefusalReason; event?: RecordModel };

const HOOK_CODES: readonly RefusalReason[] = [
  "open_incomplete",
  "close_too_early",
  "finalize_pending",
  "ext_lower",
  "ext_not_hours",
  "ends_at_earlier",
  "ends_at_window_closed",
  "judge_is_backup",
  "judge_not_organizer",
  "backup_required",
  "nothing_changed",
];

/** The hook's validation code, when the refusal carried one. */
function hookCode(error: unknown): RefusalReason | null {
  if (!(error instanceof ClientResponseError) || error.status !== 400) return null;
  const data = (error.response?.data ?? {}) as Record<string, { code?: string }>;
  for (const problem of Object.values(data)) {
    const code = problem?.code;
    if (code === "status_step" || code === "status_alone") return "status_changed";
    if (code && (HOOK_CODES as readonly string[]).includes(code)) return code as RefusalReason;
  }
  return null;
}

/** A refusal with no hook code: reload and infer (Gap 16). */
async function explain(pb: PocketBase, eventId: string, body: Record<string, unknown>): Promise<EventChangeResult> {
  try {
    const event = await pb.collection("events").getOne(eventId, { requestKey: null });
    if (event.status === "final") return { kind: "refused", reason: "final", event };
    if (typeof body.status === "string" && event.status !== body.status) return { kind: "refused", reason: "status_changed", event };
    if (body.deadline_ext_min !== undefined && event.status !== "live") return { kind: "refused", reason: "status_changed", event };
    return { kind: "refused", reason: "unknown", event };
  } catch (error) {
    return failureKind(error) === "not-sent" ? { kind: "not-sent" } : { kind: "refused", reason: "unknown" };
  }
}

/** Sends one change to an event (or creates a draft when `eventId` is null). */
export async function sendEventChange(pb: PocketBase, eventId: string | null, body: Record<string, unknown>): Promise<EventChangeResult> {
  try {
    const event = eventId === null ? await pb.collection("events").create(body, { requestKey: null }) : await pb.collection("events").update(eventId, body, { requestKey: null });
    return { kind: "saved", event };
  } catch (error) {
    if (failureKind(error) === "not-sent") return { kind: "not-sent" };
    const code = hookCode(error);
    if (code !== null && eventId !== null) {
      try {
        return { kind: "refused", reason: code, event: await pb.collection("events").getOne(eventId, { requestKey: null }) };
      } catch {
        return { kind: "refused", reason: code };
      }
    }
    if (code !== null) return { kind: "refused", reason: code };
    return eventId === null ? { kind: "refused", reason: "unknown" } : explain(pb, eventId, body);
  }
}

/** True when the stored event already holds every value the body sends. */
function holds(event: RecordModel, body: Record<string, unknown>): boolean {
  return Object.entries(body).every(([key, sent]) => {
    const stored = event[key];
    if (key.endsWith("_at")) return (sent === "" && stored === "") || (sent !== "" && stored !== "" && Date.parse(String(sent)) === parsePbDate(String(stored)).getTime());
    if (Array.isArray(sent)) return JSON.stringify([...(stored as string[])].sort()) === JSON.stringify([...sent].sort());
    return stored === sent;
  });
}

/**
 * Retry after NOT SENT: reload the event first; if it already holds the change, it was saved and
 * nothing is sent (a total extension, a status step and a field value are all safe to compare).
 */
export async function retryEventChange(pb: PocketBase, eventId: string, body: Record<string, unknown>): Promise<EventChangeResult> {
  try {
    const event = await pb.collection("events").getOne(eventId, { requestKey: null });
    if (holds(event, body)) return { kind: "already-saved" };
  } catch (error) {
    if (failureKind(error) === "not-sent") return { kind: "not-sent" };
  }
  return sendEventChange(pb, eventId, body);
}

/** The words for a refusal, as a banner title and message (ORG-02c, 04b, 05b, 06b). */
export function refusalCopy(reason: RefusalReason, event?: RecordModel): { title: string; message: string } {
  const deadline = event && String(event.submit_deadline ?? "") !== "" ? formatClubTime(parsePbDate(String(event.submit_deadline))) : null;
  switch (reason) {
    case "open_incomplete":
      return { title: "Not opened", message: "Something on the checklist isn't done yet. Fix it, then open." };
    case "close_too_early":
      return { title: "Not closed", message: deadline ? `The final deadline is ${deadline}. You can close once it has passed.` : "The final deadline hasn't passed yet." };
    case "finalize_pending":
      return { title: "Not finalized", message: "A catch is still pending. Every catch must be judged first." };
    case "ext_lower": {
      const hours = event ? Math.round(Number(event.deadline_ext_min) / 60) : null;
      return { title: "Not changed", message: hours !== null ? `The extension was already raised to ${hours} h. It can only go up.` : "The extension can only go up." };
    }
    case "ext_not_hours":
      return { title: "Not changed", message: "The extension is set in whole hours." };
    case "ends_at_earlier":
      return { title: "Not saved", message: "The end of the fishing window can only move later." };
    case "ends_at_window_closed":
      return { title: "Not saved", message: "Fishing has ended, so the end of the window can't move now." };
    case "judge_is_backup":
      return { title: "Not saved", message: "The judge and the backup judge must be different people." };
    case "judge_not_organizer":
      return { title: "Not saved", message: "Only an organizer can be the judge." };
    case "backup_required":
      return { title: "Not saved", message: "A tournament that's open or closed needs a backup judge." };
    case "status_changed":
      return { title: "It changed on another device", message: event ? `The tournament is now ${String(event.status)}. Here's what it looks like now.` : "Reload to see where it stands now." };
    case "final":
      return { title: "The tournament is final", message: "Nothing can change after finalize." };
    case "nothing_changed":
      return { title: "Nothing to save", message: "Nothing was changed." };
    case "unknown":
      return { title: "Not accepted", message: "The change wasn't accepted. Go back and check the tournament." };
  }
}

export interface ManageRecords {
  me: string;
  nowMs: number;
  event: RecordModel;
  entries: readonly RecordModel[];
  /** The event's pending catches (id, entry). */
  pending: readonly RecordModel[];
  users: readonly RecordModel[];
  species: readonly RecordModel[];
}

function windowText(event: RecordModel): string {
  const starts = dateOf(event.starts_at);
  const ends = dateOf(event.ends_at);
  if (!starts || !ends) return "Not set yet";
  return `${formatClubTime(starts)} – ${formatClubTime(ends)}`;
}

/** Manage from the records. Pure. */
export function manageFromRecords(input: ManageRecords): ManageData {
  const { event } = input;
  const status = statusOf(event.status);
  const submitDeadline = dateOf(event.submit_deadline);
  const endsAt = dateOf(event.ends_at);
  const ext = Number(event.deadline_ext_min) || 0;
  const people = input.users
    .map((user): Person => ({ id: user.id, name: String(user.name ?? ""), organizer: user.role === "organizer" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const person = (id: unknown) => people.find((candidate) => candidate.id === id) ?? null;
  const judge = person(event.judge);
  const backupJudge = person(event.backup_judge);
  const species = input.species
    .map((record) => ({ id: record.id, name: speciesLabel(String(record.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set((event.species as string[] | undefined) ?? []);
  const speciesNames = species.filter((item) => chosen.has(item.id)).map((item) => item.name);
  const metric = event.metric === "length" ? "length" : "weight";
  const checklist = openChecklist(event);

  const anglerOf = new Map(input.entries.map((entry) => [entry.id, String(entry.angler ?? "")]));
  const judgeOwn = input.pending.filter((record) => anglerOf.get(String(record.entry)) === event.judge).length;

  const facts = [
    { label: "Name", value: String(event.name ?? "") },
    { label: "Fishing window", value: windowText(event) },
    {
      label: "Final deadline",
      value: submitDeadline ? `${formatClubTime(submitDeadline)}${ext > 0 ? ` · extended by ${ext / 60} h` : ""}` : "Set once the end is set",
    },
    { label: "Counts", value: `Best ${Number(event.best_n) || 10} by ${metric}` },
    { label: "Species", value: speciesNames.length === 0 ? "None chosen yet" : speciesNames.map((name, i) => (i === 0 ? name : name.toLowerCase())).join(", ") },
    { label: "Judge", value: judge?.name ?? "Not chosen yet" },
    { label: "Backup judge", value: backupJudge?.name ?? "Not chosen yet" },
    { label: "Code word", value: event.code_word_on ? `On · ${String(event.code_word ?? "") || "not set"}` : "Off" },
  ];

  return {
    eventId: event.id,
    name: String(event.name ?? ""),
    status,
    phase: managePhase(status, submitDeadline, input.nowMs),
    facts,
    checklist,
    canOpen: status === "draft" && checklist.every((item) => item.done),
    endsAt,
    submitDeadline,
    deadlineExtMin: ext,
    windowOpen: endsAt === null || input.nowMs <= endsAt.getTime(),
    counts: {
      entries: input.entries.filter((entry) => entry.withdrawn !== true).length,
      pending: input.pending.length,
      pendingForJudge: input.pending.length - judgeOwn,
      pendingForBackup: judgeOwn,
    },
    judge,
    backupJudge,
    people,
    species,
    form: eventFormFromRecord(event),
  };
}

/** Reads Manage as the organizer: the event, its entries (R-ENT-L-05), pending catches, people, species. */
export async function loadManage(pb: PocketBase, eventId: string, me: string, nowMs: number): Promise<ManageData> {
  const [event, entries, pending, users, species] = await Promise.all([
    pb.collection("events").getOne(eventId, { requestKey: null }),
    pb.collection("entries").getFullList({ filter: pb.filter("event = {:event}", { event: eventId }), fields: "id,angler,withdrawn", requestKey: null }),
    pb.collection("catches").getFullList({ filter: pb.filter('entry.event = {:event} && status = "pending"', { event: eventId }), fields: "id,entry", requestKey: null }),
    pb.collection("users").getFullList({ fields: "id,name,role", requestKey: null }),
    pb.collection("species").getFullList({ requestKey: null }),
  ]);
  // A draft's entries are hidden from everyone by the entries rule (R-ENT-L-05), so a draft counts none.
  return manageFromRecords({ me, nowMs, event, entries, pending, users, species });
}

/** The form's pickers and species for a new tournament (ORG-02a), without an event. */
export async function loadNewEventOptions(pb: PocketBase): Promise<Pick<ManageData, "people" | "species">> {
  const [users, species] = await Promise.all([
    pb.collection("users").getFullList({ fields: "id,name,role", requestKey: null }),
    pb.collection("species").getFullList({ requestKey: null }),
  ]);
  return {
    people: users.map((user) => ({ id: user.id, name: String(user.name ?? ""), organizer: user.role === "organizer" })).sort((a, b) => a.name.localeCompare(b.name)),
    species: species.map((record) => ({ id: record.id, name: speciesLabel(String(record.name)) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A species name as stored: lower case, single spaces ("Lake  Trout " → "lake trout"). */
export function normalizeSpecies(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type SpeciesResult = { kind: "saved"; id: string; name: string } | { kind: "duplicate"; existing: string } | { kind: "invalid" } | { kind: "not-sent" } | { kind: "not-accepted" };

/** Adds a species (R-SPC-C-01); a name that exists, ignoring case and spaces, is refused (ORG-10b). */
export async function addSpecies(pb: PocketBase, rawName: string, existing: readonly { name: string }[]): Promise<SpeciesResult> {
  const name = normalizeSpecies(rawName);
  if (name === "") return { kind: "invalid" };
  const clash = existing.find((item) => normalizeSpecies(item.name) === name);
  if (clash) return { kind: "duplicate", existing: clash.name };
  try {
    const created = await pb.collection("species").create({ name }, { requestKey: null });
    return { kind: "saved", id: created.id, name: speciesLabel(String(created.name)) };
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 400) {
      const data = (error.response?.data ?? {}) as Record<string, { code?: string }>;
      if (data.name?.code === "validation_not_unique") return { kind: "duplicate", existing: speciesLabel(name) };
      if (data.name) return { kind: "invalid" };
    }
    const kind = failureKind(error);
    return kind === "not-sent" ? { kind: "not-sent" } : { kind: "not-accepted" };
  }
}

/**
 * Retry a new draft after NOT SENT: a create has no idempotency key, so look for a draft with this
 * exact name first (only organizers can read drafts); if one is there, the first send landed.
 */
export async function retryCreateDraft(pb: PocketBase, body: Record<string, unknown>): Promise<EventChangeResult> {
  try {
    const found = await pb.collection("events").getList(1, 1, {
      filter: pb.filter('status = "draft" && name = {:name}', { name: String(body.name ?? "") }),
      sort: "-id",
      requestKey: null,
    });
    const event = found.items[0];
    if (event) return { kind: "saved", event };
  } catch (error) {
    if (failureKind(error) === "not-sent") return { kind: "not-sent" };
  }
  return sendEventChange(pb, null, body);
}
