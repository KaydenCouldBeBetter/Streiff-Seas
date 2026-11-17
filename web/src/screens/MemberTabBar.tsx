// The member tab bar every top-level screen draws, with the Judge tab when the viewer judges a live
// or closed tournament (screens.md §0 Tabs; decisions.md 2026-10-05 "The Judge tab opens a
// Judging home"). MemberApp says which tabs apply through MemberTabsContext, so the screens don't
// each need to know.

import { createContext, useContext } from "react";
import type { Tab } from "../components/ui";
import { TabBar } from "../components/ui";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

export const MemberTabsContext = createContext<readonly Tab<MemberTab>[]>(MEMBER_TABS);

/** The tabs that apply to the signed-in member. */
export function useMemberTabs(): readonly Tab<MemberTab>[] {
  return useContext(MemberTabsContext);
}

export function MemberTabBar({ selected, onSelect }: { selected: MemberTab; onSelect: (tab: MemberTab) => void }) {
  return <TabBar tabs={useMemberTabs()} selected={selected} onSelect={onSelect} />;
}
