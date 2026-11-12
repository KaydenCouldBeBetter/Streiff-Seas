// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until M0-03 opens the reads and EVT-01 exists, every
// sign-in lands on the EVT-02d skeleton with sample data.

import { useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { SAMPLE_ANGLER_CATCHES } from "../lib/sampleAnglerCatches";
import { SAMPLE_CATCH_HISTORY } from "../lib/sampleCatchHistory";
import { SAMPLE_LEADERBOARD } from "../lib/sampleLeaderboard";
import { SAMPLE_MY_CATCHES, SAMPLE_MY_CATCHES_CONTEXT } from "../lib/sampleMyCatches";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import { SAMPLE_SUBMIT, createSampleSender } from "../lib/sampleSubmit";
import { AnglerCatch } from "./AnglerCatch";
import { AnglerCatches } from "./AnglerCatches";
import type { MemberTab } from "./memberTabs";
import { Tournament } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { MyCatch } from "./MyCatch";
import { MyCatches } from "./MyCatches";
import { Profile } from "./Profile";
import { SubmitFlow } from "./SubmitFlow";

type Screen = "tournament" | "leaderboard" | "angler" | "anglerCatch" | "catches" | "catch" | "profile" | "submit";
/** The screens Profile opens from, and goes back to. */
type FromScreen = Exclude<Screen, "profile" | "submit">;

const TITLES: Record<Exclude<Screen, "submit" | "angler" | "anglerCatch">, string> = {
  tournament: SAMPLE_TOURNAMENT.name,
  leaderboard: `Leaderboard · ${SAMPLE_LEADERBOARD.name}`,
  catches: `My catches · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catch: `Catch · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  profile: "Profile",
};

const BACK_LABELS: Record<FromScreen, string> = {
  tournament: "Tournament",
  leaderboard: "Leaderboard",
  angler: "Angler's catches",
  anglerCatch: "Catch",
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
  const [anglerEntryId, setAnglerEntryId] = useState<string | null>(null);
  const [anglerCatchId, setAnglerCatchId] = useState<string | null>(null);
  // Profile's back button returns to the screen it was opened from.
  const [profileFrom, setProfileFrom] = useState<FromScreen>("tournament");
  // TODO(S1): the real sender (catchSender.ts) replaces the sample.
  const [sender] = useState(createSampleSender);

  const anglerRow = SAMPLE_LEADERBOARD.rows.find((row) => row.entryId === anglerEntryId);
  const anglerCatches = anglerRow ? (SAMPLE_ANGLER_CATCHES[anglerRow.entryId] ?? []) : [];
  const anglerCatch = anglerCatches.find((c) => c.id === anglerCatchId);

  useEffect(() => {
    // SubmitFlow titles its own steps.
    if (screen === "submit") return;
    const angler = `${anglerRow?.displayName ?? "Angler"} · ${SAMPLE_LEADERBOARD.name}`;
    const title = screen === "angler" ? angler : screen === "anglerCatch" ? `Catch · ${angler}` : TITLES[screen];
    document.title = `${title} · Chromie Fishing`;
    window.scrollTo(0, 0);
  }, [screen, anglerRow]);

  function openTab(tab: MemberTab) {
    if (tab === "home") setScreen("tournament");
    if (tab === "leaderboard") setScreen("leaderboard");
    if (tab === "catches") setScreen("catches");
    if (tab === "profile" && screen !== "profile" && screen !== "submit") {
      setProfileFrom(screen);
      setScreen("profile");
    }
  }

  function openAngler(entryId: string) {
    setAnglerEntryId(entryId);
    setScreen("angler");
  }

  function openAnglerCatch(id: string) {
    setAnglerCatchId(id);
    setScreen("anglerCatch");
  }

  function openCatch(id: string) {
    setCatchId(id);
    setScreen("catch");
  }

  const openedCatch = SAMPLE_MY_CATCHES.find((c) => c.id === catchId);

  switch (screen) {
    case "tournament":
      return (
        <Tournament
          tournament={SAMPLE_TOURNAMENT}
          onTab={openTab}
          onMyCatches={() => setScreen("catches")}
          onLeaderboard={() => setScreen("leaderboard")}
          onSubmit={() => setScreen("submit")}
        />
      );
    case "leaderboard":
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={() => setScreen("submit")} onOpenRow={openAngler} />;
    case "angler":
      if (anglerRow) {
        return (
          <AnglerCatches
            key={anglerRow.entryId}
            row={anglerRow}
            unit={SAMPLE_LEADERBOARD.unit}
            bestN={SAMPLE_LEADERBOARD.bestN}
            catches={anglerCatches}
            onOpen={openAnglerCatch}
            onBack={() => setScreen("leaderboard")}
            onTab={openTab}
          />
        );
      }
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={() => setScreen("submit")} onOpenRow={openAngler} />;
    case "anglerCatch":
      if (anglerRow && anglerCatch) {
        return (
          <AnglerCatch
            key={anglerCatch.id}
            anglerName={anglerRow.displayName}
            item={anglerCatch}
            bestN={SAMPLE_LEADERBOARD.bestN}
            metric={SAMPLE_MY_CATCHES_CONTEXT.metric}
            history={SAMPLE_CATCH_HISTORY[anglerCatch.id] ?? []}
            // TODO(LB-03b): the sample event is live; read events.status once M0-03 exists.
            final={SAMPLE_MY_CATCHES_CONTEXT.phase === "final"}
            onBack={() => setScreen("angler")}
            onTab={openTab}
          />
        );
      }
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={() => setScreen("submit")} onOpenRow={openAngler} />;
    case "submit":
      // Every submit screen's Back reads "Tournament" (Figma), so it goes there whichever screen opened it.
      return <SubmitFlow tournament={SAMPLE_SUBMIT} sender={sender} onBack={() => setScreen("tournament")} />;
    case "catch":
      if (openedCatch) {
        return <MyCatch key={openedCatch.id} context={SAMPLE_MY_CATCHES_CONTEXT} item={openedCatch} onBack={() => setScreen("catches")} onTab={openTab} />;
      }
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onTab={openTab} />;
    case "catches":
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onTab={openTab} />;
    case "profile":
      return (
        <Profile
          user={user}
          backTo={BACK_LABELS[profileFrom]}
          onBack={() => setScreen(profileFrom)}
          onSignOut={onSignOut}
        />
      );
  }
}
