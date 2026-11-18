// The Judge tab (S3; Figma Flow 7, Desktop 1440 · 3 Judging, Tablet JDG-01a): JDG-00 Judging home,
// JDG-01 queue, JDG-02 review, JDG-03 Reject, JDG-04 Correct, JDG-05 Change decision, each with its
// NOT SENT state. A phone pushes a page per step and rejects in a sheet; from 1024 px the queue and
// the review share the page, Reject and Change decision open as dialogs and Correct as a side panel.
//
// The queue updates live (useLive; Gap 25); the home and the review are read when they open and on
// focus. Every decision echoes the rev the review loaded (lib/judgeDecision.ts): a catch the angler
// changed meanwhile comes back reloaded with what changed (JDG-02b), never decided blind.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CatchStatusChip, LengthInput, SpeciesPicker, WeightInput } from "../components/catch";
import { DecisionSummary, QueueCard, ReviewBody } from "../components/judge";
import {
  ActionBar,
  Banner,
  Button,
  EmptyState,
  LargeNavBar,
  LiveBadge,
  LockedField,
  NavBar,
  Overlay,
  SegmentedToggle,
  Sheet,
  TextAreaField,
  type BannerTone,
} from "../components/ui";
import { editFields } from "../lib/changeCatch";
import { displayMeasurement } from "../lib/displayWeight";
import { formatClubTime } from "../lib/format";
import { retryDecision, sendDecision, type Decision, type DecisionResult } from "../lib/judgeDecision";
import { canDecide, loadReview, type ReviewData } from "../lib/judgeReview";
import { loadJudging, loadQueue, type JudgingSection, type QueueData, type QueueFilter } from "../lib/judging";
import { enteredLengthText, lengthEntryFromQ, parseLength } from "../lib/lengthEntry";
import { pb } from "../lib/pb";
import type { DisplayUnits } from "../lib/profile";
import { useBreakpoint } from "../lib/useBreakpoint";
import { useLive } from "../lib/useLive";
import { enteredWeightText, parseWeight, weightEntryFromHoz } from "../lib/weightEntry";
import { useLiveRef } from "../lib/useLiveRef";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

interface Notice {
  tone: BannerTone;
  title: string;
  message: string;
}

/** Which form is open, over the review: a sheet or dialog (reject, change decision), a page or panel (correct). */
type Form = "reject" | "correct" | "rejudge" | null;

interface Props {
  me: string;
  units: DisplayUnits;
  onTab: (tab: MemberTab) => void;
}

// ---------------------------------------------------------------------------------------------
// The flow.

