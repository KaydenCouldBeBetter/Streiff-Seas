// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until M0-03 opens the reads and EVT-01 exists, every
// sign-in lands on the EVT-02d skeleton with sample data.

import { useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { SAMPLE_LEADERBOARD } from "../lib/sampleLeaderboard";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import type { MemberTab } from "./memberTabs";
import { Tournament } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { Profile } from "./Profile";

type Screen = "tournament" | "leaderboard" | "profile";

const TITLES: Record<Screen, string> = {
  tournament: SAMPLE_TOURNAMENT.name,
  leaderboard: `Leaderboard · ${SAMPLE_LEADERBOARD.name}`,
  profile: "Profile",
};

interface Props {
  user: RecordModel;
  onSignOut: () => void;
}

export function MemberApp({ user, onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>("tournament");
  // Profile's back button returns to the screen it was opened from.
  const [profileFrom, setProfileFrom] = useState<Exclude<Screen, "profile">>("tournament");

  useEffect(() => {
    document.title = `${TITLES[screen]} · Chromie Fishing`;
  }, [screen]);

  function openTab(tab: MemberTab) {
    // My catches (MY-01) isn't built yet: its tab stays put.
    if (tab === "home") setScreen("tournament");
    if (tab === "leaderboard") setScreen("leaderboard");
    if (tab === "profile" && screen !== "profile") {
      setProfileFrom(screen);
      setScreen("profile");
    }
  }

  switch (screen) {
    case "tournament":
      return <Tournament tournament={SAMPLE_TOURNAMENT} onTab={openTab} onLeaderboard={() => setScreen("leaderboard")} />;
    case "leaderboard":
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} />;
    case "profile":
      return (
        <Profile
          user={user}
          backTo={profileFrom === "leaderboard" ? "Leaderboard" : "Tournament"}
          onBack={() => setScreen(profileFrom)}
          onSignOut={onSignOut}
        />
      );
  }
}
