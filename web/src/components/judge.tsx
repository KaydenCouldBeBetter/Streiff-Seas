// The judge's building blocks (Figma Components: Queue item 61:2991, Flag chip 22:42; Flow 7
// JDG-01, JDG-02): judge screens only, since members never see flag codes (screens.md Gap 23).

import { useState } from "react";
import type { CatchAuditRow } from "../lib/catchTimeline";
import { timelineEntries } from "../lib/catchTimeline";
import { formatClubTime } from "../lib/format";
import type { QueueFlag, QueueItem } from "../lib/judging";
import type { CodeWordCheck, ReviewData } from "../lib/judgeReview";
import { CatchStatusChip, CatchTimeline } from "./catch";
import { Icon } from "./ui";

/** Figma Flag chip: the code with a short note; its spoken name says it in words and keeps the code. */
export function FlagChip({ flag }: { flag: QueueFlag }) {
  return (
    <span className="flag-chip t-footnote-strong" role="img" aria-label={flag.spoken}>
      <Icon src="/icons/flag-warning.svg" size={16} />
      <span aria-hidden="true">{flag.label}</span>
    </span>
  );
}

export function FlagList({ flags, withdrawn = false }: { flags: readonly QueueFlag[]; withdrawn?: boolean }) {
  if (flags.length === 0 && !withdrawn) return null;
  return (
    <span className="flag-list">
      {flags.map((flag) => (
        <FlagChip key={flag.label} flag={flag} />
      ))}
      {withdrawn && (
        <span className="status-chip status-chip-neutral t-footnote-strong">
          <Icon src="/icons/archive-neutral.svg" size={16} />
          Entry withdrawn
        </span>
      )}
    </span>
  );
}

/** Figma Queue item: one catch in the queue; the whole card opens its review. */
export function QueueCard({ item, selected = false, onClick }: { item: QueueItem; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`catch-card queue-card${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={onClick}>
      <span className="catch-card-thumb queue-card-thumb">
        {item.thumbnailUrl ? <img className="photo-slot-preview" src={item.thumbnailUrl} alt="" /> : <Icon src="/icons/photo.svg" size={24} />}
      </span>
      <span className="catch-card-body">
        <span className="t-headline">{item.name}</span>
        <span className="t-callout-strong">{item.summary}</span>
        <span className="t-footnote t-secondary">{item.received}</span>
        {item.decidedAt && (
          <span className="t-footnote t-secondary">
            {item.status === "verified" ? (item.corrected ? "Corrected and approved" : "Approved") : "Rejected"} {formatClubTime(item.decidedAt)}
          </span>
        )}
        {item.reason && <span className="t-footnote catch-card-reason">Reason: “{item.reason}”</span>}
        <FlagList flags={item.flags} withdrawn={item.entryWithdrawn} />
      </span>
      <Icon src="/icons/chevron-right.svg" size={24} />
    </button>
  );
}

/** The code word card (JDG-02a, JDG-02i): the word to find in photo 1 or 2, or both and why. */
export function CodeWordCard({ check }: { check: CodeWordCheck }) {
  if (check.kind === "one") {
    return (
      <div className="code-word-card">
        <p className="code-word-card-word t-number-row">{check.word}</p>
        <p className="t-callout">Check the code word is visible in photo 1 or 2.</p>
      </div>
    );
  }
  return (
    <div className="code-word-card code-word-card-both">
      <p className="code-word-card-word t-number-row">
        {check.previous} or {check.current}
      </p>
      <p className="t-callout">{check.explanation}</p>
    </div>
  );
}

/** Photos 1 and 2 side by side, labelled, each opening full size; later ones behind "Show photo n". */
export function ReviewPhotos({ photos, archived }: { photos: ReviewData["photos"]; archived: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? photos : photos.slice(0, 2);
  const hidden = photos.slice(2);
  return (
    <div className="review-photos">
      <ul className="review-photo-grid">
        {shown.map((photo, i) => (
          <li key={photo.label} className="review-photo">
            {archived || !photo.url ? (
              <span className="review-photo-image review-photo-archived">
                <Icon src="/icons/archive.svg" size={24} />
                <span className="t-footnote">{archived ? "Photo archived" : "No photo"}</span>
              </span>
            ) : (
              <a className="review-photo-image" href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1}, ${photo.label.replace(/^\d+ · /, "").toLowerCase()}, full size`}>
                <img src={photo.url} alt="" />
              </a>
            )}
            <p className="t-callout-strong">{photo.label}</p>
            <p className="t-footnote t-secondary">{photo.note}</p>
          </li>
        ))}
      </ul>
      {!showAll && hidden.length > 0 && (
        <button type="button" className="button button-text" onClick={() => setShowAll(true)}>
          {hidden.length === 1 ? `Show photo 3 (${hidden[0]!.label.replace(/^\d+ · /, "").toLowerCase()})` : `Show photos 3 to ${photos.length}`}
        </button>
      )}
    </div>
  );
}

/** Everything the judge reads about the catch: photos, code word, facts, flags, history (JDG-02a). */
export function ReviewBody({ data, headingId }: { data: ReviewData; headingId: string }) {
  const facts: [string, string][] = [
    ["Species", data.species],
    [data.metric === "weight" ? "Weight" : "Length", `${data.measurement.value} ${data.measurement.unit}`],
    ["Received", formatClubTime(data.created)],
    ["Photo → received", data.photoToReceived ?? "Photo time missing"],
    ["Window", data.window],
  ];
  return (
    <>
      <ReviewPhotos photos={data.photos} archived={data.row === "JDG-02h"} />
      <div className="review-checks">
        {data.codeWord && <CodeWordCard check={data.codeWord} />}
        <dl className="card card-sunken t-callout review-facts">
          {facts.map(([label, value]) => (
            <div className="fact" key={label}>
              <dt className="t-secondary">{label}</dt>
              <dd className="t-callout-strong">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <FlagList flags={data.flags} withdrawn={data.entryWithdrawn} />
      <ReviewHistory history={data.history} metric={data.metric} headingId={headingId} />
    </>
  );
}

export function ReviewHistory({ history, metric, headingId }: { history: readonly CatchAuditRow[]; metric: "weight" | "length"; headingId: string }) {
  return (
    <section className="review-history" aria-labelledby={headingId}>
      <h2 id={headingId} className="t-title-section">
        History
      </h2>
      <CatchTimeline entries={timelineEntries(history, metric)} labelledBy={headingId} />
    </section>
  );
}

/** The decision banner on a decided catch (JDG-02d): "Approved by the judge, Sat, Jul 10, 9:14 AM." */
export function DecisionSummary({ data }: { data: ReviewData }) {
  if (data.status !== "verified" && data.status !== "rejected") return null;
  const verb = data.status === "rejected" ? "Rejected" : data.decision?.corrected ? "Corrected and approved" : "Approved";
  return (
    <div className="card card-sunken decision-summary">
      <CatchStatusChip status={data.status} />
      <p className="t-callout">
        {verb}
        {data.decision ? ` by ${data.decision.by}, ${formatClubTime(data.decision.at)}.` : "."} {data.reason ? `“${data.reason}”` : "No reason given."}
      </p>
    </div>
  );
}