export function JudgeFlow({ me, units, onTab }: Props) {
  const expanded = useBreakpoint() === "expanded";
  const [eventId, setEventId] = useState<string | null>(null);
  const [catchId, setCatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [form, setForm] = useState<Form>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [eventId, catchId, form]);

  if (!eventId) {
    return (
      <JudgeHome
        me={me}
        units={units}
        onTab={onTab}
        onOpenQueue={(id) => {
          setEventId(id);
          setFilter("pending");
          setCatchId(null);
        }}
        onOpenCatch={(id, catchToOpen) => {
          setEventId(id);
          setFilter("pending");
          setCatchId(catchToOpen);
        }}
      />
    );
  }
  return (
    <QueueFlow
      key={eventId}
      me={me}
      units={units}
      eventId={eventId}
      catchId={catchId}
      filter={filter}
      form={form}
      notice={notice}
      expanded={expanded}
      onFilter={(next) => {
        setFilter(next);
        if (expanded) setCatchId(null);
      }}
      onOpen={(id) => {
        setNotice(null);
        setForm(null);
        setCatchId(id);
      }}
      onBackToQueue={() => {
        setForm(null);
        setCatchId(null);
      }}
      onHome={() => {
        setEventId(null);
        setCatchId(null);
        setForm(null);
        setNotice(null);
      }}
      onForm={setForm}
      onNotice={setNotice}
      onTab={onTab}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// JDG-00 Judging home.

function JudgeHome({ me, units, onTab, onOpenQueue, onOpenCatch }: Props & { onOpenQueue: (eventId: string) => void; onOpenCatch: (eventId: string, catchId: string) => void }) {
  const [sections, setSections] = useState<JudgingSection[] | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    try {
      setSections(await loadJudging(pb, me, units));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [me, units]);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  useEffect(() => {
    document.title = "Judging · Chromie Fishing";
  }, []);

  const count = sections?.length ?? 0;
  return (
    <div className="screen tab-screen screen-wide">
      <LargeNavBar title="Judging" subtitle={sections ? `${count} ${count === 1 ? "tournament" : "tournaments"} · live and closed` : undefined} />
      <div className="screen-content judging-home">
        {sections === null ? (
          failed ? (
            <Banner tone="danger" title="Couldn't load">
              Check your signal; this page tries again when you come back to it.
            </Banner>
          ) : (
            <p className="t-body t-secondary">Loading…</p>
          )
        ) : sections.length === 0 ? (
          <EmptyState icon="/icons/list-large.svg" title="Nothing to judge" message="You aren't the judge or backup judge of a live or closed tournament." />
        ) : (
          sections.map((section) => (
            <section key={section.eventId} className="judging-section" aria-labelledby={`judging-${section.eventId}`}>
              <div className="judging-section-head">
                <h2 id={`judging-${section.eventId}`} className="t-title-section">
                  {section.name}
                </h2>
                <span className="role-tag t-footnote-strong">{section.role}</span>
              </div>
              <p className="t-callout-strong t-secondary">{section.pending === 0 ? "0 pending · Nothing to judge" : `${section.pending} pending · oldest first`}</p>
              {section.oldest.length > 0 && (
                <ul className="queue-list">
                  {section.oldest.map((item) => (
                    <li key={item.id}>
                      <QueueCard item={item} onClick={() => onOpenCatch(section.eventId, item.id)} />
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="secondary" full onClick={() => onOpenQueue(section.eventId)}>
                Open queue
              </Button>
            </section>
          ))
        )}
      </div>
      <div className="tab-screen-bottom">
        <MemberTabBar selected="judge" onSelect={onTab} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// JDG-01 queue, with JDG-02 beside it from 1024 px.

interface QueueFlowProps {
  me: string;
  units: DisplayUnits;
  eventId: string;
  catchId: string | null;
  filter: QueueFilter;
  form: Form;
  notice: Notice | null;
  expanded: boolean;
  onFilter: (filter: QueueFilter) => void;
  onOpen: (catchId: string) => void;
  onBackToQueue: () => void;
  onHome: () => void;
  onForm: (form: Form) => void;
  onNotice: (notice: Notice | null) => void;
  onTab: (tab: MemberTab) => void;
}

const FILTERS: readonly { id: QueueFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
];

function QueueFlow(props: QueueFlowProps) {
  const { me, units, eventId, catchId, filter, expanded } = props;
  const loadEventQueue = useCallback(() => loadQueue(pb, eventId, me, units), [eventId, me, units]);
  const live = useLive(loadEventQueue);
  const queue = live.data;
  const items = queue?.lists[filter] ?? [];
  // On a wide window the opened catch, else the first in the filter, sits beside the list.
  const selectedId = catchId ?? (expanded ? (items[0]?.id ?? null) : null);

  useEffect(() => {
    if (queue) document.title = `Judge queue · ${queue.eventName} · Chromie Fishing`;
  }, [queue]);

  if (!expanded && catchId) {
    return <ReviewScreen {...props} catchId={catchId} queue={queue} />;
  }

  const counts = queue ? `${queue.lists.pending.length} pending · oldest first` : "";
  const list =
    queue === undefined ? (
      <p className="t-body t-secondary">Loading the queue…</p>
    ) : items.length === 0 ? (
      <EmptyState
        icon="/icons/list-large.svg"
        title={filter === "pending" ? "Nothing pending" : `No ${filter} catches`}
        message={filter === "pending" ? "Decided catches are under Verified and Rejected." : "Catches you decide show up here, most recent first."}
      />
    ) : (
      <ul className="queue-list catch-split-list" aria-label={`${FILTERS.find((f) => f.id === filter)?.label} catches`}>
        {items.map((item) => (
          <li key={item.id}>
            <QueueCard item={item} selected={expanded && item.id === selectedId} onClick={() => props.onOpen(item.id)} />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="screen tab-screen screen-wide">
      <NavBar title="Judge queue" backLabel="Judging" backName="Back to Judging" onBack={props.onHome} />
      <div className="screen-content judge-queue">
        <div className="judge-queue-head">
          <p className="t-footnote t-secondary">
            {queue ? `${queue.eventName}${counts ? ` · ${counts}` : ""}` : ""}
            {queue && queue.role === "Backup judge" ? " · the judge's catches" : ""}
          </p>
          {queue && queue.eventStatus !== "final" && <LiveBadge state={live.badge} />}
        </div>
        {props.notice && !catchId && (
          <Banner tone={props.notice.tone} title={props.notice.title}>
            {props.notice.message}
          </Banner>
        )}
        {queue && queue.role === null && (
          <Banner tone="neutral" title="You don't judge this tournament">
            Only its judge and backup judge decide its catches.
          </Banner>
        )}
        {queue?.eventStatus === "final" && (
          <Banner tone="neutral" title="Final">
            Results are final; catches are read only.
          </Banner>
        )}
        <div className={expanded ? "catch-split judge-split" : "judge-queue-list"}>
          <div className="judge-queue-pane">
            <span id="queue-filter-label" className="visually-hidden">
              Show
            </span>
            <SegmentedToggle
              labelledBy="queue-filter-label"
              options={FILTERS.map((f) => ({ id: f.id, label: f.id === "pending" && queue ? `Pending · ${queue.lists.pending.length}` : f.label }))}
              selected={filter}
              onSelect={props.onFilter}
            />
            {list}
          </div>
          {expanded && selectedId && (
            <section className="catch-split-detail review-pane" aria-label="Selected catch">
              <ReviewPane key={selectedId} {...props} catchId={selectedId} queue={queue} />
            </section>
          )}
        </div>
      </div>
      <div className="tab-screen-bottom">
        <MemberTabBar selected="judge" onSelect={props.onTab} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// JDG-02 review: the decision logic shared by the phone page and the wide pane.

interface ReviewProps extends QueueFlowProps {
  catchId: string;
  queue: QueueData | undefined;
}

type Phase = { kind: "idle" } | { kind: "sending"; decision: Decision } | { kind: "not-sent"; decision: Decision };

function useReview({ me, units, catchId, onNotice, onForm, onBackToQueue, expanded }: ReviewProps) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const live = useLiveRef();

  const read = useCallback(async () => {
    try {
      const next = await loadReview(pb, catchId, me, units);
      if (live.current) {
        setData(next);
        setFailed(false);
      }
      return next;
    } catch {
      if (live.current) setFailed(true);
      return null;
    }
  }, [catchId, me, units]);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  async function decide(decision: Decision, retry: boolean) {
    if (!data) return;
    // A new decision replaces whatever the last one said.
    onNotice(null);
    setPhase({ kind: "sending", decision });
    const result = retry ? await retryDecision(pb, data.base, data.status, decision, me) : await sendDecision(pb, data.base, data.status, decision);
    if (!live.current) return;
    if (result.kind === "not-sent") {
      setPhase({ kind: "not-sent", decision });
      return;
    }
    setPhase({ kind: "idle" });
    onForm(null);
    const before = data;
    const after = await read();
    onNotice(noticeFor(result, decision, before, after));
    // On a phone a decision that landed goes back to the queue, which says what was done.
    if ((result.kind === "saved" || result.kind === "already-saved") && !expanded) onBackToQueue();
  }

  return { data, failed, phase, decide, cancelNotSent: () => setPhase({ kind: "idle" }) };
}

const DECISION_VERB: Record<Decision["kind"], string> = { approve: "Approved", reject: "Rejected", correct: "Corrected and approved", rejudge: "Decision changed" };

/** What the queue or the review says after a decision came back (JDG-01a after approve, 02b, 02c). */
function noticeFor(result: DecisionResult, decision: Decision, before: ReviewData, after: ReviewData | null): Notice {
  // A saved correction names the catch as it is now, at the corrected value.
  const now = (result.kind === "saved" || result.kind === "already-saved") && after ? after : before;
  const who = `${now.anglerName}'s ${now.measurement.value} ${now.measurement.unit} ${now.species.toLowerCase()}`;
  switch (result.kind) {
    case "saved":
    case "already-saved": {
      const verb = decision.kind === "rejudge" ? (decision.to === "verified" ? "Re-approved" : "Rejected") : DECISION_VERB[decision.kind];
      return { tone: "success", title: verb, message: result.kind === "already-saved" ? `${who}: this was already saved, so nothing was sent again.` : `${who}.` };
    }
    case "changed":
      return { tone: "info", title: "This catch changed", message: `${before.anglerName} edited it after you opened it.${after ? ` ${changeText(before, after)}` : ""} Look again before deciding.` };
    case "retracted":
      return { tone: "neutral", title: "Retracted", message: `${before.anglerName} retracted this catch, so it can't be judged.` };
    case "refused":
      return {
        tone: "neutral",
        title: result.reason === "final" ? "The tournament is final" : result.reason === "decided" ? "Already decided" : "Not accepted",
        message: result.reason === "decided" ? "Someone else's decision landed first; it's reloaded below." : "The catch was reloaded; nothing changed.",
      };
    case "not-sent":
      return { tone: "danger", title: "NOT SENT", message: "" };
  }
}

/** "Weight 3.80 → 3.85 lb." from the review before and after a reload. */
function changeText(before: ReviewData, after: ReviewData): string {
  const parts: string[] = [];
  if (before.species !== after.species) parts.push(`Species ${before.species} → ${after.species}`);
  const a = before.measurement;
  const b = after.measurement;
  if (a.value !== b.value) parts.push(`${before.metric === "weight" ? "Weight" : "Length"} ${a.value} → ${b.value} ${b.unit}`);
  if (after.photos.length > before.photos.length) parts.push(`${after.photos.length - before.photos.length} photo added`);
  return parts.length > 0 ? `${parts.join("; ")}.` : "";
}

/** What a decision reads as, locked, on its NOT SENT state: "Approve · Smallmouth bass · 3.80 lb". */
function decisionText(decision: Decision, data: ReviewData): string {
  const what = `${data.species} · ${data.measurement.value} ${data.measurement.unit}`;
  switch (decision.kind) {
    case "approve":
      return `Approve · ${what}`;
    case "reject":
      return `Reject · “${decision.reason.trim()}”`;
    case "correct":
      return `Correct and approve · “${decision.reason.trim()}”`;
    case "rejudge":
      return `Change to ${decision.to} · “${decision.reason.trim()}”`;
  }
}

/** The line under the title on a review: "Marcus L. · Summer Bass 2027". */
function reviewMeta(data: ReviewData): string {
  return `${data.anglerName} · ${data.eventName}`;
}

/** Why a review can't be decided here (02e to 02h). */
function readOnlyNotice(data: ReviewData): Notice | null {
  switch (data.row) {
    case "JDG-02e":
      return { tone: "neutral", title: "Retracted", message: "The angler retracted this catch. It never scores and can't be judged." };
    case "JDG-02f":
      return { tone: "neutral", title: "Your own catch", message: data.role === "Judge" ? "The backup judge decides your catches." : "The judge decides your catches." };
    case "JDG-02g":
      return { tone: "neutral", title: "Not yours to judge", message: "As backup judge you decide only the judge's own catches." };
    case "JDG-02h":
      return { tone: "neutral", title: "Final", message: "Results are final. Photos are archived; the history is unchanged." };
    default:
      return null;
  }
}

// The phone page (JDG-02a to 02j): the review, its action bar, and the form it pushes or opens.
function ReviewScreen(props: ReviewProps) {
  const review = useReview(props);
  const { data, phase } = review;
  const sending = phase.kind === "sending";

  if (data && props.form === "correct") {
    return (
      <div className="screen">
        <NavBar title="Correct catch" backLabel="Review" backName="Back to Review catch" onBack={() => props.onForm(null)} />
        <CorrectForm data={data} units={props.units} phase={phase} onSend={review.decide} onCancel={() => props.onForm(null)} layout="page" />
      </div>
    );
  }
  if (data && props.form === "rejudge") {
    return (
      <div className="screen">
        <NavBar title="Change decision" backLabel="Review" backName="Back to Review catch" onBack={() => props.onForm(null)} />
        <RejudgeForm data={data} phase={phase} onSend={review.decide} onCancel={() => props.onForm(null)} layout="page" />
      </div>
    );
  }

  const notSent = phase.kind === "not-sent" && phase.decision.kind === "approve" ? phase.decision : null;
  const readOnly = data ? readOnlyNotice(data) : null;
  return (
    <div className="screen">
      <NavBar title="Review catch" backLabel="Queue" backName="Back to Judge queue" onBack={props.onBackToQueue} />
      <div className="screen-content review-content">
        {review.failed && !data && (
          <Banner tone="danger" title="Couldn't load this catch">
            It may have been retracted, or your signal dropped. Go back to the queue and try again.
          </Banner>
        )}
        {!data && !review.failed && <p className="t-body t-secondary">Loading…</p>}
        {data && (
          <>
            {notSent && (
              <>
                <Banner tone="danger" title="NOT SENT">
                  Your approval didn't reach the club. The catch is still {data.status} until Retry gets through.
                </Banner>
                <LockedField label="Your decision" value={decisionText(notSent, data)} note="Locked until sent" />
              </>
            )}
            {props.notice && (
              <Banner tone={props.notice.tone} title={props.notice.title}>
                {props.notice.message}
              </Banner>
            )}
            {readOnly && (
              <Banner tone={readOnly.tone} title={readOnly.title}>
                {readOnly.message}
              </Banner>
            )}
            <p className="t-callout t-secondary review-meta">{reviewMeta(data)}</p>
            {data.row === "JDG-02d" && <DecisionSummary data={data} />}
            <ReviewBody data={data} headingId="review-history" />
          </>
        )}
      </div>
      {data && canDecide(data.row) && (
        <ActionBar>
          {notSent ? (
            <>
              <Button variant="primary" large loading={sending} loadingLabel="Sending…" onClick={() => void review.decide(notSent, true)}>
                Retry
              </Button>
              <Button variant="text" onClick={review.cancelNotSent}>
                Cancel
              </Button>
            </>
          ) : (
            <ReviewActions data={data} sending={sending} onApprove={() => void review.decide({ kind: "approve" }, false)} onForm={props.onForm} />
          )}
        </ActionBar>
      )}
      {data && props.form === "reject" && (
        <Sheet title="Reject catch" onCancel={sending ? undefined : () => props.onForm(null)}>
          <RejectForm data={data} phase={phase} onSend={review.decide} layout="sheet" />
        </Sheet>
      )}
    </div>
  );
}

/** Correct… / Reject… / Approve on a pending catch; Correct… / Change decision… on a decided one (Figma JDG-02a, 02d). */
function ReviewActions({ data, sending, onApprove, onForm }: { data: ReviewData; sending: boolean; onApprove: () => void; onForm: (form: Form) => void }) {
  const measure = data.metric === "weight" ? "weight" : "length";
  if (data.status === "pending") {
    return (
      <div className="review-actions">
        <Button variant="secondary" full icon="/icons/edit-link.svg" disabled={sending} onClick={() => onForm("correct")}>
          Correct species or {measure}…
        </Button>
        <div className="review-actions-row">
          <Button variant="secondary" large disabled={sending} onClick={() => onForm("reject")}>
            Reject…
          </Button>
          <Button variant="primary" large loading={sending} loadingLabel="Approving…" onClick={onApprove}>
            Approve
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="review-actions-row">
      <Button variant="secondary" large onClick={() => onForm("correct")}>
        Correct…
      </Button>
      <Button variant="primary" large onClick={() => onForm("rejudge")}>
        Change decision…
      </Button>
    </div>
  );
}

// The wide pane (Figma Desktop JDG-01a + JDG-02a): the same review, its actions inline, forms as overlays.
function ReviewPane(props: ReviewProps) {
  const review = useReview(props);
  const { data, phase } = review;
  const sending = phase.kind === "sending";
  if (review.failed && !data) {
    return (
      <Banner tone="danger" title="Couldn't load this catch">
        It may have been retracted, or your signal dropped.
      </Banner>
    );
  }
  if (!data) return <p className="t-body t-secondary">Loading…</p>;
  const readOnly = readOnlyNotice(data);
  const notSent = phase.kind === "not-sent" && phase.decision.kind === "approve" ? phase.decision : null;
  const position = props.queue ? props.queue.lists[props.filter].findIndex((item) => item.id === data.base.id) : -1;
  const total = props.queue?.lists[props.filter].length ?? 0;
  return (
    <>
      <div className="review-pane-head">
        <div>
          <h2 className="t-title-section">{data.anglerName}</h2>
          <p className="t-footnote t-secondary">
            {data.measurement.value} {data.measurement.unit} · {data.species}
            {position >= 0 ? ` · catch ${position + 1} of ${total} in the queue` : ""}
          </p>
        </div>
        <CatchStatusChip status={data.status} />
      </div>
      {props.notice && (
        <Banner tone={props.notice.tone} title={props.notice.title}>
          {props.notice.message}
        </Banner>
      )}
      {readOnly && (
        <Banner tone={readOnly.tone} title={readOnly.title}>
          {readOnly.message}
        </Banner>
      )}
      {notSent && (
        <Banner tone="danger" title="NOT SENT">
          Your approval didn't reach the club. The catch is still {data.status} until Retry gets through.
        </Banner>
      )}
      {data.row === "JDG-02d" && <DecisionSummary data={data} />}
      <ReviewBodyWithActions
        data={data}
        actions={
          canDecide(data.row) ? (
            <div className="card card-sunken review-pane-actions">
              {notSent ? (
                <>
                  <Button variant="text" onClick={review.cancelNotSent}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={sending} loadingLabel="Sending…" onClick={() => void review.decide(notSent, true)}>
                    Retry
                  </Button>
                </>
              ) : data.status === "pending" ? (
                <>
                  <Button variant="secondary" icon="/icons/edit-link.svg" disabled={sending} onClick={() => props.onForm("correct")}>
                    Correct species or {data.metric === "weight" ? "weight" : "length"}…
                  </Button>
                  <span className="review-pane-actions-end">
                    <Button variant="secondary" disabled={sending} onClick={() => props.onForm("reject")}>
                      Reject…
                    </Button>
                    <Button variant="primary" loading={sending} loadingLabel="Approving…" onClick={() => void review.decide({ kind: "approve" }, false)}>
                      Approve
                    </Button>
                  </span>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => props.onForm("correct")}>
                    Correct…
                  </Button>
                  <Button variant="primary" onClick={() => props.onForm("rejudge")}>
                    Change decision…
                  </Button>
                </>
              )}
            </div>
          ) : null
        }
      />
      {props.form === "reject" && (
        <Overlay kind="dialog" title={`Reject ${data.anglerName}'s catch?`} onClose={sending ? undefined : () => props.onForm(null)}>
          <RejectForm data={data} phase={phase} onSend={review.decide} onCancel={() => props.onForm(null)} layout="dialog" />
        </Overlay>
      )}
      {props.form === "rejudge" && (
        <Overlay kind="dialog" title="Change decision" onClose={sending ? undefined : () => props.onForm(null)}>
          <RejudgeForm data={data} phase={phase} onSend={review.decide} onCancel={() => props.onForm(null)} layout="dialog" />
        </Overlay>
      )}
      {props.form === "correct" && (
        <Overlay kind="panel" title={`Correct species or ${data.metric === "weight" ? "weight" : "length"}`} onClose={sending ? undefined : () => props.onForm(null)}>
          <CorrectForm data={data} units={props.units} phase={phase} onSend={review.decide} onCancel={() => props.onForm(null)} layout="panel" />
        </Overlay>
      )}
    </>
  );
}

/** The review body with the decision bar between the facts and the history (Figma Desktop JDG-02a). */
function ReviewBodyWithActions({ data, actions }: { data: ReviewData; actions: ReactNode }) {
  return (
    <div className="review-body">
      <ReviewBody data={data} headingId={`history-${data.base.id}`} />
      {actions && <div className="review-body-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The forms: one body each, drawn in a sheet (phone reject), a page (phone correct and change
// decision), a dialog or a side panel (wide).

interface FormProps {
  data: ReviewData;
  phase: Phase;
  onSend: (decision: Decision, retry: boolean) => Promise<void>;
  onCancel?: () => void;
  layout: "sheet" | "page" | "dialog" | "panel";
}

/** The form's own NOT SENT: its decision kept, locked, with Retry (JDG-03b, 04b, 05c). */
function notSentOf(phase: Phase, kind: Decision["kind"]): Decision | null {
  return (phase.kind === "not-sent" || phase.kind === "sending") && phase.decision.kind === kind ? phase.decision : null;
}

function FormFooter({ layout, children, onCancel, busy }: { layout: FormProps["layout"]; children: ReactNode; onCancel?: () => void; busy: boolean }) {
  if (layout === "page") return <ActionBar>{children}</ActionBar>;
  if (layout === "sheet") return <div className="sheet-footer form-footer">{children}</div>;
  return (
    <div className="overlay-footer form-footer">
      {onCancel && (
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      )}
      {children}
    </div>
  );
}

function NotSentBanner({ what }: { what: string }) {
  return (
    <Banner tone="danger" title="NOT SENT">
      Your {what} didn't reach the club. Retry checks the catch first, so it is never decided twice.
    </Banner>
  );
}

/** JDG-03a Reject, JDG-03b NOT SENT. */
function RejectForm({ data, phase, onSend, onCancel, layout }: FormProps) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const pending = notSentOf(phase, "reject");
  const busy = phase.kind === "sending";
  const first = data.anglerName.split(" ")[0];
  const send = () => {
    setTried(true);
    if (reason.trim() !== "") void onSend({ kind: "reject", reason }, false);
  };
  return (
    <>
      <div className={layout === "sheet" ? "form-body" : "form-body"}>
        {pending && phase.kind === "not-sent" && <NotSentBanner what="rejection" />}
        {layout === "sheet" ? (
          <p className="t-callout t-secondary">
            {data.anglerName} · {data.species} · {data.measurement.value} {data.measurement.unit}
          </p>
        ) : (
          <dl className="card card-sunken t-callout">
            <div className="fact">
              <dt className="t-secondary">Catch</dt>
              <dd className="t-callout-strong">
                {data.measurement.value} {data.measurement.unit} · {data.species}
              </dd>
            </div>
            <div className="fact">
              <dt className="t-secondary">Received</dt>
              <dd className="t-callout-strong">{formatClubTime(data.created)}</dd>
            </div>
          </dl>
        )}
        {pending ? (
          <LockedField label="Reason" value={pending.kind === "reject" ? pending.reason : ""} note="Locked until sent" />
        ) : (
          <TextAreaField
            id="reject-reason"
            label="Reason (required)"
            help={`${first} and the judges see this reason. Other members see it only if the catch is approved later.`}
            error={tried && reason.trim() === "" ? "Say why, in words." : null}
            value={reason}
            onValueChange={setReason}
          />
        )}
      </div>
      <FormFooter layout={layout} onCancel={onCancel} busy={busy}>
        {pending ? (
          <Button variant="destructive" large={layout !== "dialog"} loading={busy} loadingLabel="Sending…" onClick={() => void onSend(pending, true)}>
            Retry
          </Button>
        ) : (
          <Button variant="destructive" large={layout !== "dialog"} onClick={send}>
            Reject catch
          </Button>
        )}
      </FormFooter>
    </>
  );
}

/** JDG-04a Correct, JDG-04b NOT SENT: saving approves at the corrected value. */
function CorrectForm({ data, units, phase, onSend, onCancel, layout }: FormProps & { units: DisplayUnits }) {
  const [speciesId, setSpeciesId] = useState(data.speciesId);
  const [weight, setWeight] = useState(() => weightEntryFromHoz(data.base.weightHoz, units));
  const [length, setLength] = useState(() => lengthEntryFromQ(data.base.lengthQ));
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const pending = notSentOf(phase, "correct");
  const busy = phase.kind === "sending";
  const metric = data.metric;
  const parsed = metric === "weight" ? parseWeight(weight) : parseLength(length);
  const measurement = parsed.ok ? ("hoz" in parsed ? parsed.hoz : parsed.q) : null;
  const fields = measurement === null ? null : editFields(data.base, metric, speciesId, measurement);
  const label = metric === "weight" ? "Weight" : "Length";
  const was = displayMeasurement(metric, units, metric === "weight" ? { weight_hoz: data.base.weightHoz } : { length_q: data.base.lengthQ });
  const why = fields === null ? (measurement === null ? `Enter the ${metric} the photo shows.` : `Change the species or ${metric} to correct it.`) : tried && reason.trim() === "" ? "Add a reason to save." : null;
  const send = () => {
    setTried(true);
    if (fields && reason.trim() !== "") void onSend({ kind: "correct", fields, reason }, false);
  };
  const speciesName = data.speciesChoices.find((c) => c.id === speciesId)?.name ?? data.species;

  return (
    <>
      <div className={layout === "page" ? "screen-content submit-content" : "form-body"}>
        {layout === "page" && <p className="t-callout t-secondary">{reviewMeta(data)}</p>}
        {pending && phase.kind === "not-sent" && <NotSentBanner what="correction" />}
        <Banner tone="info" title="Saving approves this catch">
          It becomes verified at the corrected value, with one “correct” entry in its history. To reject instead, go back and choose Reject.
        </Banner>
        <dl className="card card-sunken t-callout">
          <div className="fact">
            <dt className="t-secondary">Now</dt>
            <dd className="t-callout-strong">
              {data.species} · {data.measurement.value} {data.measurement.unit} · {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </dd>
          </div>
        </dl>
        {pending ? (
          <>
            <LockedField label="Species" value={speciesName} />
            <LockedField label={label} value={metric === "weight" ? enteredWeightText(weight) : enteredLengthText(length)} />
            <LockedField label="Reason" value={pending.kind === "correct" ? pending.reason : ""} note="Locked until sent" />
          </>
        ) : (
          <>
            <SpeciesPicker species={data.speciesChoices} selectedId={speciesId} onSelect={(choice) => setSpeciesId(choice.id)} />
            {metric === "weight" ? <WeightInput id="correct-weight" value={weight} onChange={setWeight} /> : <LengthInput id="correct-length" value={length} onChange={setLength} />}
            <p className="t-footnote t-secondary">
              Was {was.value} {was.unit}. Enter what the {metric === "weight" ? "scale" : "board"} in photo 2 shows.
            </p>
            <TextAreaField
              id="correct-reason"
              label="Reason (required)"
              help="Shown in the catch history with the change."
              error={tried && reason.trim() === "" ? "Say what the photo shows." : null}
              value={reason}
              onValueChange={setReason}
            />
          </>
        )}
      </div>
      <FormFooter layout={layout} onCancel={onCancel} busy={busy}>
        {why && !pending && layout === "page" && <p className="t-footnote t-secondary">{why}</p>}
        {pending ? (
          <Button variant="primary" large={layout === "page"} loading={busy} loadingLabel="Saving…" onClick={() => void onSend(pending, true)}>
            Retry
          </Button>
        ) : (
          <Button variant="primary" large={layout === "page"} disabled={fields === null} onClick={send}>
            {layout === "page" ? "Save and approve" : "Save correction"}
          </Button>
        )}
      </FormFooter>
    </>
  );
}

/** JDG-05a verified → rejected, JDG-05b rejected → verified, JDG-05c NOT SENT. */
function RejudgeForm({ data, phase, onSend, onCancel, layout }: FormProps) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const pending = notSentOf(phase, "rejudge");
  const busy = phase.kind === "sending";
  const to = data.status === "verified" ? "rejected" : "verified";
  const first = data.anglerName.split(" ")[0];
  const send = () => {
    setTried(true);
    if (reason.trim() !== "") void onSend({ kind: "rejudge", to, reason }, false);
  };
  return (
    <>
      <div className={layout === "page" ? "screen-content submit-content" : "form-body"}>
        <p className="t-callout t-secondary">
          {data.anglerName} · {data.species} · {data.measurement.value} {data.measurement.unit}
        </p>
        {pending && phase.kind === "not-sent" && <NotSentBanner what="change" />}
        <div className="judging-section-head">
          <h3 className="t-headline">Current decision</h3>
          <CatchStatusChip status={data.status} />
        </div>
        <dl className="card card-sunken t-callout">
          {data.decision && (
            <>
              <div className="fact">
                <dt className="t-secondary">Decided by</dt>
                <dd className="t-callout-strong">{data.decision.by.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())}</dd>
              </div>
              <div className="fact">
                <dt className="t-secondary">Decided</dt>
                <dd className="t-callout-strong">{formatClubTime(data.decision.at)}</dd>
              </div>
            </>
          )}
          {data.status === "rejected" && data.reason && (
            <div className="fact">
              <dt className="t-secondary">Reason</dt>
              <dd className="t-callout-strong">“{data.reason}”</dd>
            </div>
          )}
        </dl>
        {pending ? (
          <LockedField label="Reason for the change" value={pending.kind === "rejudge" ? pending.reason : ""} note="Locked until sent" />
        ) : (
          <TextAreaField
            id="rejudge-reason"
            label="Reason for the change (required)"
            help={to === "rejected" ? `${first} and the judges see this reason. Other members see it only if the catch is approved later.` : "Every member who can see the catch reads it in its history."}
            error={tried && reason.trim() === "" ? "Say why, in words." : null}
            value={reason}
            onValueChange={setReason}
          />
        )}
      </div>
      <FormFooter layout={layout} onCancel={onCancel} busy={busy}>
        {pending ? (
          <Button variant={to === "rejected" ? "destructive" : "primary"} large={layout === "page"} loading={busy} loadingLabel="Sending…" onClick={() => void onSend(pending, true)}>
            Retry
          </Button>
        ) : (
          <Button variant={to === "rejected" ? "destructive" : "primary"} large={layout === "page"} onClick={send}>
            Change to {to}
          </Button>
        )}
      </FormFooter>
    </>
  );
}

