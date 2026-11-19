// MY-01 My catches: the angler's own catches in one tournament, every status, newest first
// (Figma 47:1448 empty, 47:1536 list, 102:6949 final), read by lib/loadMyCatches.ts.
// Submit a catch opens SUB-01 (SubmitFlow).
// The list refreshes on open and when the app returns to the foreground; it is not live
// (Gap 25, settled 2026-10-05). MyCatchesStatus stands in when there's no list to show.

import type { ReactNode } from "react";
import { CatchCard } from "../components/catch";
import { AccessoryBar, Banner, Button, EmptyState, LargeNavBar } from "../components/ui";
import { formatClubTime } from "../lib/format";
import { myCatchesRow, myCatchesSubtitle, newestFirst, submittingOpen, type MyCatchesContext, type MyCatchView } from "../lib/myCatches";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

interface Props {
  context: MyCatchesContext;
  catches: readonly MyCatchView[];
  onOpen: (id: string) => void;
  /** Submit a catch opens SUB-01 (SubmitFlow). */
  onSubmit: () => void;
  onTab: (tab: MemberTab) => void;
  /**
   * From 1024 px the list and the selected catch share the page (MY-01, MY-02 and MY-06 in one
   * view, Figma 222:1408): `detail` is the catch pane and `selectedId` marks its card.
   */
  split?: { selectedId: string; detail: ReactNode };
  /** Back to the tournament's page when these aren't the live tournament's catches (a past one). */
  back?: { label: string; onBack: () => void };
}

export function MyCatches({ context, catches, onOpen, onSubmit, onTab, split, back }: Props) {
  const row = myCatchesRow(context, catches.length);
  const canSubmit = submittingOpen(context);
  return (
    <div className="screen tab-screen screen-wide">
      <LargeNavBar title="My catches" subtitle={myCatchesSubtitle(context, catches)} back={back} />
      <div className={`screen-content catch-list${split && row !== "MY-01a" ? " catch-split" : ""}`}>
        {row === "MY-01a" ? (
          <EmptyState
            icon="/icons/list-large.svg"
            title="Nothing submitted yet"
            message={`Your catches in ${context.eventName} will show up here with their status: pending, verified or rejected.`}
            action={
              canSubmit && (
                <Button variant="primary" onClick={onSubmit}>
                  Submit a catch
                </Button>
              )
            }
          />
        ) : (
          <>
            {row === "MY-01c" && (
              <Banner tone="neutral" icon="/icons/lock-neutral.svg" title="Final">
                Results are final. Photos are archived and nothing can change.
              </Banner>
            )}
            <ul className="catch-list-items catch-split-list" aria-label="Your catches">
              {newestFirst(catches).map((item) => (
                <li key={item.id}>
                  <CatchCard
                    selected={split?.selectedId === item.id}
                    thumbnailUrl={item.photos[0]?.url ?? null}
                    archived={row === "MY-01c"}
                    value={item.measurement.value}
                    unit={item.measurement.unit}
                    title={item.species}
                    time={`Submitted ${formatClubTime(item.created)}`}
                    status={item.status}
                    inBestN={item.status === "verified" && item.inBest ? context.bestN : undefined}
                    reason={item.status === "rejected" ? item.reason : undefined}
                    onClick={() => onOpen(item.id)}
                  />
                </li>
              ))}
            </ul>
            {split && <section className="catch-split-detail" aria-label="Selected catch">{split.detail}</section>}
          </>
        )}
      </div>

      <div className="tab-screen-bottom">
        {row !== "MY-01a" && canSubmit && (
          <AccessoryBar>
            <Button variant="primary" full icon="/icons/plus-on-primary.svg" onClick={onSubmit}>
              Submit a catch
            </Button>
          </AccessoryBar>
        )}
        <MemberTabBar selected="catches" onSelect={onTab} />
      </div>
    </div>
  );
}

const STATUS_COPY = {
  loading: { title: "Loading…", message: "Getting your catches." },
  none: { title: "No live tournament", message: "When the organizer opens a tournament and you join it, your catches show here." },
  error: { title: "Couldn't load your catches", message: "Check your signal and try again." },
};

/** My catches with no list to show: still loading, no live tournament, or the read failed. Stays on its own tab. */
export function MyCatchesStatus({ state, onRetry, onTab }: { state: "loading" | "none" | "error"; onRetry: () => void; onTab: (tab: MemberTab) => void }) {
  const copy = STATUS_COPY[state];
  return (
    <div className="screen tab-screen">
      <LargeNavBar title="My catches" />
      <div className="screen-content">
        <EmptyState
          icon="/icons/list-large.svg"
          title={copy.title}
          message={copy.message}
          action={
            state === "error" ? (
              <Button variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
        />
      </div>
      <div className="tab-screen-bottom">
        <MemberTabBar selected="catches" onSelect={onTab} />
      </div>
    </div>
  );
}
