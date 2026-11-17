// ORG-08 Entries and ORG-09 Withdraw or reinstate an angler: the organizer's view of one
// tournament's entries, from the server. No DOM: the tests run it against a real PocketBase.
//
// Reads: the entries list rule's organizer branch (R-ENT-L-05: every entry outside a draft,
// withdrawn ones included), the users list rule's organizer branch for who withdrew someone
// (R-USR-L-03), and the entries' audit rows for when (R-AUD-L-04). Writes: the entries update
// rule's organizer branch (R-ENT-U-07 to U-09, U-13, U-14); the withdraw hook sets withdrawn_by
// and writes the withdraw or rejoin row. Opened from the tournament page until ORG-01 Manage
// tournament exists (S4; decisions.md 2026-11-17).

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { formatClubTime } from "./format";
import { parsePbDate } from "./liveBoard";
import { failureKind } from "./sendCatch";

export interface EntryRow {
  id: string;
  name: string;
  isYou: boolean;
  role?: "Judge" | "Backup judge";
  withdrawn: boolean;
  /** "Joined Jul 2, 9:14 AM", "Judge · entered when created". */
  detail: string;
  /** "Withdrawn Jul 9, 4:02 PM by Kayden R." and the reason, when withdrawn. */
  withdrawnLine?: string;
  reason?: string;
  /** Withdrawn by the angler themself (they may rejoin) or by the organizer. */
  withdrawnBySelf: boolean;
}

export interface EntriesData {
  eventId: string;
  eventName: string;
  final: boolean;
  /** You first, then the judge and backup judge, then everyone by when they joined. */
  rows: EntryRow[];
  withdrawnCount: number;
}

export interface EntriesRecords {
  me: string;
  event: RecordModel;
  entries: readonly RecordModel[];
  /** Names by user id, for withdrawn_by. */
  names: ReadonlyMap<string, string>;
  /** The entries' withdraw rows, any order. */
  withdrawRows: readonly RecordModel[];
}

/** The page from the records. Pure. */
export function entriesFromRecords(input: EntriesRecords): EntriesData {
  const { me, event } = input;
  const order = (row: EntryRow) => (row.isYou ? 0 : row.role === "Judge" ? 1 : row.role === "Backup judge" ? 2 : 3);
  const rows = input.entries.map((entry): EntryRow => {
    const angler = String(entry.angler);
    const role = angler === event.judge ? "Judge" : angler === event.backup_judge ? "Backup judge" : undefined;
    const joined = parsePbDate(String(entry.created));
    const withdrawn = entry.withdrawn === true;
    const by = String(entry.withdrawn_by ?? "");
    const row = input.withdrawRows.filter((r) => r.target_id === entry.id && r.action === "withdraw").sort((a, b) => String(a.created).localeCompare(String(b.created))).at(-1);
    const byName = by === me ? "you" : (input.names.get(by) ?? (by === angler ? String(entry.display_name) : "the organizer"));
    return {
      id: entry.id,
      name: String(entry.display_name ?? "") || "—",
      isYou: angler === me,
      ...(role && { role }),
      withdrawn,
      detail: role ? `${role} · entered when created` : `Joined ${formatClubTime(joined)}`,
      ...(withdrawn && {
        withdrawnLine: `Withdrawn${row ? ` ${formatClubTime(parsePbDate(String(row.created)))}` : ""} by ${byName}`,
        ...(String(entry.withdraw_reason ?? "") !== "" && { reason: String(entry.withdraw_reason) }),
      }),
      withdrawnBySelf: withdrawn && by === angler,
    };
  });
  rows.sort((a, b) => order(a) - order(b));
  return {
    eventId: event.id,
    eventName: String(event.name),
    final: event.status === "final",
    rows,
    withdrawnCount: rows.filter((row) => row.withdrawn).length,
  };
}

export async function loadEntries(pb: PocketBase, eventId: string, me: string): Promise<EntriesData> {
  const [event, entries, withdrawRows] = await Promise.all([
    pb.collection("events").getOne(eventId, { requestKey: null }),
    pb.collection("entries").getFullList({ filter: pb.filter("event = {:event}", { event: eventId }), sort: "created", requestKey: null }),
    pb.collection("audit_log").getFullList({ filter: pb.filter('event = {:event} && action = "withdraw"', { event: eventId }), fields: "id,target_id,action,created", requestKey: null }),
  ]);
  const ids = [...new Set(entries.map((entry) => String(entry.withdrawn_by ?? "")).filter((id) => id !== ""))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const users = await pb.collection("users").getFullList({ filter: ids.map((id) => pb.filter("id = {:id}", { id })).join(" || "), fields: "id,name", requestKey: null });
    for (const user of users) names.set(user.id, String(user.name));
  }
  return entriesFromRecords({ me, event, entries, names, withdrawRows });
}

export type EntryChangeResult = { kind: "saved" } | { kind: "already-saved" } | { kind: "not-sent" } | { kind: "not-accepted" };

/** Withdraws (with a reason, unless it's the organizer's own entry) or reinstates one entry. */
export async function setEntryWithdrawn(pb: PocketBase, entryId: string, withdrawn: boolean, reason: string): Promise<EntryChangeResult> {
  try {
    const body: Record<string, unknown> = { withdrawn };
    if (withdrawn && reason.trim() !== "") body.withdraw_reason = reason.trim();
    await pb.collection("entries").update(entryId, body, { requestKey: null });
    return { kind: "saved" };
  } catch (error) {
    return { kind: failureKind(error) };
  }
}

/** Retry after NOT SENT (ORG-09c): reload the entry; if `withdrawn` already matches, it was saved. */
export async function retryEntryWithdrawn(pb: PocketBase, entryId: string, withdrawn: boolean, reason: string): Promise<EntryChangeResult> {
  try {
    const entry = await pb.collection("entries").getOne(entryId, { requestKey: null });
    if ((entry.withdrawn === true) === withdrawn) return { kind: "already-saved" };
  } catch (error) {
    return { kind: failureKind(error) };
  }
  return setEntryWithdrawn(pb, entryId, withdrawn, reason);
}
