// ORG-08 Entries and ORG-09 Withdraw or reinstate an angler (Figma Flow 9b 95:5863, 96:6079,
// 96:6161, 134:9963; Desktop 227:4451, 227:4629): every entry in the tournament, withdrawn ones
// included, for the organizer. Withdrawing someone else needs a reason they will see; the
// organizer's own entry needs none (R-ENT-U-07, U-08, U-13); reinstating needs none (U-09).
// Opened from the tournament page until ORG-01 Manage tournament exists (S4). Read when it opens
// and after each change; it isn't live (Gap 25).

import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, LockedField, NavBar, Overlay, Sheet, TextAreaField } from "../components/ui";
import { loadEntries, retryEntryWithdrawn, setEntryWithdrawn, type EntriesData, type EntryChangeResult, type EntryRow } from "../lib/entriesAdmin";
import { pb } from "../lib/pb";
import { useBreakpoint } from "../lib/useBreakpoint";

interface Props {
  eventId: string;
  me: string;
  onBack: () => void;
}

type Phase = "form" | "sending" | "not-sent" | "not-accepted";

export function Entries({ eventId, me, onBack }: Props) {
  const [data, setData] = useState<EntriesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<EntryRow | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      setData(await loadEntries(pb, eventId, me));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [eventId, me]);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    document.title = `Entries${data ? ` · ${data.eventName}` : ""} · Chromie Fishing`;
  }, [data]);

  return (
    <div className="screen screen-wide">
      <NavBar title="Entries" backLabel="Back" backName="Back to Tournament" onBack={onBack} />
      <div className="screen-content entries-content">
        {failed && !data && (
          <Banner tone="danger" title="Couldn't load the entries">
            Check your signal and go back to try again.
          </Banner>
        )}
        {!data && !failed && <p className="t-body t-secondary">Loading…</p>}
        {data && (
          <>
            <p className="t-footnote t-secondary">
              {data.rows.length} {data.rows.length === 1 ? "entry" : "entries"} · {data.withdrawnCount} withdrawn · {data.eventName}
            </p>
            {saved && (
              <Banner tone="success" title="Saved">
                {saved}
              </Banner>
            )}
            {data.final && (
              <Banner tone="neutral" title="Final">
                Results are final, so entries can't change.
              </Banner>
            )}
            <ul className="entry-list" aria-label="Entries">
              {data.rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`entry-row${row.isYou ? " is-you" : ""}`}
                    disabled={data.final}
                    aria-label={`${row.name}${row.isYou ? ", you" : ""}${row.role ? `, ${row.role}` : ""}${row.withdrawn ? ", withdrawn" : ""}. ${row.withdrawn ? "Reinstate" : "Withdraw"}`}
                    onClick={() => {
                      setSaved(null);
                      setTarget(row);
                    }}
                  >
                    <span className="entry-row-body">
                      <span className="entry-row-name">
                        <span className="t-headline">
                          {row.name}
                          {row.isYou && " (you)"}
                        </span>
                        {row.withdrawn && (
                          <span className="status-chip status-chip-neutral t-footnote-strong">
                            <Icon src="/icons/archive-neutral.svg" size={16} />
                            Withdrawn
                          </span>
                        )}
                      </span>
                      <span className="t-footnote t-secondary">
                        {row.detail}
                        {row.withdrawnLine && ` · ${row.withdrawnLine}`}
                      </span>
                      {row.reason && <span className="t-footnote">Reason: {row.reason}</span>}
                    </span>
                    {!data.final && <Icon src="/icons/chevron-right.svg" size={24} />}
                  </button>
                </li>
              ))}
            </ul>
            <p className="entries-note t-footnote t-secondary">
              <Icon src="/icons/info.svg" size={24} />
              <span>Members join from the tournament page. Entries are never deleted.</span>
            </p>
          </>
        )}
      </div>
      {target && (
        <EntryChange
          row={target}
          onClose={() => setTarget(null)}
          onDone={(message) => {
            setTarget(null);
            setSaved(message);
            void read();
          }}
        />
      )}
    </div>
  );
}

