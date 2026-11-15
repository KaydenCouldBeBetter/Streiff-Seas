// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until M0-03 opens the reads and EVT-01 exists, every
// sign-in lands on the EVT-02d skeleton with sample data.

import { useEffect, useState, type ReactElement } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { retrySave, roleLabel, saveProfile } from "../lib/profile";
import { SAMPLE_FORMAT, SAMPLE_PROFILE_STATS, SAMPLE_SEASON } from "../lib/sampleProfile";
import { SAMPLE_ANGLER_CATCHES } from "../lib/sampleAnglerCatches";
import { SAMPLE_CATCH_HISTORY } from "../lib/sampleCatchHistory";
import { SAMPLE_LEADERBOARD } from "../lib/sampleLeaderboard";
import { SAMPLE_MY_CATCH_HISTORY } from "../lib/sampleMyCatchHistory";
import { SAMPLE_MY_CATCHES, SAMPLE_MY_CATCHES_CONTEXT } from "../lib/sampleMyCatches";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import { SAMPLE_SUBMIT, createSampleSender } from "../lib/sampleSubmit";
import { AppShell } from "../components/shell";
import { shownOnAnglerPage } from "../lib/anglerCatches";
import { newestFirst } from "../lib/myCatches";
import { useBreakpoint } from "../lib/useBreakpoint";
import { AnglerCatch, AnglerCatchBody } from "./AnglerCatch";
import { AnglerCatches } from "./AnglerCatches";
import type { MemberTab } from "./memberTabs";
import { Tournament } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { MyCatch, MyCatchPane } from "./MyCatch";
import { MyCatchHistory } from "./MyCatchHistory";
import { MyCatches } from "./MyCatches";
import { Profile } from "./Profile";
import { SubmitFlow } from "./SubmitFlow";

type Screen = "tournament" | "leaderboard" | "angler" | "anglerCatch" | "catches" | "catch" | "catchHistory" | "profile" | "submit";

