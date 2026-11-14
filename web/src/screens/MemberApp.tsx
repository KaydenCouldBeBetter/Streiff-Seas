// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until EVT-01 exists, every sign-in lands on the first live
// tournament (liveTournament.ts): Join, Submit a catch and the real sender are live (S1); the
// standing, leaderboard, My catches and Profile stats are still sample data.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { retrySave, saveProfile } from "../lib/profile";
import { SAMPLE_FORMAT, SAMPLE_PROFILE_STATS, SAMPLE_SEASON } from "../lib/sampleProfile";
import { SAMPLE_ANGLER_CATCHES } from "../lib/sampleAnglerCatches";
import { SAMPLE_CATCH_HISTORY } from "../lib/sampleCatchHistory";
import { SAMPLE_LEADERBOARD } from "../lib/sampleLeaderboard";
import { SAMPLE_MY_CATCH_HISTORY } from "../lib/sampleMyCatchHistory";
import { SAMPLE_MY_CATCHES, SAMPLE_MY_CATCHES_CONTEXT } from "../lib/sampleMyCatches";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import { formatClubTime } from "../lib/format";
import { canJoin, canSubmit, joinTournament, livePhase, loadLiveTournament, type LiveTournament } from "../lib/liveTournament";
import { preparePhoto } from "../lib/photoPrepare";
import { unitsOf } from "../lib/profile";
import { createCatchSender } from "../lib/sendCatch";
import { serverNowMs } from "../lib/serverClock";
import { AnglerCatch } from "./AnglerCatch";
import { AnglerCatches } from "./AnglerCatches";
import type { MemberTab } from "./memberTabs";
import { NoTournament, Tournament, type TournamentAction } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { MyCatch } from "./MyCatch";
import { MyCatchHistory } from "./MyCatchHistory";
import { MyCatches } from "./MyCatches";
import { Profile } from "./Profile";
import { SubmitFlow } from "./SubmitFlow";

type Screen = "tournament" | "leaderboard" | "angler" | "anglerCatch" | "catches" | "catch" | "catchHistory" | "profile" | "submit";

const TITLES: Record<Exclude<Screen, "submit" | "angler" | "anglerCatch" | "tournament">, string> = {
  leaderboard: `Leaderboard · ${SAMPLE_LEADERBOARD.name}`,
  catches: `My catches · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catch: `Catch · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  catchHistory: `History · ${SAMPLE_MY_CATCHES_CONTEXT.eventName}`,
  profile: "Profile",
};

