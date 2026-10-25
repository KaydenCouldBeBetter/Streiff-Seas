// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until M0-03 opens the reads and LB-01 and EVT-01 exist,
// every sign-in lands on the EVT-02d skeleton with sample data.

import { useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { SAMPLE_MY_CATCHES, SAMPLE_MY_CATCHES_CONTEXT } from "../lib/sampleMyCatches";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import type { MemberTab } from "./memberTabs";
import { MyCatch } from "./MyCatch";
import { MyCatches } from "./MyCatches";
import { Profile } from "./Profile";
import { Tournament } from "./Tournament";

type Screen = "tournament" | "catches" | "catch" | "profile";

const TITLES: Record<Screen, string> = {
  tournament: SAMPLE_TOURNAMENT.name,
  catches: `My catches · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catch: `Catch · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  profile: "Profile",
};

const BACK_LABELS: Record<Exclude<Screen, "profile">, string> = {
  tournament: "Tournament",
  catches: "My catches",
  catch: "Catch",
};

interface Props {
  user: RecordModel;
  onSignOut: () => void;
}

export function MemberApp({ user, onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>("tournament");
  const [catchId, setCatchId] = useState<string | null>(null);
  // Profile's back button returns to the screen it was opened from.
  const [profileFrom, setProfileFrom] = useState<Exclude<Screen, "profile">>("tournament");

  useEffect(() => {
    document.title = `${TITLES[screen]} · Chromie Fishing`;
    window.scrollTo(0, 0);
  }, [screen]);

  function openTab(tab: MemberTab) {
    // Leaderboard (LB-01) isn't built yet: its tab stays put.
    if (tab === "home") setScreen("tournament");
    if (tab === "catches") setScreen("catches");
    if (tab === "profile" && screen !== "profile") {
      setProfileFrom(screen);
      setScreen("profile");
    }
  }

  function openCatch(id: string) {
    setCatchId(id);
    setScreen("catch");
  }

  const openedCatch = SAMPLE_MY_CATCHES.find((c) => c.id === catchId);

  switch (screen) {
    case "tournament":
      return <Tournament tournament={SAMPLE_TOURNAMENT} onTab={openTab} onMyCatches={() => setScreen("catches")} />;
    case "catch":
      if (openedCatch) {
        return <MyCatch key={openedCatch.id} context={SAMPLE_MY_CATCHES_CONTEXT} item={openedCatch} onBack={() => setScreen("catches")} onTab={openTab} />;
      }
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onTab={openTab} />;
    case "catches":
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onTab={openTab} />;
    case "profile":
      return <Profile user={user} backTo={BACK_LABELS[profileFrom]} onBack={() => setScreen(profileFrom)} onSignOut={onSignOut} />;
  }
}
