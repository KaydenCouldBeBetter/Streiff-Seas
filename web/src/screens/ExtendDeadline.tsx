// ORG-04 Extend final deadline (Figma 94:5551, 94:5607 refused, 134:9688 NOT SENT; Desktop
// 226:3819): after an outage, the organizer enters the new total extension in whole hours, only
// up, only while live (R-EVT-U-12 to U-15). The fishing window never moves (scoring.md §6, example
// 23). A total is safe to repeat, so Retry after NOT SENT checks first and never adds twice.

import { useEffect, useState } from "react";
import { Note } from "../components/organizer";
import { ActionBar, Banner, Button, NavBar, TextField } from "../components/ui";
import { refusalCopy, retryEventChange, sendEventChange, type ManageData } from "../lib/eventAdmin";
import { formatClubTime } from "../lib/format";
import { pb } from "../lib/pb";
import { useLiveRef } from "../lib/useLiveRef";

interface Props {
  data: ManageData;
  onBack: () => void;
  onSaved: (message: string) => void;
}

type Phase = "form" | "sending" | "not-sent";

export function ExtendDeadline({ data, onBack, onSaved }: Props) {
  const current = data.deadlineExtMin / 60;
  const [hours, setHours] = useState(String(current + 1));
  const [phase, setPhase] = useState<Phase>("form");
  const [problem, setProblem] = useState<{ title: string; message: string } | null>(null);
  const live = useLiveRef();

  useEffect(() => {
    document.title = `Extend deadline · ${data.name} · Streiff Seas`;
  }, [data.name]);

  const whole = /^\d+$/.test(hours) ? Number(hours) : null;
  const error = hours === "" ? null : whole === null ? "Whole hours only, like 3." : whole <= current ? `It can only go up from ${current} h.` : null;
  const base = data.endsAt ? data.endsAt.getTime() + 24 * 3600_000 : null;
  const result = base !== null && whole !== null && !error ? new Date(base + whole * 3600_000) : null;

  async function save() {
    if (whole === null || error) return;
    setProblem(null);
    const retry = phase === "not-sent";
    setPhase("sending");
    const body = { deadline_ext_min: whole * 60 };
    const outcome = retry ? await retryEventChange(pb, data.eventId, body) : await sendEventChange(pb, data.eventId, body);
    if (!live.current) return;
    if (outcome.kind === "saved" || outcome.kind === "already-saved") {
      onSaved(`The final deadline is extended by ${whole} h${outcome.kind === "already-saved" ? " (it had already been saved)" : ""}.`);
    } else if (outcome.kind === "not-sent") {
      setPhase("not-sent");
    } else {
      // ORG-04b: reloaded and explained ("the total was already raised to n h", "closed on another device").
      setPhase("form");
      setProblem(refusalCopy(outcome.reason, outcome.event));
    }
  }

  return (
    <div className="screen screen-wide">
      <NavBar title="Extend deadline" backLabel="Manage" backName="Back to Manage" onBack={onBack} />
      <form
        className="screen-content org-content"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {phase === "not-sent" && (
          <Banner tone="danger" title="NOT SENT">
            The change didn't reach the club. Retry checks the tournament first, so the deadline is never extended twice.
          </Banner>
        )}
        {problem && (
          <Banner tone="danger" title={problem.title}>
            {problem.message}
          </Banner>
        )}
        <Note>Use the outage length from the outage log, rounded up to whole hours. The fishing window doesn't move.</Note>
        <dl className="card card-sunken t-callout manage-facts">
          <div className="fact">
            <dt className="t-secondary">Fishing ends</dt>
            <dd>{data.endsAt ? formatClubTime(data.endsAt) : "Not set"}</dd>
          </div>
          <div className="fact">
            <dt className="t-secondary">Current extension</dt>
            <dd>{current} h</dd>
          </div>
          <div className="fact">
            <dt className="t-secondary">Final deadline now</dt>
            <dd>{data.submitDeadline ? formatClubTime(data.submitDeadline) : "Not set"}</dd>
          </div>
        </dl>
        <TextField
          id="extension-hours"
          label="New total extension (hours)"
          help={`Whole hours. It can only go up from ${current} h.`}
          inputMode="numeric"
          error={error}
          disabled={phase !== "form"}
          value={hours}
          onValueChange={setHours}
        />
        {result && (
          <div className="result-panel" aria-live="polite">
            <p className="t-footnote-strong t-secondary">New final deadline</p>
            <p className="t-title-section">{formatClubTime(result)}</p>
            <p className="t-footnote">Members will see "Extended by {whole} h after an outage".</p>
          </div>
        )}
        <ActionBar>
          <Button variant="primary" large type="submit" loading={phase === "sending"} loadingLabel="Sending…" disabled={whole === null || error !== null}>
            {phase === "not-sent" ? "Retry" : whole !== null && !error ? `Extend to ${whole} h` : "Extend"}
          </Button>
        </ActionBar>
      </form>
    </div>
  );
}