type Live = { state: "loading" } | { state: "none" } | { state: "error" } | { state: "ready"; tournament: LiveTournament };

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
  const [live, setLive] = useState<Live>({ state: "loading" });
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState<"not-sent" | "not-accepted" | null>(null);

  const reload = useCallback(async () => {
    try {
      const tournament = await loadLiveTournament(pb, user.id);
      setLive(tournament ? { state: "ready", tournament } : { state: "none" });
    } catch {
      setLive({ state: "error" });
    }
  }, [user.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ready = live.state === "ready" ? live.tournament : null;
  const activeEntryId = ready?.entry.kind === "active" ? ready.entry.id : null;
  const units = unitsOf(user);
  const sender = useMemo(
    () => (ready && activeEntryId ? createCatchSender({ pb, entryId: activeEntryId, metric: ready.submit.metric, units, prepare: preparePhoto }) : null),
    [ready, activeEntryId, units],
  );
  const view = ready
    ? { ...SAMPLE_TOURNAMENT, name: ready.submit.name, rulesLine: ready.rulesLine, endsAt: ready.submit.endsAt, submitDeadline: ready.submit.submitDeadline }
    : SAMPLE_TOURNAMENT;

  const anglerRow = SAMPLE_LEADERBOARD.rows.find((row) => row.entryId === anglerEntryId);
  const anglerCatches = anglerRow ? (SAMPLE_ANGLER_CATCHES[anglerRow.entryId] ?? []) : [];
  const anglerCatch = anglerCatches.find((c) => c.id === anglerCatchId);

  useEffect(() => {
    // SubmitFlow titles its own steps.
    if (screen === "submit") return;
    const angler = `${anglerRow?.displayName ?? "Angler"} · ${SAMPLE_LEADERBOARD.name}`;
    const title = screen === "angler" ? angler : screen === "anglerCatch" ? `Catch · ${angler}` : screen === "tournament" ? (ready ? view.name : "Tournament") : TITLES[screen];
    document.title = `${title} · Chromie Fishing`;
    window.scrollTo(0, 0);
  }, [screen, anglerRow, ready, view.name]);

  /** Every "Submit a catch" button: the form only while submitting is open, else the tournament page says why. */
  function openSubmit() {
    setScreen(ready && sender && canSubmit(ready, serverNowMs()) ? "submit" : "tournament");
  }

  async function join() {
    if (!ready || joining) return;
    setJoining(true);
    setJoinFailed(null);
    const result = await joinTournament(pb, ready.submit.eventId, user.id);
    setJoining(false);
    if (result.kind !== "joined") setJoinFailed(result.kind);
    // Refused means something changed (deadline passed, already joined elsewhere): reload to show it.
    if (result.kind !== "not-sent") await reload();
  }

  function tournamentAction(tournament: LiveTournament): TournamentAction {
    const now = serverNowMs();
    if (canSubmit(tournament, now)) return { kind: "submit", onSubmit: openSubmit };
    if (canJoin(tournament, now)) return { kind: "join", joining, failed: joinFailed, onJoin: () => void join() };
    const { entry } = tournament;
    if (entry.kind === "withdrawn") {
      return entry.bySelf
        ? { kind: "closed", title: "You withdrew", message: "You're not on the leaderboard. Your catches are kept, and pending ones are still judged." }
        : { kind: "closed", title: "Withdrawn by the organizer", message: entry.reason || "You're not on the leaderboard. Your catches are kept." };
    }
    if (livePhase(tournament, now) === "pre") {
      return { kind: "closed", title: "Fishing hasn't started", message: `The fishing window opens ${formatClubTime(tournament.startsAt)}.` };
    }
    return { kind: "closed", title: "Submissions have closed", message: `The deadline was ${formatClubTime(tournament.submit.submitDeadline)}.` };
  }

  function home() {
    if (!ready) return <NoTournament state={live.state === "ready" ? "loading" : live.state} onRetry={() => void reload()} onTab={openTab} />;
    return (
      <Tournament
        tournament={view}
        entry={ready.entry.kind}
        action={tournamentAction(ready)}
        onTab={openTab}
        onMyCatches={() => setScreen("catches")}
        onLeaderboard={() => setScreen("leaderboard")}
      />
    );
  }

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

  switch (screen) {
    case "tournament":
      return home();
    case "leaderboard":
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={openSubmit} onOpenRow={openAngler} />;
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
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={openSubmit} onOpenRow={openAngler} />;
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
      return <Leaderboard leaderboard={SAMPLE_LEADERBOARD} onTab={openTab} onSubmit={openSubmit} onOpenRow={openAngler} />;
    case "submit":
      // Every submit screen's Back reads "Tournament" (Figma), so it goes there whichever screen opened it.
      if (!ready || !sender) return home();
      return (
        <SubmitFlow
          tournament={ready.submit}
          sender={sender}
          onBack={() => {
            setScreen("tournament");
            void reload();
          }}
        />
      );
    case "catch":
      if (openedCatch) {
        return <MyCatch key={openedCatch.id} context={SAMPLE_MY_CATCHES_CONTEXT} item={openedCatch} onBack={() => setScreen("catches")} onHistory={() => setScreen("catchHistory")} onTab={openTab} />;
      }
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onSubmit={openSubmit} onTab={openTab} />;
    case "catchHistory":
      if (openedCatch) {
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
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onSubmit={openSubmit} onTab={openTab} />;
    case "catches":
      return <MyCatches context={SAMPLE_MY_CATCHES_CONTEXT} catches={SAMPLE_MY_CATCHES} onOpen={openCatch} onSubmit={openSubmit} onTab={openTab} />;
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
}