const TITLES: Record<Exclude<Screen, "submit" | "angler" | "anglerCatch">, string> = {
  tournament: SAMPLE_TOURNAMENT.name,
  leaderboard: `Leaderboard · ${SAMPLE_LEADERBOARD.name}`,
  catches: `My catches · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catch: `Catch · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catchHistory: `History · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  profile: "Profile",
};

/** The section a screen belongs to, for the sidebar and rail; Submit a catch belongs to none. */
function tabFor(screen: Screen): MemberTab | null {
  switch (screen) {
    case "tournament":
      return "home";
    case "leaderboard":
    case "angler":
    case "anglerCatch":
      return "leaderboard";
    case "catches":
    case "catch":
    case "catchHistory":
      return "catches";
    case "profile":
      return "profile";
    case "submit":
      return null;
  }
}

interface Props {
  user: RecordModel;
  /** The member's record after a Profile save, so every screen shows the new name and units. */
  onUserChange: (user: RecordModel) => void;
  onSignOut: () => void;
}

export function MemberApp({ user, onUserChange, onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>("tournament");
  const [catchId, setCatchId] = useState<string | null>(null);
  const [anglerEntryId, setAnglerEntryId] = useState<string | null>(null);
  const [anglerCatchId, setAnglerCatchId] = useState<string | null>(null);
  // TODO(S1): the real sender (catchSender.ts) replaces the sample.
  const [sender] = useState(createSampleSender);

  // From 1024 px the lists show their selected item beside them (MY-01 + MY-02, LB-02 + LB-03).
  const expanded = useBreakpoint() === "expanded";

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
    if (tab === "profile") setScreen("profile");
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

  const leaderboard = (
    <Leaderboard
      leaderboard={SAMPLE_LEADERBOARD}
      window={{ endsAt: SAMPLE_TOURNAMENT.endsAt, submitDeadline: SAMPLE_TOURNAMENT.submitDeadline }}
      onTab={openTab}
      onSubmit={() => setScreen("submit")}
      onOpenRow={openAngler}
    />
  );

  // The catch shown beside My catches: the opened one, else the newest.
  const mineSelected = openedCatch ?? newestFirst(SAMPLE_MY_CATCHES)[0];
  const myCatches = (
    <MyCatches
      context={SAMPLE_MY_CATCHES_CONTEXT}
      catches={SAMPLE_MY_CATCHES}
      onOpen={openCatch}
      onSubmit={() => setScreen("submit")}
      onTab={openTab}
      split={
        expanded && mineSelected
          ? {
              selectedId: mineSelected.id,
              detail: <MyCatchPane key={mineSelected.id} context={SAMPLE_MY_CATCHES_CONTEXT} item={mineSelected} history={SAMPLE_MY_CATCH_HISTORY[mineSelected.id] ?? []} />,
            }
          : undefined
      }
    />
  );

  // The angler's page: from 1024 px their selected catch (the opened one, else the newest) sits beside it.
  const anglerShown = newestFirst(shownOnAnglerPage(anglerCatches));
  const anglerSelected = anglerCatch ?? anglerShown[0];
  // TODO(LB-03b): the sample event is live; read events.status once M0-03 exists.
  const final = SAMPLE_MY_CATCHES_CONTEXT.phase === "final";
  const anglerPage = anglerRow ? (
    <AnglerCatches
      key={anglerRow.entryId}
      row={anglerRow}
      unit={SAMPLE_LEADERBOARD.unit}
      bestN={SAMPLE_LEADERBOARD.bestN}
      catches={anglerCatches}
      onOpen={openAnglerCatch}
      onBack={() => setScreen("leaderboard")}
      onTab={openTab}
      split={
        expanded && anglerSelected
          ? {
              selectedId: anglerSelected.id,
              detail: (
                <AnglerCatchBody
                  key={anglerSelected.id}
                  anglerName={anglerRow.displayName}
                  item={anglerSelected}
                  bestN={SAMPLE_LEADERBOARD.bestN}
                  metric={SAMPLE_MY_CATCHES_CONTEXT.metric}
                  history={SAMPLE_CATCH_HISTORY[anglerSelected.id] ?? []}
                  final={final}
                />
              ),
            }
          : undefined
      }
    />
  ) : null;

  const content = ((): ReactElement => {
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
        return leaderboard;
      case "angler":
        return anglerPage ?? leaderboard;
      case "anglerCatch":
        if (anglerRow && anglerCatch) {
          // Beside the list on a wide window; a page of its own below that.
          if (expanded) return anglerPage ?? leaderboard;
          return (
            <AnglerCatch
              key={anglerCatch.id}
              anglerName={anglerRow.displayName}
              item={anglerCatch}
              bestN={SAMPLE_LEADERBOARD.bestN}
              metric={SAMPLE_MY_CATCHES_CONTEXT.metric}
              history={SAMPLE_CATCH_HISTORY[anglerCatch.id] ?? []}
              final={final}
              onBack={() => setScreen("angler")}
              onTab={openTab}
            />
          );
        }
        return leaderboard;
      case "submit":
        // Every submit screen's Back reads "Tournament" (Figma), so it goes there whichever screen opened it.
        return <SubmitFlow tournament={SAMPLE_SUBMIT} sender={sender} onBack={() => setScreen("tournament")} />;
      case "catch":
        if (openedCatch && !expanded) {
          return <MyCatch key={openedCatch.id} context={SAMPLE_MY_CATCHES_CONTEXT} item={openedCatch} onBack={() => setScreen("catches")} onHistory={() => setScreen("catchHistory")} onTab={openTab} />;
        }
        return myCatches;
      case "catchHistory":
        if (openedCatch && !expanded) {
          return (
            <MyCatchHistory
              key={openedCatch.id}
              item={openedCatch}
              metric={SAMPLE_MY_CATCHES_CONTEXT.metric}
              history={SAMPLE_MY_CATCH_HISTORY[openedCatch.id] ?? []}
              onBack={() => setScreen("catch")}
              onTab={openTab}
            />
          );
        }
        return myCatches;
      case "catches":
        return myCatches;
      case "profile":
        return (
          <Profile
            user={user}
            // TODO(M0-03, S2a): the stats are sample data until the member's own entries and catches can be read.
            stats={SAMPLE_PROFILE_STATS}
            season={SAMPLE_SEASON}
            format={SAMPLE_FORMAT}
            onSave={(changes) => saveProfile(pb, user.id, changes)}
            onRetry={(changes) => retrySave(pb, user.id, changes)}
            onUserChange={onUserChange}
            onTab={openTab}
            onSignOut={onSignOut}
          />
        );
    }
  })();

  return (
    <AppShell tab={tabFor(screen)} name={String(user.name ?? "")} role={roleLabel(user.role)} onTab={openTab} onSubmit={() => setScreen("submit")}>
      {content}
    </AppShell>
  );
}
