// MY-06a Catch history: the audit trail of one own catch, newest first, read only (Figma
// 49:2287). Opened by the History link on MY-02 (every MY-02 row offers it, final included).
// A UI skeleton on sample data (lib/sampleMyCatchHistory.ts); the same Timeline item as LB-03.
// Never shown here: event and entry rows (R-AUD-L-03), flag codes, or any action.

import { CatchTimeline } from "../components/catch";
import { NavBar, TabBar } from "../components/ui";
import { historySubtitle, timelineEntries, type CatchAuditRow } from "../lib/catchTimeline";
import type { MyCatchView } from "../lib/myCatches";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  item: MyCatchView;
  /** events.metric: names the changed field, "Weight" or "Length". */
  metric: "weight" | "length";
  /** The catch's audit rows, in any order; the timeline sorts them. */
  history: readonly CatchAuditRow[];
  onBack: () => void;
  onTab: (tab: MemberTab) => void;
}

export function MyCatchHistory({ item, metric, history, onBack, onTab }: Props) {
  const entries = timelineEntries(history, metric);
  return (
    <div className="screen tab-screen">
      <NavBar title="History" backLabel="Catch" backName="Back to Catch" onBack={onBack} />
      <div className="screen-content catch-history">
        <p id="catch-history-subtitle" className="t-callout t-secondary">
          {historySubtitle(item)}
        </p>
        <CatchTimeline entries={entries} labelledBy="catch-history-subtitle" />
      </div>

      <div className="tab-screen-bottom">
        <TabBar tabs={MEMBER_TABS} selected="catches" onSelect={onTab} />
      </div>
    </div>
  );
}
