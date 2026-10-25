// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until M0-03 opens the reads and LB-01 and EVT-01 exist,
// every sign-in lands on the EVT-02d skeleton with sample data.

import { useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import { Tournament, type MemberTab } from "./Tournament";
import { Profile } from "./Profile";

type Screen = "tournament" | "profile";

interface Props {
  user: RecordModel;
  onSignOut: () => void;
}

export function MemberApp({ user, onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>("tournament");

  useEffect(() => {
    document.title = screen === "profile" ? "Profile · Chromie Fishing" : `${SAMPLE_TOURNAMENT.name} · Chromie Fishing`;
  }, [screen]);

  function openTab(tab: MemberTab) {
    // Leaderboard (LB-01) and My catches (MY-01) aren't built yet: their tabs stay put.
    if (tab === "profile") setScreen("profile");
    if (tab === "home") setScreen("tournament");
  }

  switch (screen) {
    case "tournament":
      return <Tournament tournament={SAMPLE_TOURNAMENT} onTab={openTab} />;
    case "profile":
      return <Profile user={user} onBack={() => setScreen("tournament")} onSignOut={onSignOut} />;
  }
}
