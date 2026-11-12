// The member tab bar's tabs, shared by the top-level screens (Figma Tab bar, Member).

import type { Tab } from "../components/ui";

export type MemberTab = "home" | "leaderboard" | "catches" | "profile";

// Member tabs: Home · Leaderboard · My catches · Profile. The Judge tab (JDG-00a) joins
// them only for a judge or backup judge of a live or closed tournament.
export const MEMBER_TABS: readonly Tab<MemberTab>[] = [
  { id: "home", label: "Home", icon: "/icons/home.svg", selectedIcon: "/icons/home-selected.svg" },
  // Figma draws the leaderboard icon the same in both states.
  { id: "leaderboard", label: "Leaderboard", icon: "/icons/leaderboard.svg" },
  { id: "catches", label: "My catches", icon: "/icons/list-tab.svg", selectedIcon: "/icons/list.svg" },
  { id: "profile", label: "Profile", icon: "/icons/person-tab.svg", selectedIcon: "/icons/person-selected.svg" },
];
