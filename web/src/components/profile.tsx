// The Profile screen's own parts (PRF-01c, Figma 184:9982 and its views): the identity card, a
// best tile and the status counts card. The stats charts are in statsChart.tsx.

import type { BestTile as BestTileData, StatusCounts } from "../lib/profileStats";
import { initials } from "../lib/profile";
import { CatchStatusChip } from "./catch";

interface IdentityCardProps {
  name: string;
  /** "Organizer", "Judge · Summer Bass 2027": plain text, not controls. */
  roles: readonly string[];
}

/** Monogram, name and role tags. The monogram is decorative; the tags are read after the name. */
export function IdentityCard({ name, roles }: IdentityCardProps) {
  return (
    <section className="identity-card" aria-label="You">
      <span className="monogram t-headline" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="identity-who">
        <p className="t-title-section">{name}</p>
        {roles.length > 0 && (
          <ul className="identity-roles">
            {roles.map((role) => (
              <li key={role} className="role-tag t-footnote-strong">
                {role}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface BestTileProps {
  /** "Heaviest fish" or "Longest fish". */
  label: string;
  tile: BestTileData | null;
}

/** One personal best, read as one element ("Heaviest fish, 3.80 pounds, Largemouth, Summer Bass 2027"). */
export function BestTile({ label, tile }: BestTileProps) {
  if (tile === null) {
    return (
      <div className="best-tile">
        <p className="t-caption-caps t-secondary">{label}</p>
        <p className="t-callout t-secondary">None yet</p>
      </div>
    );
  }
  return (
    <div className="best-tile" role="group" aria-label={`${label}, ${tile.value} ${tile.unit}, ${tile.species}, ${tile.eventName}`}>
      <p className="t-caption-caps t-secondary" aria-hidden="true">
        {label}
      </p>
      <p className="best-value" aria-hidden="true">
        <span className="t-number-large">{tile.value}</span>
        <span className="t-callout t-secondary">{tile.unit}</span>
      </p>
      <p className="t-footnote-strong" aria-hidden="true">
        {tile.species}
      </p>
      <p className="t-footnote t-secondary" aria-hidden="true">
        {tile.eventName}
      </p>
    </div>
  );
}

const STATUS_ORDER = ["verified", "pending", "rejected", "retracted"] as const;

/** Catches submitted, by status, then tournaments entered and the fish that count toward totals. */
export function StatusCountsCard({ counts }: { counts: StatusCounts }) {
  return (
    <div className="card card-sunken status-counts">
      <p className="status-counts-total">
        <span className="t-callout t-secondary">Catches submitted</span>
        <span className="t-number-row">{counts.submitted}</span>
      </p>
      <ul className="status-counts-by">
        {STATUS_ORDER.map((status) => (
          <li key={status}>
            <CatchStatusChip status={status} />
            <span className="t-callout-strong">{counts[status]}</span>
          </li>
        ))}
      </ul>
      <hr className="status-counts-divider" />
      <dl className="status-counts-facts t-callout">
        <div className="fact">
          <dt className="t-secondary">Tournaments entered</dt>
          <dd className="t-callout-strong">{counts.tournaments}</dd>
        </div>
        <div className="fact">
          <dt className="t-secondary">Fish counted toward totals</dt>
          <dd className="t-callout-strong">{counts.counted}</dd>
        </div>
      </dl>
    </div>
  );
}
