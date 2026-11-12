// LB-03 Catch detail: one pending or verified catch by another angler, with its photos and the
// History of what happened to it (Figma 60:2986 LB-03a; 104:10164 LB-03b, once final). Opened
// from a catch card on LB-02. A UI skeleton on sample data (lib/sampleCatchHistory.ts).
// Never shown here: any change (edit, add photos, retract, approve: R-CAT-U-22, U-10), the
// page of a catch that is now rejected or retracted or on a withdrawn entry (R-CAT-V-01,
// R-AUD-L-06: LB-02 doesn't list them), or flag codes.
// TODO(LB-03a): view a photo full size; MY-02's viewer has no full-size view yet either.

import { CatchStatusChip, CatchTimeline, InBestMarker, PhotoViewer } from "../components/catch";
import { Banner, NavBar, TabBar } from "../components/ui";
import type { AnglerCatchView } from "../lib/anglerCatches";
import { timelineEntries, type CatchAuditRow } from "../lib/catchTimeline";
import { formatClubTime } from "../lib/format";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  /** The angler's name: the back label, and beside the species. */
  anglerName: string;
  item: AnglerCatchView;
  /** events.best_n: "In best 10". */
  bestN: number;
  metric: "weight" | "length";
  /** The catch's audit rows, in any order; the timeline sorts them. */
  history: readonly CatchAuditRow[];
  /** events.status is final (LB-03b): "Photo archived" in place of every photo, history unchanged. */
  final: boolean;
  onBack: () => void;
  onTab: (tab: MemberTab) => void;
}

export function AnglerCatch({ anglerName, item, bestN, metric, history, final, onBack, onTab }: Props) {
  const entries = timelineEntries(history, metric);
  return (
    <div className="screen tab-screen">
      <NavBar title="Catch" backLabel={anglerName} backName={`Back to ${anglerName}`} onBack={onBack} />
      <div className="screen-content catch-detail">
        {final && (
          <Banner tone="neutral" icon="/icons/lock-neutral.svg" title="Final">
            Photos are archived. The history is unchanged.
          </Banner>
        )}

        <PhotoViewer photos={item.photos} archived={final} />

        <div className="catch-summary">
          <p className="measurement">
            <span className="t-number-display">{item.measurement.value}</span>
            <span className="t-title-section t-secondary">{item.measurement.unit}</span>
          </p>
          <p className="t-headline">
            {item.species} · {anglerName}
          </p>
          <p className="chips">
            <CatchStatusChip status={item.status} />
            {item.status === "verified" && item.inBest && <InBestMarker bestN={bestN} />}
          </p>
        </div>

        <dl className="card card-sunken t-callout">
          <div className="fact">
            <dt className="t-secondary">Submitted</dt>
            <dd className="t-callout-strong">{formatClubTime(item.created)}</dd>
          </div>
          {item.capturedAt && (
            <div className="fact">
              <dt className="t-secondary">Photo taken</dt>
              <dd className="t-callout-strong">{formatClubTime(item.capturedAt)}</dd>
            </div>
          )}
        </dl>

        <h2 id="history-heading" className="t-title-section">
          History
        </h2>
        <CatchTimeline entries={entries} labelledBy="history-heading" />
      </div>

      <div className="tab-screen-bottom">
        <TabBar tabs={MEMBER_TABS} selected="leaderboard" onSelect={onTab} />
      </div>
    </div>
  );
}
