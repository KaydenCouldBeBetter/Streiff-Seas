// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). Until EVT-01 exists, every sign-in lands on the first live
// tournament (liveTournament.ts): Join, Submit a catch, the real sender and My catches with its
// history, edit, add photos and retract are real (S1); the standing, leaderboard and Profile
// stats are still sample data.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { retrySave, saveProfile } from "../lib/profile";
import { SAMPLE_FORMAT, SAMPLE_PROFILE_STATS, SAMPLE_SEASON } from "../lib/sampleProfile";
import { SAMPLE_ANGLER_CATCHES } from "../lib/sampleAnglerCatches";
import { SAMPLE_CATCH_HISTORY } from "../lib/sampleCatchHistory";
import { SAMPLE_LEADERBOARD } from "../lib/sampleLeaderboard";
import { SAMPLE_MY_CATCHES_CONTEXT } from "../lib/sampleMyCatches";
import { SAMPLE_TOURNAMENT } from "../lib/sampleTournament";
import { formatClubTime } from "../lib/format";
import { canJoin, canRejoin, canSubmit, canWithdraw, joinTournament, livePhase, loadLiveTournament, setWithdrawn, type LiveTournament } from "../lib/liveTournament";
import { retryChange, sendChange, type CatchBase, type Change, type ChangeResult } from "../lib/changeCatch";
import { changeNotice, type ChangeAction, type ChangeNotice } from "../lib/changeCopy";
import { loadMyCatches, type MyCatchesData } from "../lib/loadMyCatches";
import { preparePhoto } from "../lib/photoPrepare";
import { unitsOf } from "../lib/profile";
import { createCatchSender } from "../lib/sendCatch";
import { serverNowMs } from "../lib/serverClock";
import { OFFLINE_ICONS, usePreloadedIcons } from "../components/ui";
import { AnglerCatch } from "./AnglerCatch";
import { AddPhotos } from "./AddPhotos";
import { AnglerCatches } from "./AnglerCatches";
import { EditCatch } from "./EditCatch";
import type { MemberTab } from "./memberTabs";
import { NoTournament, Tournament, type TournamentAction } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { MyCatch } from "./MyCatch";
import { MyCatchHistory } from "./MyCatchHistory";
import { MyCatches, MyCatchesStatus } from "./MyCatches";
import { Profile } from "./Profile";
import { RetractSheet } from "./RetractSheet";
import { SubmitFlow } from "./SubmitFlow";
import { Withdraw } from "./Withdraw";

type Screen = "tournament" | "withdraw" | "leaderboard" | "angler" | "anglerCatch" | "catches" | "catch" | "catchHistory" | "editCatch" | "addPhotos" | "profile" | "submit";

/** The page title's first part; the screens named after the live tournament add its name. */
const TITLES: Record<Exclude<Screen, "submit" | "angler" | "anglerCatch" | "tournament" | "withdraw">, string> = {
  leaderboard: `Leaderboard · ${SAMPLE_LEADERBOARD.name}`,
  catches: "My catches",
  catch: "Catch",
  catchHistory: "History",
  editCatch: "Edit catch",
  addPhotos: "Add photos",
  profile: "Profile",
};

/** The screens whose title names the live tournament, and that show the member's own catches. */
const MY_CATCH_SCREENS: readonly Screen[] = ["catches", "catch", "catchHistory", "editCatch", "addPhotos"];

type Live = { state: "loading" } | { state: "none" } | { state: "error" } | { state: "ready"; tournament: LiveTournament };

