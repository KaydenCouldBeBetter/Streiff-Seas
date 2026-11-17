// LB-02a Angler's catches: another angler's pending and verified catches in this tournament,
// opened from their leaderboard row (Figma 60:2831), read by lib/loadAnglerCatches.ts when the
// page opens and on focus (Gap 25); each card opens LB-03, the catch detail. Never shown here: their rejected or retracted catches, for
// any viewer (LB-02c), or flag codes.
// TODO(LB-02b): once the event is final, pass `archived` to the cards ("Photo archived").

import type { ReactNode } from "react";
import { CatchCard } from "../components/catch";
import { Button, NavBar, TabBar } from "../components/ui";
import { anglerFacts, catchTimes, shownOnAnglerPage, type AnglerCatchView } from "../lib/anglerCatches";
import { newestFirst } from "../lib/myCatches";
import type { LeaderboardRow } from "../lib/leaderboard";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  /** The angler's leaderboard row: name, place, total and counted fish. */
  row: LeaderboardRow;
  unit: string;
  bestN: number;
  catches: readonly AnglerCatchView[];
  /** Before the first read lands, or when it failed (with Try again). */
  status?: "loading" | "error";
  onRetry?: () => void;
  /** Opens LB-03 for one catch. */
  onOpen: (catchId: string) => void;
  onBack: () => void;
  onTab: (tab: MemberTab) => void;
  /** From 1024 px the selected catch sits beside the list (LB-02 and LB-03 in one view, Figma 223:2611). */
  split?: { selectedId: string; detail: ReactNode };
}

export function AnglerCatches({ row, unit, bestN, catches, status, onRetry, onOpen, onBack, onTab, split }: Props) {
  const shown = newestFirst(shownOnAnglerPage(catches));
  const facts = anglerFacts(row, unit, bestN, shown.length);
  return (
    <div className="screen tab-screen screen-wide">
      <NavBar title={row.displayName} backLabel="Leaderboard" backName="Back to Leaderboard" onBack={onBack} />
      <div className={`screen-content angler-catches${split ? " catch-split" : ""}`}>
        {/* A wide window says the same in one line under the name instead of the facts card. */}
        <p className="angler-subtitle t-callout t-secondary wide-only">
          {facts.place} · {facts.counted.split(" · ")[0]} counted · pending and verified catches only
        </p>
        <dl className="card card-sunken t-callout angler-facts hide-wide">
          <div className="fact">
            <dt className="t-secondary">Place</dt>
            <dd className="t-callout-strong">{facts.place}</dd>
          </div>
          <div className="fact">
            <dt className="t-secondary">Counted</dt>
            <dd className="t-callout-strong">{facts.counted}</dd>
          </div>
        </dl>

        {status === "loading" && <p className="t-body t-secondary">Loading {row.displayName}'s catches…</p>}
        {status === "error" && (
          <div className="angler-status">
            <p className="t-body">Couldn't load {row.displayName}'s catches. Check your signal and try again.</p>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        <ul className="catch-list-items catch-split-list" aria-label={`${row.displayName}'s catches`}>
          {shown.map((item) => (
            <li key={item.id}>
              <CatchCard
                selected={split?.selectedId === item.id}
                thumbnailUrl={item.photos[0]?.url ?? null}
                value={item.measurement.value}
                unit={item.measurement.unit}
                title={item.species}
                time={catchTimes(item)}
                status={item.status}
                inBestN={item.status === "verified" && item.inBest ? bestN : undefined}
                onClick={() => onOpen(item.id)}
              />
            </li>
          ))}
        </ul>
        {split && <section className="catch-split-detail" aria-label="Selected catch">{split.detail}</section>}
      </div>

      <div className="tab-screen-bottom">
        <TabBar tabs={MEMBER_TABS} selected="leaderboard" onSelect={onTab} />
      </div>
    </div>
  );
}
