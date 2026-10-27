// MY-01 My catches: the angler's own catches in one tournament, every status, newest first
// (Figma 47:1448 empty, 47:1536 list, 102:6949 final). A UI skeleton on sample data:
// controls whose screens aren't built yet carry a TodoTag with the screens.md row they open.
// The list refreshes on open and when the app returns to the foreground; it is not live
// (Gap 25, settled 2026-10-05).

import { CatchCard } from "../components/catch";
import { AccessoryBar, Banner, Button, EmptyState, LargeNavBar, TabBar } from "../components/ui";
import { myCatchesRow, myCatchesSubtitle, newestFirst, submittingOpen, type MyCatchesContext, type MyCatchView } from "../lib/myCatches";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  context: MyCatchesContext;
  catches: readonly MyCatchView[];
  onOpen: (id: string) => void;
  onTab: (tab: MemberTab) => void;
}

export function MyCatches({ context, catches, onOpen, onTab }: Props) {
  const row = myCatchesRow(context, catches.length);
  const canSubmit = submittingOpen(context);
  return (
    <div className="screen tab-screen">
      <LargeNavBar title="My catches" subtitle={myCatchesSubtitle(context, catches)} />
      <div className="screen-content catch-list">
        {row === "MY-01a" ? (
          <EmptyState
            icon="/icons/list-large.svg"
            title="Nothing submitted yet"
            message={`Your catches in ${context.eventName} will show up here with their status: pending, verified or rejected.`}
            action={
              canSubmit && (
                <Button variant="primary" todo="SUB-01">
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
            <ul className="catch-list-items">
              {newestFirst(catches).map((item) => (
                <li key={item.id}>
                  <CatchCard item={item} bestN={context.bestN} archived={row === "MY-01c"} onOpen={() => onOpen(item.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="tab-screen-bottom">
        {row !== "MY-01a" && canSubmit && (
          <AccessoryBar>
            <Button variant="primary" full icon="/icons/plus-on-primary.svg" todo="SUB-01">
              Submit a catch
            </Button>
          </AccessoryBar>
        )}
        <TabBar tabs={MEMBER_TABS} selected="catches" onSelect={onTab} />
      </div>
    </div>
  );
}