/** ORG-09a withdraw (with a reason unless it's your own entry), ORG-09b reinstate, ORG-09c NOT SENT. */
function EntryChange({ row, onClose, onDone }: { row: EntryRow; onClose: () => void; onDone: (message: string) => void }) {
  const wide = useBreakpoint() === "expanded";
  const withdrawing = !row.withdrawn;
  const needsReason = withdrawing && !row.isYou;
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const first = row.isYou ? "You" : row.name.split(" ")[0];
  const title = withdrawing ? (row.isYou ? "Withdraw your entry?" : `Withdraw ${row.name}?`) : `Reinstate ${row.name}?`;

  async function go(retry: boolean) {
    setTried(true);
    if (needsReason && reason.trim() === "") return;
    setPhase("sending");
    const result: EntryChangeResult = retry ? await retryEntryWithdrawn(pb, row.id, withdrawing, reason) : await setEntryWithdrawn(pb, row.id, withdrawing, reason);
    if (!live.current) return;
    if (result.kind === "saved" || result.kind === "already-saved") {
      onDone(`${withdrawing ? `${row.name} is withdrawn` : `${row.name} is back in`}${result.kind === "already-saved" ? " (it had already been saved)" : ""}.`);
    } else setPhase(result.kind);
  }

  const busy = phase === "sending";
  const locked = phase === "not-sent" || (busy && tried);
  const body = (
    <div className="form-body">
      {phase === "not-sent" && (
        <Banner tone="danger" title="NOT SENT">
          The change didn't reach the club. Retry checks the entry first, so it is never changed twice.
        </Banner>
      )}
      {phase === "not-accepted" && (
        <Banner tone="danger" title="Not accepted">
          The entry may have changed, or the tournament is final. Close and look again.
        </Banner>
      )}
      {withdrawing ? (
        <ul className="sheet-points t-callout">
          <li>
            <Icon src="/icons/leaderboard.svg" size={24} />
            <span>{first === "You" ? "You're" : `${first} is`} taken off the leaderboard.</span>
          </li>
          <li>
            <Icon src="/icons/archive.svg" size={24} />
            <span>The entry and catches are kept; pending catches are still judged.</span>
          </li>
          {!row.isYou && (
            <li>
              <Icon src="/icons/person-tab.svg" size={24} />
              <span>{first} sees your reason and can't rejoin on their own. You can reinstate them.</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="t-callout">
          {row.withdrawnLine}
          {row.reason ? `: “${row.reason}”` : "."} Reinstating puts {row.name} back on the leaderboard; their verified fish count again.
        </p>
      )}
      {needsReason &&
        (locked ? (
          <LockedField label="Reason" value={reason.trim()} note="Locked until sent" />
        ) : (
          <TextAreaField
            id="withdraw-reason"
            label="Reason (required)"
            help={`${first} will see this on the tournament page.`}
            error={tried && reason.trim() === "" ? "Say why, in words." : null}
            value={reason}
            onValueChange={setReason}
          />
        ))}
    </div>
  );
  const action = (
    <Button variant={withdrawing ? "destructive" : "primary"} large={!wide} loading={busy} loadingLabel="Sending…" onClick={() => void go(phase === "not-sent")}>
      {phase === "not-sent" ? "Retry" : withdrawing ? (row.isYou ? "Withdraw" : `Withdraw ${row.name.split(" ")[0]}`) : "Reinstate"}
    </Button>
  );
  if (wide) {
    return (
      <Overlay
        kind="dialog"
        title={title}
        onClose={busy ? undefined : onClose}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            {action}
          </>
        }
      >
        {body}
      </Overlay>
    );
  }
  return (
    <Sheet title={title} onCancel={busy ? undefined : onClose} footer={action}>
      {body}
    </Sheet>
  );
}