/** My catches: read when it opens and when the app comes back to the foreground (Gap 25). */
type Mine = { state: "loading" } | { state: "error" } | { state: "ready"; data: MyCatchesData };

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
  // NOT SENT shows when the network is gone: its icons are fetched now, while it is there.
  usePreloadedIcons(OFFLINE_ICONS);
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState<"not-sent" | "not-accepted" | null>(null);
  // Withdraw (EVT-03) and rejoin (EVT-02h): one request in flight at a time, and what the last one said.
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryFailed, setEntryFailed] = useState<"not-sent" | "not-accepted" | null>(null);
  // MY-05: the retract sheet over My catch; and what My catch says after a change came back.
  const [retracting, setRetracting] = useState(false);
  const [notice, setNotice] = useState<ChangeNotice | null>(null);
  // The catch as it was when Edit, Add photos or Retract opened. Frozen there, so a refresh in
  // the meantime can't slip the newer rev under the change: it is refused and explained (MY-03b).
  const [changeBase, setChangeBase] = useState<CatchBase | null>(null);

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

  const [mine, setMine] = useState<Mine>({ state: "loading" });
  const onMyCatchScreen = MY_CATCH_SCREENS.includes(screen);

  const loadMine = useCallback(async () => {
    if (!ready) return;
    try {
      const data = await loadMyCatches(pb, ready, user.id, units, serverNowMs());
      setMine({ state: "ready", data });
    } catch {
      // A failed refresh keeps the list already shown; only a first read that fails says so.
      setMine((previous) => (previous.state === "ready" ? previous : { state: "error" }));
    }
  }, [ready, user.id, units]);

  // Each time My catches opens (not on every move within it), and whenever the tournament reloads.
  useEffect(() => {
    if (screen === "catches") void loadMine();
  }, [screen, loadMine]);

  useEffect(() => {
    if (!onMyCatchScreen) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadMine();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onMyCatchScreen, loadMine]);

  const anglerRow = SAMPLE_LEADERBOARD.rows.find((row) => row.entryId === anglerEntryId);
  const anglerCatches = anglerRow ? (SAMPLE_ANGLER_CATCHES[anglerRow.entryId] ?? []) : [];
  const anglerCatch = anglerCatches.find((c) => c.id === anglerCatchId);

  useEffect(() => {
    // SubmitFlow titles its own steps.
    if (screen === "submit") return;
    const angler = `${anglerRow?.displayName ?? "Angler"} · ${SAMPLE_LEADERBOARD.name}`;
    const title =
      screen === "angler" ? angler
      : screen === "anglerCatch" ? `Catch · ${angler}`
      : screen === "tournament" ? (ready ? view.name : "Tournament")
      : screen === "withdraw" ? "Withdraw"
      : MY_CATCH_SCREENS.includes(screen) && ready ? `${TITLES[screen]} · ${view.name}`
      : TITLES[screen];
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

  /** Withdraw (true) or rejoin (false) the member's own entry, then reload. Back to Tournament once it lands. */
  async function changeEntry(withdrawn: boolean) {
    if (!ready || entryBusy || ready.entry.kind === "none") return;
    setEntryBusy(true);
    setEntryFailed(null);
    const result = await setWithdrawn(pb, ready.entry.id, withdrawn);
    setEntryBusy(false);
    if (result.kind === "done") {
      await reload();
      setScreen("tournament");
      return;
    }
    setEntryFailed(result.kind);
    if (result.kind === "not-accepted") await reload();
  }

  function tournamentAction(tournament: LiveTournament): TournamentAction {
    const now = serverNowMs();
    if (canSubmit(tournament, now)) return { kind: "submit", onSubmit: openSubmit };
    if (canJoin(tournament, now)) return { kind: "join", joining, failed: joinFailed, onJoin: () => void join() };
    if (canRejoin(tournament, now)) return { kind: "rejoin", rejoining: entryBusy, failed: entryFailed, onRejoin: () => void changeEntry(false) };
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
        onWithdraw={() => {
          setEntryFailed(null);
          setScreen("withdraw");
        }}
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

  const myData = mine.state === "ready" ? mine.data : null;
  const openedCatch = myData?.catches.find((c) => c.id === catchId);
  const openedBase = catchId ? myData?.bases[catchId] : undefined;

  function startChange(next: "editCatch" | "addPhotos" | "retract") {
    if (!openedBase) return;
    setChangeBase(openedBase);
    setNotice(null);
    if (next === "retract") setRetracting(true);
    else setScreen(next);
  }

  // The notice belongs to the My catch it was shown on; any other screen drops it.
  useEffect(() => {
    if (screen !== "catch") setNotice(null);
  }, [screen]);

  /** Sends one change to the opened catch with the rev it was loaded with; Retry reloads first. */
  const changeSender = (base: CatchBase) => (change: Change, retry: boolean) => (retry ? retryChange : sendChange)(pb, base, change, serverNowMs());

  /** Saved, already saved or refused: reload, then My catch, saying why when it didn't save. */
  async function changeDone(action: ChangeAction, result: ChangeResult, photos = 0) {
    await loadMine();
    setRetracting(false);
    setNotice(changeNotice(action, result, photos));
    setScreen("catch");
  }

  /** My catches, or what stands in for it before the tournament and the first read have landed. */
  function myCatches() {
    // Without a live tournament there's nothing to read; the tab still stays My catches.
    if (!ready) return <MyCatchesStatus state={live.state === "ready" ? "loading" : live.state} onRetry={() => void reload()} onTab={openTab} />;
    if (!myData) return <MyCatchesStatus state={mine.state === "error" ? "error" : "loading"} onRetry={() => void loadMine()} onTab={openTab} />;
    return <MyCatches context={myData.context} catches={myData.catches} onOpen={openCatch} onSubmit={openSubmit} onTab={openTab} />;
  }

  switch (screen) {
    case "tournament":
      return home();
    case "withdraw":
      if (!ready || !canWithdraw(ready)) return home();
      return (
        <Withdraw
          tournamentName={ready.submit.name}
          rejoinUntil={livePhase(ready, serverNowMs()) === "over" ? null : ready.submit.submitDeadline}
          sending={entryBusy}
          failed={entryFailed}
          onConfirm={() => void changeEntry(true)}
          onCancel={() => setScreen("tournament")}
        />
      );
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
      if (myData && openedCatch) {
        return (
          <MyCatch
            key={openedCatch.id}
            context={myData.context}
            item={openedCatch}
            notice={notice}
            onBack={() => setScreen("catches")}
            onHistory={() => setScreen("catchHistory")}
            onSubmit={openSubmit}
            onEdit={() => startChange("editCatch")}
            onAddPhotos={() => startChange("addPhotos")}
            onRetract={() => startChange("retract")}
            sheet={
              retracting && changeBase ? (
                <RetractSheet item={openedCatch} send={changeSender(changeBase)} onDone={(result) => void changeDone("retract", result)} onCancel={() => setRetracting(false)} />
              ) : null
            }
            onTab={openTab}
          />
        );
      }
      return myCatches();
    case "catchHistory":
      if (myData && openedCatch) {
        return (
          <MyCatchHistory
            key={openedCatch.id}
            item={openedCatch}
            metric={myData.context.metric}
            history={myData.history[openedCatch.id] ?? []}
            onBack={() => setScreen("catch")}
            onTab={openTab}
          />
        );
      }
      return myCatches();
    case "editCatch":
      if (ready && myData && changeBase) {
        return (
          <EditCatch
            key={changeBase.id}
            context={myData.context}
            base={changeBase}
            species={ready.submit.species}
            units={units}
            send={changeSender(changeBase)}
            onDone={(result) => void changeDone("edit", result)}
            onCancel={() => setScreen("catch")}
          />
        );
      }
      return myCatches();
    case "addPhotos":
      if (myData && openedCatch && changeBase) {
        return (
          <AddPhotos
            key={changeBase.id}
            item={openedCatch}
            base={changeBase}
            metric={myData.context.metric}
            prepare={preparePhoto}
            send={changeSender(changeBase)}
            onDone={(result, photos) => void changeDone("photos", result, photos)}
            onCancel={() => setScreen("catch")}
          />
        );
      }
      return myCatches();
    case "catches":
      return myCatches();
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
