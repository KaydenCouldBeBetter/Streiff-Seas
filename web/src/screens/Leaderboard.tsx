// LB-01a Leaderboard: live, at least one angler qualifies (Figma 66:5754).
// A UI skeleton on sample data: controls whose screens aren't built yet carry a TodoTag
// with the screens.md row they open. Submit a catch opens SUB-01 (SubmitFlow); a row opens
// that angler's catches (LB-02).

import type { LeaderboardRow, LeaderboardView } from "../lib/sampleLeaderboard";
import { placeLabel, rowPlace, spokenPlace } from "../lib/format";
import { AccessoryBar, Button, LargeNavBar, LiveBadge, StatusChip, TabBar } from "../components/ui";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

const SPOKEN_UNIT: Record<string, string> = { lb: "pounds", in: "inches" };

interface Props {
  leaderboard: LeaderboardView;
  onTab: (tab: MemberTab) => void;
  onSubmit: () => void;
  /** Opens the row's angler's catches (LB-02), by entry id. */
  onOpenRow: (entryId: string) => void;
}

export function Leaderboard({ leaderboard, onTab, onSubmit, onOpenRow }: Props) {
  const { you, rows, unit, bestN } = leaderboard;
  // The crown marks 1st place once the leader has a verified fish (screens.md LB-01a).
  const leaderHasFish = rows.some((row) => row.place === 1 && row.counted > 0);
  return (
    <div className="screen tab-screen">
      <LargeNavBar title={leaderboard.name} badge={<LiveBadge state="live" />} subtitle={leaderboard.subtitle} />
      <div className="screen-content leaderboard-content">
        {you && (
          <section className="your-place" aria-label="Your place">
            <div className="your-place-place">
              <h2 className="t-footnote-strong t-secondary">Your place</h2>
              <p className="t-number-large">{placeLabel(you.place, you.tied)}</p>
            </div>
            <div className="your-place-total">
              <p className="standing-total">
                <span className="t-number-large">{you.total}</span>
                <span className="t-callout-strong t-secondary">{unit}</span>
              </p>
              <p className="t-footnote t-secondary">
                {you.counted} of {bestN} counted · {you.pending} pending
              </p>
            </div>
          </section>
        )}

        <div className="leaderboard-columns t-caption-caps t-secondary" aria-hidden="true">
          <span className="leaderboard-columns-place">Place</span>
          <span className="leaderboard-columns-angler">Angler</span>
          <span>Total</span>
        </div>

        <ol className="leaderboard-rows" aria-label="Standings">
          {rows.map((row) => (
            <li key={row.entryId}>
              <LeaderboardRowButton row={row} unit={unit} bestN={bestN} crown={leaderHasFish && row.place === 1} onClick={() => onOpenRow(row.entryId)} />
            </li>
          ))}
        </ol>
      </div>

      <div className="tab-screen-bottom">
        <AccessoryBar>
          <Button variant="primary" full icon="/icons/plus-on-primary.svg" onClick={onSubmit}>
            Submit a catch
          </Button>
        </AccessoryBar>
        <TabBar tabs={MEMBER_TABS} selected="leaderboard" onSelect={onTab} />
      </div>
    </div>
  );
}

interface RowProps {
  row: LeaderboardRow;
  unit: string;
  bestN: number;
  crown: boolean;
  onClick: () => void;
}

/** Figma Leaderboard row: the whole row is one button that opens the angler's catches. */
function LeaderboardRowButton({ row, unit, bestN, crown, onClick }: RowProps) {
  const detail = `${row.counted} of ${bestN} counted${row.biggest ? ` · Biggest ${row.biggest.size} ${unit} ${row.biggest.species}` : ""}`;
  const spokenUnit = SPOKEN_UNIT[unit] ?? unit;
  // Figma's VoiceOver note: "Tied for 2nd, Marcus L., 21.30 pounds, 9 of 10 counted,
  // biggest 3.80 pounds smallmouth, 1 pending."
  const name = [
    spokenPlace(row.place, row.tied) + (crown ? ", leader" : ""),
    row.displayName + (row.isViewer ? ", you" : ""),
    row.role,
    `${row.total} ${spokenUnit}`,
    `${row.counted} of ${bestN} counted`,
    row.biggest && `biggest ${row.biggest.size} ${spokenUnit} ${row.biggest.species.toLowerCase()}`,
    row.pending > 0 && `${row.pending} pending`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button type="button" className={`leaderboard-row${row.isViewer ? " is-you" : ""}`} aria-label={name} onClick={onClick}>
      <span className="leaderboard-row-place">
        {crown && <img src="/icons/crown.svg" width={20} height={20} alt="" aria-hidden="true" />}
        <span className="t-number-row">{rowPlace(row.place, row.tied)}</span>
      </span>
      <span className="leaderboard-row-angler">
        <span className="leaderboard-row-name">
          <span className="t-headline">
            {row.displayName}
            {row.isViewer && " (you)"}
          </span>
          {row.role && <span className="role-tag t-footnote-strong">{row.role}</span>}
        </span>
        <span className="t-footnote t-secondary">{detail}</span>
        {row.pending > 0 && (
          <span className="leaderboard-row-pending">
            <StatusChip tone="warning" icon="/icons/clock-warning.svg" label={`${row.pending} pending`} />
          </span>
        )}
      </span>
      <span className="leaderboard-row-total">
        <span className="t-number-row">{row.total}</span>
        <span className="t-footnote-strong t-secondary">{unit}</span>
      </span>
    </button>
  );
}
