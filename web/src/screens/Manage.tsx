// ORG-01 Manage tournament (Figma 90:4614 draft, 91:4796 live, 91:4887 past the final deadline,
// 92:4829 closed, 92:4941 final; Desktop 226:3665): the organizer's lifecycle view of one
// tournament, with the Open, Close and Finalize sheets (91:4675, ORG-05a to c, ORG-06a to c).
// The counts update live (Gap 25: useLive); everything else is read with them. Preconditions show
// as text, never as a silently disabled button (P11).

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Checklist, ExportCard, Note, StatTile } from "../components/organizer";
import { ActionBar, Banner, Button, Icon, ListLink, LiveBadge, NavBar, Overlay, Sheet, SwitchRow } from "../components/ui";
import { draftAction, loadManage, refusalCopy, retryEventChange, sendEventChange, type EventChangeResult, type ManageData } from "../lib/eventAdmin";
import { buildExports, loadExportData, type ExportFile, type ExportKind } from "../lib/exports";
import { formatClubTime } from "../lib/format";
import { pb } from "../lib/pb";
import { serverNowMs } from "../lib/serverClock";
import { useBreakpoint } from "../lib/useBreakpoint";
import { useLive } from "../lib/useLive";
import { useLiveRef } from "../lib/useLiveRef";

interface Props {
  eventId: string;
  me: string;
  /** Back to the tournament page. */
  onBack: () => void;
  onEdit: (data: ManageData) => void;
  onExtend: (data: ManageData) => void;
  onEntries: () => void;
  onExports: () => void;
  /** ORG-06b: the judge queue (the Judge tab). */
  onJudgeQueue: () => void;
  /** After a status change landed: the rest of the app reloads the tournament. */
  onChanged: () => void;
  /** What the screen that sent us back saved (the form, Extend), shown once. */
  saved?: string | null;
}

type Step = "open" | "close" | "finalize";

export function Manage({ eventId, me, onBack, onEdit, onExtend, onEntries, onExports, onJudgeQueue, onChanged, saved = null }: Props) {
  // A change restarts the live read, so the page shows the new status at once.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => {
    void version; // a new version is a new `load`, which restarts the live read (useLive)
    return loadManage(pb, eventId, me, serverNowMs());
  }, [eventId, me, version]);
  const live = useLive(load);
  const data = live.data?.eventId === eventId ? live.data : undefined;
  const [step, setStep] = useState<Step | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; message: string } | null>(saved ? { tone: "success", title: "Saved", message: saved } : null);

  useEffect(() => {
    document.title = `Manage${data ? ` · ${data.name}` : ""} · Streiff Seas`;
  }, [data]);

  function done(result: EventChangeResult, what: Step) {
    setStep(null);
    setVersion((n) => n + 1);
    if (result.kind === "saved" || result.kind === "already-saved") {
      const word = { open: "open", close: "closed", finalize: "final" }[what];
      setNotice({ tone: "success", title: "Saved", message: `The tournament is ${word}${result.kind === "already-saved" ? " (it had already been saved)" : ""}.` });
      onChanged();
    } else if (result.kind === "refused") {
      setNotice({ tone: "danger", ...refusalCopy(result.reason, result.event) });
    }
  }

  return (
    <div className="screen screen-wide">
      <NavBar title="Manage" backLabel="Back" backName="Back to Tournament" onBack={onBack} />
      <div className="screen-content org-content">
        {!data && <p className="t-body t-secondary">{live.badge.kind === "reconnecting" ? "Loading…" : "Couldn't load the tournament."}</p>}
        {notice && (
          <Banner tone={notice.tone} title={notice.title}>
            {notice.message}
          </Banner>
        )}
        {data && <ManageBody data={data} badge={<LiveBadge state={live.badge} />} onEdit={() => onEdit(data)} onExtend={() => onExtend(data)} onEntries={onEntries} onExports={onExports} />}
      </div>
      {data && <ManageActions data={data} onEdit={() => onEdit(data)} onStep={(next) => { setNotice(null); setStep(next); }} />}
      {data && step && <StepSheet step={step} data={data} onCancel={() => setStep(null)} onDone={(result) => done(result, step)} onJudgeQueue={onJudgeQueue} />}
    </div>
  );
}

