// LB-02a Angler's catches: another angler's pending and verified catches in this tournament,
// opened from their leaderboard row (Figma 60:2831). A UI skeleton on sample data: each card
// carries a TodoTag for LB-03, the catch detail it opens once built. Never shown here: their
// rejected or retracted catches, for any viewer (LB-02c), or flag codes.
// TODO(LB-02b): once the event is final, pass `archived` to the cards ("Photo archived").

import { CatchCard } from "../components/catch";
import { NavBar, TabBar } from "../components/ui";
import { anglerFacts, catchTimes, shownOnAnglerPage, type AnglerCatchView } from "../lib/anglerCatches";
import { newestFirst } from "../lib/myCatches";
import type { LeaderboardRow } from "../lib/sampleLeaderboard";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  /** The angler's leaderboard row: name, place, total and counted fish. */
  row: LeaderboardRow;
  unit: string;
  bestN: number;
  catches: readonly AnglerCatchView[];
  onBack: () => void;
  onTab: (tab: MemberTab) => void;
}

export function AnglerCatches({ row, unit, bestN, catches, onBack, onTab }: Props) {
  const shown = newestFirst(shownOnAnglerPage(catches));
  const facts = anglerFacts(row, unit, bestN, shown.length);
  return (
    <div className="screen tab-screen">
      <NavBar title={row.displayName} backLabel="Leaderboard" backName="Back to Leaderboard" onBack={onBack} />
      <div className="screen-content angler-catches">
        <dl className="card card-sunken t-callout">
          <div className="fact">
            <dt className="t-secondary">Place</dt>
            <dd className="t-callout-strong">{facts.place}</dd>
          </div>
          <div className="fact">
            <dt className="t-secondary">Counted</dt>
            <dd className="t-callout-strong">{facts.counted}</dd>
          </div>
        </dl>

        <ul className="catch-list-items" aria-label={`${row.displayName}'s catches`}>
          {shown.map((item) => (
            <li key={item.id}>
              <CatchCard
                thumbnailUrl={item.photos[0]?.url ?? null}
                value={item.measurement.value}
                unit={item.measurement.unit}
                title={item.species}
                time={catchTimes(item)}
                status={item.status}
                inBestN={item.status === "verified" && item.inBest ? bestN : undefined}
                todo="LB-03"
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="tab-screen-bottom">
        <TabBar tabs={MEMBER_TABS} selected="leaderboard" onSelect={onTab} />
      </div>
    </div>
  );
}
