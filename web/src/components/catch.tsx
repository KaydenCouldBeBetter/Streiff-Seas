// The Figma components for one catch: Status chip, Marker / In best 10, Catch card and the
// photo viewer. MY-01 and MY-02 use them now; LB-02, LB-03 and JDG-02 are meant to reuse
// them (an angler's catches as other members see them, never Rejected or Retracted there).

import { useState } from "react";
import { formatClubTime } from "../lib/format";
import { photoLabels, type CatchPhoto, type CatchStatus, type MyCatchView } from "../lib/myCatches";

const STATUS: Record<CatchStatus, { label: string; icon: string }> = {
  pending: { label: "Pending", icon: "/icons/clock-warning.svg" },
  verified: { label: "Verified", icon: "/icons/check-success.svg" },
  rejected: { label: "Rejected", icon: "/icons/close-danger.svg" },
  retracted: { label: "Retracted", icon: "/icons/undo-neutral-small.svg" },
};

/** Catch status: always icon + word, never color alone. Read as "Status: Pending". */
export function StatusChip({ status }: { status: CatchStatus }) {
  const { label, icon } = STATUS[status];
  return (
    <span className={`chip chip-${status} t-footnote-strong`}>
      <img src={icon} width={16} height={16} alt="" aria-hidden="true" />
      <span className="visually-hidden">Status: </span>
      {label}
    </span>
  );
}

/** A verified catch counted in the angler's best n. Read as "Counted in best 10". */
export function InBestMarker({ bestN }: { bestN: number }) {
  return (
    <span className="chip chip-best t-footnote-strong">
      <img src="/icons/star-link.svg" width={16} height={16} alt="" aria-hidden="true" />
      <span aria-hidden="true">In best {bestN}</span>
      <span className="visually-hidden">Counted in best {bestN}</span>
    </span>
  );
}

interface CatchCardProps {
  item: MyCatchView;
  bestN: number;
  /** Final: the thumbnail shows the archive icon and no file is requested. */
  archived: boolean;
  onOpen: () => void;
}

/**
 * One catch in a list; the whole card is one button. On the angler's own list a rejected
 * catch shows its reason inline. No flag codes for members.
 */
export function CatchCard({ item, bestN, archived, onOpen }: CatchCardProps) {
  const thumb = archived ? undefined : item.photos[0]?.url;
  return (
    <button type="button" className="catch-card" onClick={onOpen}>
      <span className="catch-card-thumb">
        {thumb ? (
          <img className="catch-card-photo" src={thumb} alt="" />
        ) : (
          <img src={archived ? "/icons/archive.svg" : "/icons/photo.svg"} width={24} height={24} alt="" aria-hidden="true" />
        )}
      </span>
      <span className="catch-card-body">
        <span className="measurement">
          <span className="t-number-row">{item.measurement.value}</span>
          <span className="t-footnote-strong t-secondary">{item.measurement.unit}</span>
        </span>
        <span className="t-callout-strong">{item.species}</span>
        <span className="t-footnote t-secondary">Submitted {formatClubTime(item.created)}</span>
        <span className="chips">
          <StatusChip status={item.status} />
          {item.status === "verified" && item.inBest && <InBestMarker bestN={bestN} />}
        </span>
        {item.status === "rejected" && item.reason && <span className="t-footnote catch-card-reason">Reason: “{item.reason}”</span>}
      </span>
      <img src="/icons/chevron-right.svg" width={24} height={24} alt="" aria-hidden="true" />
    </button>
  );
}

interface PhotoViewerProps {
  photos: readonly CatchPhoto[];
  /** Final: "Photo archived" in place of each photo, and no file is requested. */
  archived: boolean;
}

/** The large photo with its label, and a row of thumbnails that switch it. */
export function PhotoViewer({ photos, archived }: PhotoViewerProps) {
  const [shown, setShown] = useState(0);
  const labels = photoLabels(photos.length);
  const current = labels[shown];
  if (current === undefined) return null;
  const url = archived ? undefined : photos[shown]?.url;
  const caption = `${shown + 1} of ${photos.length} · ${current.long}${archived ? " · Photo archived" : ""}`;
  return (
    <div className="photo-viewer">
      <figure className="photo-viewer-photo">
        {url && <img src={url} alt="" />}
        {archived && (
          <span className="photo-viewer-archived t-callout-strong">
            <img src="/icons/archive.svg" width={24} height={24} alt="" aria-hidden="true" />
            Photo archived
          </span>
        )}
        <figcaption className="photo-viewer-label t-footnote-strong">{caption}</figcaption>
      </figure>
      <div className="photo-viewer-thumbs">
        {labels.map((label, i) => {
          const thumb = archived ? undefined : photos[i]?.url;
          return (
            <button key={i} type="button" className="photo-viewer-thumb t-footnote" aria-pressed={i === shown} onClick={() => setShown(i)}>
              <span className="photo-viewer-thumb-image">{thumb && <img src={thumb} alt="" />}</span>
              <span>
                <span className="visually-hidden">Show photo {i + 1}: </span>
                {label.short}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