interface BodyProps {
  data: ManageData;
  badge: ReactNode;
  onEdit: () => void;
  onExtend: () => void;
  onEntries: () => void;
  onExports: () => void;
}

function Facts({ data, labels }: { data: ManageData; labels?: readonly string[] }) {
  const shown = labels ? labels.map((label) => data.facts.find((fact) => fact.label === label) ?? { label, value: label === "Outage extension" ? extension(data) : "" }) : data.facts;
  return (
    <dl className="card card-sunken t-callout manage-facts">
      {shown.map((fact) => (
        <div key={fact.label} className="fact">
          <dt className="t-secondary">{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const extension = (data: ManageData) => (data.deadlineExtMin > 0 ? `${data.deadlineExtMin / 60} h` : "None");
const LIVE_FACTS = ["Fishing window", "Final deadline", "Outage extension", "Code word"] as const;

function ManageBody({ data, badge, onEdit, onExtend, onEntries, onExports }: BodyProps) {
  const deadline = data.submitDeadline ? formatClubTime(data.submitDeadline) : "the final deadline";
  switch (data.phase) {
    case "draft":
      return (
        <>
          <Banner tone="info" title="Draft">
            Only you can see this tournament. Members see it once you open it.
          </Banner>
          <Facts data={data} />
          <Checklist items={data.checklist} onFix={onEdit} />
          <div className="list-links">
            <ListLink icon="/icons/edit-link.svg" title="Edit draft" detail="Every field, until you open it" onClick={onEdit} />
          </div>
        </>
      );
    case "live:open":
    case "live:over":
      return (
        <>
          <section className="org-section" aria-labelledby="counts-heading">
            <div className="manage-counts-head">
              <h2 id="counts-heading" className="t-headline">
                Right now
              </h2>
              {badge}
            </div>
            <div className="stat-tiles">
              <StatTile value={data.counts.entries} label={data.counts.entries === 1 ? "entry" : "entries"} />
              <StatTile value={data.counts.pending} label={data.counts.pending === 1 ? "pending catch" : "pending catches"} />
            </div>
          </section>
          <Facts data={data} labels={LIVE_FACTS} />
          {data.phase === "live:open" ? (
            <Note icon="/icons/clock-neutral.svg">You can close the tournament after the final deadline, {deadline}.</Note>
          ) : (
            <Note icon="/icons/clock-neutral.svg">The final deadline passed {deadline}. Close the tournament, or extend the deadline after an outage (this reopens joining and submitting).</Note>
          )}
          <div className="list-links">
            <ListLink icon="/icons/edit-link.svg" title="Edit live details" detail={data.windowOpen ? "Name, code word, backup judge, end time" : "Name, code word, backup judge"} onClick={onEdit} />
            <ListLink icon="/icons/clock-neutral.svg" title="Extend final deadline" detail={data.deadlineExtMin > 0 ? `Extended by ${extension(data)} · after an outage, in whole hours` : "After an outage, in whole hours"} onClick={onExtend} />
            <ListLink icon="/icons/person-tab.svg" title="Entries" detail={`${data.counts.entries} ${data.counts.entries === 1 ? "entry" : "entries"}`} onClick={onEntries} />
          </div>
        </>
      );
    case "closed":
      return (
        <>
          <Banner tone="warning" title="Closed">
            No more joining or submissions. Judging carries on until you finalize.
          </Banner>
          <section className="org-section" aria-labelledby="left-heading">
            <div className="manage-counts-head">
              <h2 id="left-heading" className="t-headline">
                Left to judge
              </h2>
              {badge}
            </div>
            <div className="stat-tiles">
              <StatTile value={data.counts.pendingForJudge} label={`for the judge${data.judge ? `, ${data.judge.name}` : ""}`} />
              <StatTile value={data.counts.pendingForBackup} label={`for the backup judge${data.backupJudge ? `, ${data.backupJudge.name}` : ""}`} />
            </div>
          </section>
          <Previews eventId={data.eventId} />
          <div className="list-links">
            <ListLink icon="/icons/edit-link.svg" title="Change the backup judge" detail="The only change once closed" onClick={onEdit} />
            <ListLink icon="/icons/person-tab.svg" title="Entries" detail={`${data.counts.entries} ${data.counts.entries === 1 ? "entry" : "entries"}`} onClick={onEntries} />
          </div>
        </>
      );
    case "final":
      return (
        <>
          <Banner tone="neutral" title="Final">
            Results are final: nothing can change. Photos show "Photo archived".
          </Banner>
          <Facts data={data} labels={LIVE_FACTS} />
          <div className="list-links">
            <ListLink icon="/icons/upload-link.svg" title="Exports" detail="Results and audit CSV, each with its SHA-256" onClick={onExports} />
            <ListLink icon="/icons/person-tab.svg" title="Entries" detail="Read only" onClick={onEntries} />
          </div>
        </>
      );
  }
}

/** ORG-01d: an unhashed preview of each file while closed, to check before finalizing (Gap 15). */
function Previews({ eventId }: { eventId: string }) {
  const [files, setFiles] = useState<Record<ExportKind, ExportFile> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    loadExportData(pb, eventId)
      .then(buildExports)
      .then((built) => current && setFiles(built))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [eventId]);
  return (
    <section className="org-section" aria-labelledby="preview-heading">
      <h2 id="preview-heading" className="t-headline">
        Check the files before you finalize
      </h2>
      {failed && <p className="t-callout t-secondary">Couldn't build the previews. Come back to try again.</p>}
      {!files && !failed && <p className="t-callout t-secondary">Building the previews…</p>}
      {files && (
        <>
          <ExportCard title="Results CSV" file={files.results} preview />
          <ExportCard title="Audit CSV" file={files.audit} preview />
        </>
      )}
    </section>
  );
}

function ManageActions({ data, onEdit, onStep }: { data: ManageData; onEdit: () => void; onStep: (step: Step) => void }) {
  const draft = draftAction(data);
  if (draft) {
    return (
      <ActionBar>
        <Button variant="primary" large onClick={draft.kind === "open" ? () => onStep("open") : onEdit}>
          {draft.label}
        </Button>
      </ActionBar>
    );
  }
  if (data.phase === "live:over") {
    return (
      <ActionBar>
        <Button variant="destructive" large onClick={() => onStep("close")}>
          Close tournament
        </Button>
      </ActionBar>
    );
  }
  if (data.phase === "closed") {
    return (
      <ActionBar>
        <Button variant="destructive" large onClick={() => onStep("finalize")}>
          Finalize tournament
        </Button>
      </ActionBar>
    );
  }
  return null;
}

type Phase = "form" | "sending" | "not-sent";

const STATUS_FOR: Record<Step, string> = { open: "live", close: "closed", finalize: "final" };

interface StepSheetProps {
  step: Step;
  data: ManageData;
  onCancel: () => void;
  onDone: (result: EventChangeResult) => void;
  onJudgeQueue: () => void;
}

/** The Open, Close and Finalize confirmations, their NOT SENT state and Finalize: blocked (ORG-06b). */
function StepSheet({ step, data, onCancel, onDone, onJudgeQueue }: StepSheetProps) {
  const wide = useBreakpoint() !== "compact";
  const [phase, setPhase] = useState<Phase>("form");
  const [checked, setChecked] = useState(false);
  const live = useLiveRef();
  const blocked = step === "finalize" && data.counts.pending > 0;
  const body = { status: STATUS_FOR[step] };

  async function go() {
    const retry = phase === "not-sent";
    setPhase("sending");
    const result = retry ? await retryEventChange(pb, data.eventId, body) : await sendEventChange(pb, data.eventId, body);
    if (!live.current) return;
    if (result.kind === "not-sent") setPhase("not-sent");
    else onDone(result);
  }

  const busy = phase === "sending";
  const title = blocked ? "Can't finalize yet" : `${{ open: "Open", close: "Close", finalize: "Finalize" }[step]} ${data.name}?`;
  const points: { icon: string; text: string }[] = {
    open: [
      { icon: "/icons/person-tab.svg", text: "Members see it and can join. The judge and backup judge are already entered." },
      { icon: "/icons/clock-neutral.svg", text: `Fishing runs ${data.facts.find((fact) => fact.label === "Fishing window")?.value ?? ""}.` },
      { icon: "/icons/lock-secondary-24.svg", text: "Metric, best N, species, start time and judge lock once it's open." },
    ],
    close: [
      { icon: "/icons/lock-secondary-24.svg", text: "No more joining or submissions, and anglers can't edit or retract." },
      { icon: "/icons/judge.svg", text: `Judging carries on until you finalize. ${data.counts.pending} ${data.counts.pending === 1 ? "catch is" : "catches are"} pending.` },
    ],
    finalize: [
      { icon: "/icons/lock-secondary-24.svg", text: "Catches, entries and the tournament lock. Nothing can change after this." },
      { icon: "/icons/leaderboard.svg", text: "Board names freeze as they are now." },
      { icon: "/icons/archive.svg", text: 'Every photo shows "Photo archived".' },
      { icon: "/icons/list.svg", text: "Next: exports, the post-finalize backup, then the photo archive." },
    ],
  }[step];

  const content = blocked ? (
    <div className="form-body">
      <p className="t-callout">Every pending catch must be judged first. Retracted catches don't count.</p>
      <div className="stat-tiles">
        <StatTile value={data.counts.pendingForJudge} label={`for the judge${data.judge ? `, ${data.judge.name}` : ""}`} />
        <StatTile value={data.counts.pendingForBackup} label={`for the backup judge${data.backupJudge ? `, ${data.backupJudge.name}` : ""}`} />
      </div>
      {data.counts.pendingForBackup > 0 && <Note>The backup judge clears the judge's own catches. Message them in the group chat.</Note>}
    </div>
  ) : (
    <div className="form-body">
      {phase === "not-sent" && (
        <Banner tone="danger" title="NOT SENT">
          The change didn't reach the club. Retry checks the tournament first, so it never happens twice.
        </Banner>
      )}
      <ul className="sheet-points t-callout">
        {points.map((point) => (
          <li key={point.text}>
            <Icon src={point.icon} size={24} />
            <span>{point.text}</span>
          </li>
        ))}
      </ul>
      {step === "finalize" && (
        <SwitchRow id="finalize-checked" label="I've checked the standings" detail="This can't be undone." checked={checked} disabled={busy || phase === "not-sent"} onChange={setChecked} />
      )}
    </div>
  );

  const action = blocked ? (
    <Button variant="primary" large={!wide} full={wide} onClick={onJudgeQueue}>
      Open the judge queue
    </Button>
  ) : (
    <Button
      variant={step === "open" ? "primary" : "destructive"}
      large={!wide}
      loading={busy}
      loadingLabel="Sending…"
      disabled={step === "finalize" && !checked}
      onClick={() => void go()}
    >
      {phase === "not-sent" ? "Retry" : { open: "Open tournament", close: "Close tournament", finalize: "Finalize tournament" }[step]}
    </Button>
  );

  if (wide) {
    return (
      <Overlay
        kind="dialog"
        title={title}
        onClose={busy ? undefined : onCancel}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            {action}
          </>
        }
      >
        {content}
      </Overlay>
    );
  }
  return (
    <Sheet title={title} onCancel={busy ? undefined : onCancel} footer={action}>
      {content}
    </Sheet>
  );
}
