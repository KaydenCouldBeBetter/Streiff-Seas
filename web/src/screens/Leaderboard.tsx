// LB-01 Leaderboard (Figma 66:5754): the standings from lib/leaderboard.ts, kept current by
// useLive in MemberApp. LB-01a live, LB-01b Reconnecting… (last standings kept), LB-01c
// "Updated h:mm" while polling, LB-01d no angler yet, LB-01e the viewer withdrawn (no "Your
// place"), LB-01f closed (still live), LB-01g final (no badge: it can't change). Submit a catch
// opens SUB-01 (SubmitFlow); a row opens that angler's catches (LB-02).

import type { LeaderboardRow, LeaderboardView } from "../lib/leaderboard";
import { formatClubTime, placeLabel, rowPlace, spokenPlace } from "../lib/format";
import { useBreakpoint } from "../lib/useBreakpoint";
import { AccessoryBar, Button, EmptyState, Icon, LargeNavBar, LiveBadge, StatusChip, type LiveBadgeState } from "../components/ui";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

const SPOKEN_UNIT: Record<string, string> = { lb: "pounds", oz: "ounces", in: "inches" };

interface Props {
  /** The tournament's name, shown while the first read is on its way. */
  name: string;
  /** undefined until the first read lands. */
  leaderboard: LeaderboardView | undefined;
  /** How current the standings are; null on a final board (Gap 25). */
  badge: LiveBadgeState | null;
  /** Submitting is open to the viewer (EVT-02d, EVT-02e): LB-01d offers Submit. */
  canSubmit: boolean;
  onClubRules: () => void;
  /** The tournament's window, for the dates card beside "Your place" on a wide window. */
  window?: { endsAt: Date; submitDeadline: Date };
  onTab: (tab: MemberTab) => void;
  onSubmit: () => void;
  /** Opens the row's angler's catches (LB-02), by entry id. */
  onOpenRow: (entryId: string) => void;
  /** Back to the tournament's page when this board isn't the live one (a past or draft tournament). */
  back?: { label: string; onBack: () => void };
}

export function Leaderboard({ name, leaderboard, badge, canSubmit, onClubRules, window: dates, onTab, onSubmit, onOpenRow, back }: Props) {
  const you = leaderboard?.you ?? null;
  const rows = leaderboard?.rows ?? [];
  const unit = leaderboard?.unit ?? "";
  const bestN = leaderboard?.bestN ?? 10;
  // From 1024 px the standings are a real table with column headers (Figma 223:2286).
  const table = useBreakpoint() === "expanded";
  // The crown marks 1st place once the leader has a verified fish (screens.md LB-01a).
  const leaderHasFish = rows.some((row) => row.place === 1 && row.counted > 0);
  return (
    <div className="screen tab-screen screen-wide">
      <LargeNavBar title={leaderboard?.name ?? name} badge={badge && <LiveBadge state={badge} />} subtitle={leaderboard?.subtitle} back={back} />
      <div className="screen-content leaderboard-content">
        <div className="leaderboard-summary">
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
          {dates && (
            <dl className="card card-sunken t-callout leaderboard-dates wide-only">
              <div className="fact">
                <dt className="t-secondary">Window closes</dt>
                <dd className="t-callout-strong">{formatClubTime(dates.endsAt)}</dd>
              </div>
              <div className="fact">
                <dt className="t-secondary">Submit by</dt>
                <dd className="t-callout-strong">{formatClubTime(dates.submitDeadline)}</dd>
              </div>
            </dl>
          )}
          <div className="leaderboard-rules wide-only">
            <Button variant="text" onClick={onClubRules}>
              Club rules
            </Button>
          </div>
        </div>

        {leaderboard === undefined ? (
          <p className="leaderboard-status t-body t-secondary">Loading the standings…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="/icons/list-large.svg"
            title="No catches yet"
            message="Anglers show up here once they have a pending or verified catch."
            action={
              canSubmit && (
                <Button variant="primary" onClick={onSubmit}>
                  Submit a catch
                </Button>
              )
            }
          />
        ) : table ? (
          <LeaderboardTable rows={rows} unit={unit} bestN={bestN} crownFirst={leaderHasFish} onOpenRow={onOpenRow} />
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="tab-screen-bottom">
        <AccessoryBar>
          <Button variant="primary" full icon="/icons/plus-on-primary.svg" onClick={onSubmit}>
            Submit a catch
          </Button>
        </AccessoryBar>
        <MemberTabBar selected="leaderboard" onSelect={onTab} />
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
        {crown && <Icon src="/icons/crown.svg" size={20} />}
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

interface TableProps {
  rows: readonly LeaderboardRow[];
  unit: string;
  bestN: number;
  /** The crown marks every 1st-place row once the leader has a verified fish. */
  crownFirst: boolean;
  onOpenRow: (entryId: string) => void;
}

/**
 * LB-01a at 1024 px and wider: a real <table>, so a screen reader can move by column (place,
 * angler, counted, biggest fish with its species, pending, total). Each row opens that angler's
 * catches; the angler's name is the keyboard control and the rest of the row is a bigger target.
 */
function LeaderboardTable({ rows, unit, bestN, crownFirst, onOpenRow }: TableProps) {
  return (
    <div className="leaderboard-table-wrap">
      <table className="leaderboard-table">
        <caption className="visually-hidden">Standings</caption>
        <thead>
          <tr className="t-caption-caps t-secondary">
            <th scope="col">Place</th>
            <th scope="col">Angler</th>
            <th scope="col">Counted</th>
            <th scope="col">Biggest fish</th>
            <th scope="col">Pending</th>
            <th scope="col" className="leaderboard-table-total">
              Total
            </th>
            <th scope="col">
              <span className="visually-hidden">Open catches</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entryId} className={row.isViewer ? "is-you" : undefined} onClick={() => onOpenRow(row.entryId)}>
              <td className="leaderboard-table-place">
                <span className="leaderboard-row-place">
                  {crownFirst && row.place === 1 && <Icon src="/icons/crown.svg" size={20} />}
                  <span className="t-number-row">
                    <span className="visually-hidden">{spokenPlace(row.place, row.tied)}</span>
                    <span aria-hidden="true">{rowPlace(row.place, row.tied)}</span>
                  </span>
                </span>
              </td>
              <th scope="row" className="leaderboard-table-angler">
                <button type="button" className="table-link t-headline">
                  {row.displayName}
                  {row.isViewer && " (you)"}
                </button>
                {row.role && <span className="role-tag t-footnote-strong">{row.role}</span>}
              </th>
              <td className="t-body">
                {row.counted} of {bestN}
              </td>
              <td className="t-body">
                {row.biggest ? (
                  <>
                    <strong>
                      {row.biggest.size} {unit}
                    </strong>{" "}
                    {row.biggest.species}
                  </>
                ) : (
                  <span aria-label="None">—</span>
                )}
              </td>
              <td>
                {row.pending > 0 ? (
                  <StatusChip tone="warning" icon="/icons/clock-warning.svg" label={`${row.pending} pending`} />
                ) : (
                  <span className="t-secondary" aria-label="None">
                    —
                  </span>
                )}
              </td>
              <td className="leaderboard-table-total">
                <span className="t-number-row">{row.total}</span> <span className="t-footnote-strong t-secondary">{unit}</span>
              </td>
              <td className="leaderboard-table-chevron">
                <Icon src="/icons/chevron-right.svg" size={24} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
