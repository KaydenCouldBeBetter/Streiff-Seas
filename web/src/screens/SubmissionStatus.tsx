// SUB-02 Submission status: Sending (SUB-02a, Figma 66:5861), NOT SENT (SUB-02c, 66:5888),
// Received (SUB-02b, 66:5936) and already received (SUB-02d, the Received frame with the stored
// catch and View only). Not accepted (SUB-02e) is a placeholder until the refusal reason can be
// inferred from a reload of the event and entry (decisions.md 2026-10-05, Gap 16).

import { ActionBar, Banner, Button, Icon, NavBar, TodoTag } from "../components/ui";
import { CatchCard, PhotoSlot, type PhotoSlotState } from "../components/catch";
import { photoSlotLabel, photoSlotName, type Metric } from "../lib/catchForm";
import type { CatchDraft, ReceivedCatch, SendProgress } from "../lib/catchSender";
import { formatClubTime } from "../lib/format";

const BACK = { backLabel: "Tournament", backName: "Back to Tournament" } as const;

interface CatchAsEnteredProps {
  draft: CatchDraft;
  metric: Metric;
  slotState: (index: number, previewUrl: string) => { state: PhotoSlotState; note: string };
}

/** The inputs exactly as sent, locked: a retry can't silently drop an edit (decisions.md 2026-10-02). */
function CatchAsEntered({ draft, metric, slotState }: CatchAsEnteredProps) {
  return (
    <section className="entered-card" aria-labelledby="entered-heading">
      <div className="entered-heading">
        <h2 id="entered-heading" className="t-headline">
          Catch as entered
        </h2>
        <Icon src="/icons/lock-secondary.svg" size={18} />
        <span className="t-footnote-strong t-secondary">Locked until sent</span>
      </div>
      <div className="photo-slots">
        {draft.photos.map((photo, index) => {
          const { state, note } = slotState(index, photo.previewUrl);
          return <PhotoSlot key={index} label={photoSlotLabel(index + 1, metric)} name={photoSlotName(index + 1, metric)} note={note} state={state} />;
        })}
      </div>
      <dl className="card card-sunken t-callout">
        <div className="fact">
          <dt className="t-secondary">Species</dt>
          <dd className="t-callout-strong">{draft.species.name}</dd>
        </div>
        <div className="fact">
          <dt className="t-secondary">{metric === "weight" ? "Weight" : "Length"}</dt>
          <dd className="t-callout-strong">{draft.enteredMeasurement}</dd>
        </div>
      </dl>
    </section>
  );
}

interface SendingProps {
  draft: CatchDraft;
  metric: Metric;
  progress: SendProgress;
  onBack: () => void;
}

export function Sending({ draft, metric, progress, onBack }: SendingProps) {
  const overall = Math.round(((progress.photo - 1 + (progress.fraction ?? 0)) / progress.photoCount) * 100);
  return (
    <div className="screen">
      <NavBar title="Sending" {...BACK} onBack={onBack} />
      <div className="screen-content submit-content">
        <section className="send-status">
          <p className="send-status-title t-headline">
            <Icon src="/icons/upload-link.svg" size={24} />
            Sending your catch…
          </p>
          <div className="progress-track" role="progressbar" aria-label="Sending your catch" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}>
            <div className="progress-fill" style={{ width: `${overall}%` }} />
          </div>
          <p className="t-callout">
            Photo {progress.photo} of {progress.photoCount} · keep this screen open. On a weak signal this can take a minute.
          </p>
        </section>
        <CatchAsEntered
          draft={draft}
          metric={metric}
          slotState={(index, previewUrl) => {
            const photo = index + 1;
            if (photo < progress.photo) return { state: { kind: "filled", previewUrl }, note: "Sent" };
            if (photo === progress.photo) return { state: { kind: "uploading", previewUrl, fraction: progress.fraction }, note: "Uploading" };
            return { state: { kind: "filled", previewUrl }, note: "Waiting" };
          }}
        />
      </div>
      <ActionBar>
        <Button variant="primary" large loading loadingLabel="Sending…">
          Send catch
        </Button>
      </ActionBar>
    </div>
  );
}

interface NotSentProps {
  draft: CatchDraft;
  metric: Metric;
  onRetry: () => void;
  onLeave: () => void;
  onBack: () => void;
}

export function NotSent({ draft, metric, onRetry, onLeave, onBack }: NotSentProps) {
  return (
    <div className="screen">
      <NavBar title="Not sent" {...BACK} onBack={onBack} />
      <div className="screen-content submit-content">
        <Banner tone="danger" title="NOT SENT">
          Your catch didn't reach the club. Your photos are still in your camera roll, and nothing here is lost. Tap Retry when you have signal.
        </Banner>
        <CatchAsEntered draft={draft} metric={metric} slotState={(_, previewUrl) => ({ state: { kind: "failed", previewUrl }, note: "" })} />
      </div>
      <ActionBar>
        <Button variant="primary" large onClick={onRetry}>
          Retry
        </Button>
        <Button variant="text" onClick={onLeave}>
          Leave without sending
        </Button>
      </ActionBar>
    </div>
  );
}

interface ReceivedProps {
  stored: ReceivedCatch;
  /** Photo 1's preview from the draft; the real catch card shows the stored thumbnail. */
  thumbnailUrl: string | null;
  /** SUB-02d: a retry found the catch already stored; only View is offered. */
  alreadyReceived: boolean;
  onSubmitAnother: () => void;
  onBack: () => void;
}

export function Received({ stored, thumbnailUrl, alreadyReceived, onSubmitAnother, onBack }: ReceivedProps) {
  const photos = stored.photoCount === 1 ? "1 photo" : `${stored.photoCount} photos`;
  return (
    <div className="screen">
      <NavBar title="Received" {...BACK} onBack={onBack} />
      <div className="screen-content submit-content">
        <Banner tone="success" title="Received">
          {alreadyReceived
            ? "Your catch had already reached the club, so it wasn't sent twice. It's waiting for the judge."
            : "Your catch reached the club and is waiting for the judge."}
        </Banner>
        <CatchCard
          thumbnailUrl={thumbnailUrl}
          value={stored.measurement.value}
          unit={stored.measurement.unit}
          title={`${stored.species} · ${photos}`}
          time={`Submitted ${formatClubTime(stored.created)}`}
          status="pending"
          todo="MY-02"
        />
        <p className="t-callout t-secondary">You can still edit it, add photos or retract it until the judge decides or the deadline passes.</p>
      </div>
      <ActionBar>
        {alreadyReceived ? (
          <Button variant="primary" large todo="MY-02">
            View this catch
          </Button>
        ) : (
          <>
            <Button variant="primary" large onClick={onSubmitAnother}>
              Submit another catch
            </Button>
            <Button variant="text" todo="MY-02">
              View this catch
            </Button>
          </>
        )}
      </ActionBar>
    </div>
  );
}

/** SUB-02e placeholder: the refusal is real, the reason isn't inferred yet. */
export function NotAccepted({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <NavBar title="Not accepted" {...BACK} onBack={onBack} />
      <div className="screen-content submit-content">
        <Banner tone="danger" title="Not accepted">
          The club didn't accept this catch.
        </Banner>
        <p className="t-callout t-secondary todo-host">
          Why it wasn't accepted (deadline passed, tournament closed or entry withdrawn) comes next.
          <TodoTag row="SUB-02e" />
        </p>
      </div>
      <ActionBar>
        <Button variant="primary" large onClick={onBack}>
          Back to the tournament
        </Button>
      </ActionBar>
    </div>
  );
}
