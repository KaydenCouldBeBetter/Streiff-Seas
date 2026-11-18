// The signed-in screens and the moves between them (screens.md §3).
//
// Landing (decisions.md 2026-10-03 "Home screen and landing"): one live entry lands on that
// tournament's leaderboard (LB-01), two or more on the Tournaments list (EVT-01d), anyone
// else on Tournaments (EVT-01a). For now (decisions.md 2026-11-17 "Tournaments list") every
// sign-in lands on the first live tournament's page, or on Tournaments (EVT-01, the Home tab)
// when none is live; the list opens any other tournament, whose page, leaderboard and catches the
// rest of the app then shows. The organizer's Manage, the tournament form, Extend, Exports and
// Species (ORG-01 to ORG-07, ORG-10) are S4's. Join, Submit a catch, the real sender and My catches with its
// history, edit, add photos and retract are real (S1); the leaderboard, kept live while it or an
// angler's page is open, the angler pages and the standing on the tournament page are real (S2b);
// the Judge tab (JDG-00 to JDG-05) and the organizer's Entries (ORG-08, ORG-09) are S3's; Profile
// stats are still sample data.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { checkSession } from "../lib/auth";
import { retrySave, roleLabel, saveProfile } from "../lib/profile";
import { SAMPLE_FORMAT, SAMPLE_PROFILE_STATS, SAMPLE_SEASON } from "../lib/sampleProfile";
import { loadLeaderboard, type LeaderboardData } from "../lib/leaderboard";
import { loadAnglerCatches, type AnglerCatchesData } from "../lib/loadAnglerCatches";
import { useLive } from "../lib/useLive";
import { judgesAny } from "../lib/judging";
import { Entries } from "./Entries";
import { EventForm } from "./EventForm";
import { Exports } from "./Exports";
import { ExtendDeadline } from "./ExtendDeadline";
import { Manage } from "./Manage";
import { Species } from "./Species";
import { Tournaments } from "./Tournaments";
import { loadNewEventOptions, type ManageData, type Person } from "../lib/eventAdmin";
import { JudgeFlow } from "./Judging";
import { MemberTabsContext } from "./MemberTabBar";
import { memberTabs } from "./memberTabs";
import { SAMPLE_TOURNAMENT, type TournamentView } from "../lib/sampleTournament";
import { formatClubTime } from "../lib/format";
import { canJoin, canRejoin, canSubmit, canWithdraw, joinTournament, livePhase, loadTournament, setWithdrawn, statusOf, type LiveTournament } from "../lib/liveTournament";
import { retryChange, sendChange, type CatchBase, type Change, type ChangeResult } from "../lib/changeCatch";
import { changeNotice, type ChangeAction, type ChangeNotice } from "../lib/changeCopy";
import { loadMyCatches, type MyCatchesData } from "../lib/loadMyCatches";
import { preparePhoto } from "../lib/photoPrepare";
import { unitsOf } from "../lib/profile";
import { createCatchSender } from "../lib/sendCatch";
import { serverNowMs } from "../lib/serverClock";
import { shownOnAnglerPage } from "../lib/anglerCatches";
import { newestFirst } from "../lib/myCatches";
import { useBreakpoint } from "../lib/useBreakpoint";
import { AppShell } from "../components/shell";
import { OFFLINE_ICONS, usePreloadedIcons } from "../components/ui";
import { AnglerCatch, AnglerCatchBody } from "./AnglerCatch";
import { AddPhotos } from "./AddPhotos";
import { AnglerCatches } from "./AnglerCatches";
import { EditCatch } from "./EditCatch";
import type { MemberTab } from "./memberTabs";
import { NoTournament, Tournament, type TournamentAction } from "./Tournament";
import { Leaderboard } from "./Leaderboard";
import { MyCatch, MyCatchPane } from "./MyCatch";
import { MyCatchHistory } from "./MyCatchHistory";
import { MyCatches, MyCatchesStatus } from "./MyCatches";
import { Profile } from "./Profile";
import { RetractSheet } from "./RetractSheet";
import { SubmitFlow } from "./SubmitFlow";
import { Withdraw } from "./Withdraw";
import { ClubRules } from "./ClubRules";
import { thisTournament } from "../lib/clubRules";

type Screen =
  | "tournament"
  | "withdraw"
  | "leaderboard"
  | "angler"
  | "anglerCatch"
  | "catches"
  | "catch"
  | "catchHistory"
  | "editCatch"
  | "addPhotos"
  | "profile"
  | "submit"
  | "clubRules"
  | "judge"
  | "entries"
  | "tournaments"
  | "manage"
  | "eventForm"
  | "extend"
  | "exports"
  | "species";

/** The screens that set their own page title. */
const SELF_TITLED: readonly Screen[] = ["submit", "judge", "entries", "tournaments", "manage", "eventForm", "extend", "exports", "species"];

/** The page title's first part; the screens named after the live tournament add its name. */
const TITLES: Record<Exclude<Screen, "submit" | "angler" | "anglerCatch" | "tournament" | "withdraw" | "judge" | "entries" | "tournaments" | "manage" | "eventForm" | "extend" | "exports" | "species">, string> = {
  leaderboard: "Leaderboard",
  catches: "My catches",
  catch: "Catch",
  catchHistory: "History",
  editCatch: "Edit catch",
  addPhotos: "Add photos",
  profile: "Profile",
  clubRules: "Club rules",
};

/** The section a screen belongs to, for the sidebar and rail; Submit a catch belongs to none. */
function tabFor(screen: Screen, rulesFrom: "tournament" | "profile"): MemberTab | null {
  switch (screen) {
    case "tournament":
    case "withdraw":
    case "entries":
    case "tournaments":
    case "manage":
    case "eventForm":
    case "extend":
    case "exports":
    case "species":
      return "home";
    case "judge":
      return "judge";
    case "leaderboard":
    case "angler":
    case "anglerCatch":
      return "leaderboard";
    case "catches":
    case "catch":
    case "catchHistory":
    case "editCatch":
    case "addPhotos":
      return "catches";
    case "profile":
      return "profile";
    case "clubRules":
      return rulesFrom === "profile" ? "profile" : "home";
    case "submit":
      return null;
  }
}

/** The screens whose title names the live tournament, and that show the member's own catches. */
const MY_CATCH_SCREENS: readonly Screen[] = ["catches", "catch", "catchHistory", "editCatch", "addPhotos"];

/** The board stays live (subscribed) while any of these is open, so going back to it doesn't reconnect. */
const BOARD_SCREENS: readonly Screen[] = ["leaderboard", "angler", "anglerCatch"];

/** An angler's page (LB-02, LB-03): read when it opens and when the app comes back to the foreground (Gap 25). */
type AnglerPage = { state: "loading" } | { state: "error" } | { state: "ready"; data: AnglerCatchesData };

/** The tournament page's standing: the board read once when the page opens and on focus. */
type StandingRead = { state: "loading" } | { state: "error" } | { state: "ready"; data: LeaderboardData };

type Live = { state: "loading" } | { state: "none" } | { state: "error" } | { state: "ready"; tournament: LiveTournament };

/** My catches: read when it opens and when the app comes back to the foreground (Gap 25). */
type Mine = { state: "loading" } | { state: "error" } | { state: "ready"; data: MyCatchesData };

interface Props {
  user: RecordModel;
  /** The member's record after a Profile save, so every screen shows the new name and units. */
  onUserChange: (user: RecordModel) => void;
  onSignOut: () => void;
  /** SYS-04a: the session expired or was refused while the app was in the background. */
  onSessionEnded: (email: string) => void;
}

/** The "Dates and rules" panel's facts from the live event: the same words Club rules uses for "This tournament". */
function rulesPanel(tournament: LiveTournament): TournamentView["rules"] {
  const facts = thisTournament(tournament);
  const fact = (label: string) => facts.find((f) => f.label === label)?.value ?? "";
  return { scoring: fact("Scored by"), species: fact("Species"), codeWord: fact("Code word") === "On" ? "On" : "Off" };
}

/** How often coming back to the app re-checks the session (lib/auth.ts checkSession). */
const SESSION_RECHECK_MS = 10 * 60 * 1000;

export function MemberApp({ user, onUserChange, onSignOut, onSessionEnded }: Props) {
  const [screen, setScreen] = useState<Screen>("tournament");
  /** Where Club rules (RULES-01a) was opened: a tournament page adds that tournament's section (Gap 37). */
  const [rulesFrom, setRulesFrom] = useState<"tournament" | "profile">("tournament");
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
  // EVT-01: the tournament the member opened from the list; null is the first live one.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // ORG-01 to ORG-07: what Manage loaded, for the form and Extend; what they saved, for Manage.
  const [manageData, setManageData] = useState<ManageData | null>(null);
  const [manageSaved, setManageSaved] = useState<string | null>(null);
  const [newOptions, setNewOptions] = useState<{ people: Person[]; species: { id: string; name: string }[] } | null>(null);
  const [entriesFrom, setEntriesFrom] = useState<"tournament" | "manage">("tournament");
  const [speciesFrom, setSpeciesFrom] = useState<"tournaments">("tournaments");
  const organizer = user.role === "organizer";

  const reload = useCallback(async () => {
    try {
      const tournament = await loadTournament(pb, user.id, selectedEventId);
      setLive(tournament ? { state: "ready", tournament } : { state: "none" });
    } catch {
      setLive({ state: "error" });
    }
  }, [user.id, selectedEventId]);

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
  const eventId = ready?.submit.eventId ?? null;

  // LB-01: live while the board or an angler's page is open; every message refetches (useLive).
  const loadBoard = useCallback(() => loadLeaderboard(pb, eventId ?? "", user.id, units, serverNowMs()), [eventId, user.id, units]);
  const board = useLive(eventId && BOARD_SCREENS.includes(screen) ? loadBoard : null);
  const boardData = board.data?.eventId === eventId ? board.data : undefined;

  // EVT-02's standing card: the same read, once on open and on focus (it isn't a live screen).
  const [standingRead, setStandingRead] = useState<StandingRead>({ state: "loading" });
  const loadStanding = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await loadLeaderboard(pb, eventId, user.id, units, serverNowMs());
      setStandingRead({ state: "ready", data });
    } catch {
      // A failed refresh keeps the standing already shown.
      setStandingRead((previous) => (previous.state === "ready" && previous.data.eventId === eventId ? previous : { state: "error" }));
    }
  }, [eventId, user.id, units]);

  useEffect(() => {
    if (screen !== "tournament") return;
    void loadStanding();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadStanding();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [screen, loadStanding]);

  const standingData = standingRead.state === "ready" && standingRead.data.eventId === eventId ? standingRead.data : null;
  const ownRow = standingData?.view.you ?? null;

  const view: TournamentView = ready
    ? {
        ...SAMPLE_TOURNAMENT,
        status: statusOf(ready),
        name: ready.submit.name,
        rulesLine: ready.rulesLine,
        startsAt: ready.startsAt,
        endsAt: ready.submit.endsAt,
        submitDeadline: ready.submit.submitDeadline,
        rules: rulesPanel(ready),
        standing: standingData
          ? ownRow && {
              place: ownRow.place,
              tied: ownRow.tied,
              total: ownRow.total,
              unit: standingData.view.unit,
              counted: ownRow.counted,
              bestN: standingData.view.bestN,
            }
          : standingRead.state === "error"
            ? "unavailable"
            : undefined,
        catches: standingData?.mine,
      }
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

  // A phone keeps the app in memory for days, so coming back to it counts as opening it: the
  // token is refreshed (decisions.md 2026-10-07), and one that has ended shows SYS-04a. AuthFlow
  // has just checked on open; no signal keeps the session (checkSession).
  const sessionCheckedAt = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - sessionCheckedAt.current < SESSION_RECHECK_MS) return;
      sessionCheckedAt.current = Date.now();
      void checkSession(pb).then((session) => {
        if (session.kind === "ended") onSessionEnded(session.email);
        else if (session.kind === "active") onUserChange(session.user);
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onSessionEnded, onUserChange]);

  // The Judge tab shows for the judge or backup judge of a live or closed tournament (screens.md
  // §0 Tabs): checked on open and when the app comes back to the foreground.
  const [judges, setJudges] = useState(false);
  const [judgeVisit, setJudgeVisit] = useState(0);
  useEffect(() => {
    let current = true;
    const check = () => void judgesAny(pb, user.id).then((yes) => current && setJudges(yes), () => {});
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user.id]);
  const tabs = useMemo(() => memberTabs(judges), [judges]);

  // From 1024 px the lists show their selected item beside them (MY-01 + MY-02, LB-02 + LB-03).
  const expanded = useBreakpoint() === "expanded";

  // LB-02 and LB-03: the tapped angler's row from the live board, their catches read on open.
  const anglerRow = boardData?.view.rows.find((row) => row.entryId === anglerEntryId);
  const [anglerPage, setAnglerPage] = useState<AnglerPage>({ state: "loading" });
  const anglerData = anglerPage.state === "ready" && anglerPage.data.entryId === anglerEntryId ? anglerPage.data : null;
  const anglerCatches = anglerData?.catches ?? [];
  const anglerCatch = anglerCatches.find((c) => c.id === anglerCatchId);
  const onAnglerScreen = screen === "angler" || screen === "anglerCatch";

  const loadAngler = useCallback(
    async (entryId: string) => {
      try {
        const data = await loadAnglerCatches(pb, entryId, user.id, units);
        setAnglerPage({ state: "ready", data });
      } catch {
        // A failed refresh keeps the page already shown.
        setAnglerPage((previous) => (previous.state === "ready" && previous.data.entryId === entryId ? previous : { state: "error" }));
      }
    },
    [user.id, units],
  );

  useEffect(() => {
    if (!onAnglerScreen || !anglerEntryId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadAngler(anglerEntryId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onAnglerScreen, anglerEntryId, loadAngler]);

  useEffect(() => {
    // SubmitFlow, the judge's screens, Entries and the organizer's screens title their own.
    if (SELF_TITLED.includes(screen)) {
      window.scrollTo(0, 0);
      return;
    }
    const angler = `${anglerRow?.displayName ?? "Angler"} · ${ready ? view.name : "Leaderboard"}`;
    const title =
      screen === "angler" ? angler
      : screen === "anglerCatch" ? `Catch · ${angler}`
      : screen === "tournament" ? (ready ? view.name : "Tournament")
      : screen === "withdraw" ? "Withdraw"
      : (MY_CATCH_SCREENS.includes(screen) || screen === "leaderboard") && ready ? `${TITLES[screen as keyof typeof TITLES]} · ${view.name}`
      : TITLES[screen as keyof typeof TITLES];
    document.title = `${title} · Streiff Seas`;
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
    const status = statusOf(tournament);
    if (status === "draft") return { kind: "closed", title: "Draft", message: "Only you can see this tournament. Members see it once you open it." };
    if (status === "closed") return { kind: "closed", title: "Closed", message: "Submissions are over. Judging carries on until the organizer finalizes." };
    if (status === "final") return { kind: "closed", title: "Final", message: "Results are final. Photos are archived; the history is unchanged." };
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

  /** EVT-01: open one tournament's page; the rest of the app follows it. */
  function openTournament(eventId: string) {
    if (eventId !== selectedEventId) {
      setSelectedEventId(eventId);
      setLive({ state: "loading" });
      setStandingRead({ state: "loading" });
      setMine({ state: "loading" });
    }
    setScreen("tournament");
  }

  function tournaments() {
    return (
      <Tournaments
        me={user.id}
        units={units}
        organizer={organizer}
        onOpen={openTournament}
        onNewTournament={() => void openNewTournament()}
        onSpecies={() => {
          setSpeciesFrom("tournaments");
          setScreen("species");
        }}
        onClubRules={() => openClubRules("tournament")}
        onTab={openTab}
      />
    );
  }

  /** ORG-02a: the form needs the people and species first. */
  async function openNewTournament() {
    setManageData(null);
    setNewOptions(null);
    setScreen("eventForm");
    try {
      setNewOptions(await loadNewEventOptions(pb));
    } catch {
      setScreen("tournaments");
    }
  }

  function home() {
    if (!ready) {
      // No live tournament: Home is the Tournaments list (EVT-01a).
      if (live.state === "none") return tournaments();
      return <NoTournament state={live.state === "ready" ? "loading" : live.state} onRetry={() => void reload()} onTab={openTab} onClubRules={() => openClubRules("tournament")} />;
    }
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
        onClubRules={() => openClubRules("tournament")}
        onEntries={
          organizer
            ? () => {
                setEntriesFrom("tournament");
                setScreen("entries");
              }
            : undefined
        }
        onManage={
          organizer
            ? () => {
                setManageSaved(null);
                setScreen("manage");
              }
            : undefined
        }
      />
    );
  }

  function openClubRules(from: "tournament" | "profile") {
    setRulesFrom(from);
    setScreen("clubRules");
  }

  function openTab(tab: MemberTab) {
    if (tab === "home") setScreen("tournaments");
    if (tab === "leaderboard") setScreen("leaderboard");
    if (tab === "catches") setScreen("catches");
    if (tab === "profile") setScreen("profile");
    if (tab === "judge") {
      // The Judge tab always opens the Judging home, even from inside a queue.
      setJudgeVisit((n) => n + 1);
      setScreen("judge");
    }
  }

  function openAngler(entryId: string) {
    setAnglerEntryId(entryId);
    setAnglerCatchId(null);
    if (!(anglerPage.state === "ready" && anglerPage.data.entryId === entryId)) setAnglerPage({ state: "loading" });
    void loadAngler(entryId);
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

  /** Edit, Add photos or Retract on a catch: the opened one, or the one the wide pane is showing. */
  function startChange(next: "editCatch" | "addPhotos" | "retract", id = catchId) {
    const base = id ? myData?.bases[id] : undefined;
    if (!id || !base) return;
    setCatchId(id);
    setChangeBase(base);
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
    // From 1024 px the opened catch (else the newest) sits beside the list with its History (MY-01, MY-02, MY-06).
    const selected = openedCatch ?? newestFirst(myData.catches)[0];
    return (
      <MyCatches
        context={myData.context}
        catches={myData.catches}
        onOpen={openCatch}
        onSubmit={openSubmit}
        onTab={openTab}
        split={
          expanded && selected
            ? {
                selectedId: selected.id,
                detail: (
                  <MyCatchPane
                    key={selected.id}
                    context={myData.context}
                    item={selected}
                    history={myData.history[selected.id] ?? []}
                    notice={notice}
                    onEdit={() => startChange("editCatch", selected.id)}
                    onAddPhotos={() => startChange("addPhotos", selected.id)}
                    onRetract={() => startChange("retract", selected.id)}
                    sheet={
                      retracting && changeBase ? (
                        <RetractSheet item={selected} send={changeSender(changeBase)} onDone={(result) => void changeDone("retract", result)} onCancel={() => setRetracting(false)} />
                      ) : null
                    }
                  />
                ),
              }
            : undefined
        }
      />
    );
  }

  // Without a live tournament there's no board: the tournament screen says why (NoTournament).
  const leaderboard = ready ? (
    <Leaderboard
      name={ready.submit.name}
      leaderboard={boardData?.view}
      // A final board can't change, so it shows no badge (Gap 25).
      badge={boardData?.status === "final" ? null : board.badge}
      canSubmit={canSubmit(ready, serverNowMs())}
      onClubRules={() => openClubRules("tournament")}
      window={{ endsAt: ready.submit.endsAt, submitDeadline: ready.submit.submitDeadline }}
      onTab={openTab}
      onSubmit={openSubmit}
      onOpenRow={openAngler}
    />
  ) : (
    home()
  );

  // The angler's page: from 1024 px their selected catch (the opened one, else the newest) sits beside it.
  const anglerShown = newestFirst(shownOnAnglerPage(anglerCatches));
  const anglerSelected = anglerCatch ?? anglerShown[0];
  const final = boardData?.status === "final";
  const metric = boardData?.metric ?? ready?.submit.metric ?? "weight";
  const bestN = boardData?.view.bestN ?? ready?.bestN ?? 10;
  const anglerScreen = anglerRow && boardData ? (
    <AnglerCatches
      key={anglerRow.entryId}
      row={anglerRow}
      unit={boardData.view.unit}
      bestN={bestN}
      catches={anglerCatches}
      status={anglerData ? undefined : anglerPage.state === "error" ? "error" : "loading"}
      onRetry={() => void loadAngler(anglerRow.entryId)}
      onOpen={openAnglerCatch}
      onBack={() => setScreen("leaderboard")}
      onTab={openTab}
      archived={anglerData?.final === true}
      split={
        expanded && anglerSelected
          ? {
              selectedId: anglerSelected.id,
              detail: (
                <AnglerCatchBody
                  key={anglerSelected.id}
                  anglerName={anglerRow.displayName}
                  item={anglerSelected}
                  bestN={bestN}
                  metric={metric}
                  history={anglerData?.history[anglerSelected.id] ?? []}
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
        return leaderboard;
      case "angler":
        return anglerScreen ?? leaderboard;
      case "anglerCatch":
        if (anglerRow && anglerCatch) {
          // Beside the list on a wide window; a page of its own below that.
          if (expanded) return anglerScreen ?? leaderboard;
          return (
            <AnglerCatch
              key={anglerCatch.id}
              anglerName={anglerRow.displayName}
              item={anglerCatch}
              bestN={bestN}
              metric={metric}
              history={anglerData?.history[anglerCatch.id] ?? []}
              final={final}
              onBack={() => setScreen("angler")}
              onTab={openTab}
            />
          );
        }
        return leaderboard;
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
        // Beside the list on a wide window (myCatches); a page of its own below that.
        if (myData && openedCatch && !expanded) {
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
        // The pane beside the list carries the History on a wide window.
        if (myData && openedCatch && !expanded) {
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
            onClubRules={() => openClubRules("profile")}
          />
        );
      case "judge":
        return <JudgeFlow key={judgeVisit} me={user.id} units={units} onTab={openTab} />;
      case "entries":
        if (!ready || !organizer) return home();
        return <Entries eventId={ready.submit.eventId} me={user.id} onBack={() => setScreen(entriesFrom)} />;
      case "tournaments":
        return tournaments();
      case "manage":
        if (!ready || !organizer) return home();
        return (
          <Manage
            key={`${ready.submit.eventId}:${manageSaved ?? ""}`}
            eventId={ready.submit.eventId}
            me={user.id}
            saved={manageSaved}
            onBack={() => setScreen("tournament")}
            onEdit={(data) => {
              setManageData(data);
              setScreen("eventForm");
            }}
            onExtend={(data) => {
              setManageData(data);
              setScreen("extend");
            }}
            onEntries={() => {
              setEntriesFrom("manage");
              setScreen("entries");
            }}
            onExports={() => setScreen("exports")}
            onJudgeQueue={() => openTab("judge")}
            onChanged={() => void reload()}
          />
        );
      case "eventForm": {
        if (!organizer) return home();
        const options = manageData ? { people: manageData.people, species: manageData.species } : newOptions;
        if (!options) return <NoTournament state="loading" onRetry={() => void openNewTournament()} onTab={openTab} onClubRules={() => openClubRules("tournament")} />;
        return (
          <EventForm
            key={manageData?.eventId ?? "new"}
            editing={manageData}
            options={options}
            me={user.id}
            onBack={() => setScreen(manageData ? "manage" : "tournaments")}
            onSaved={(eventId, message) => {
              setManageSaved(message);
              if (eventId !== selectedEventId) {
                setSelectedEventId(eventId);
                setLive({ state: "loading" });
              } else void reload();
              setScreen("manage");
            }}
          />
        );
      }
      case "extend":
        if (!manageData || !organizer) return home();
        return (
          <ExtendDeadline
            data={manageData}
            onBack={() => setScreen("manage")}
            onSaved={(message) => {
              setManageSaved(message);
              void reload();
              setScreen("manage");
            }}
          />
        );
      case "exports":
        if (!ready || !organizer) return home();
        return <Exports eventId={ready.submit.eventId} onBack={() => setScreen("manage")} />;
      case "species":
        if (!organizer) return home();
        return <Species backLabel="Tournaments" onBack={() => setScreen(speciesFrom)} />;
      case "clubRules":
        return (
          <ClubRules
            // The tournament's name rarely fits the back button, so it reads "Back" (decisions.md 2026-10-03).
            back={rulesFrom === "profile" ? { label: "Profile", name: "Back to Profile" } : { label: "Back", name: `Back to ${ready ? view.name : "Tournament"}` }}
            tournament={rulesFrom === "tournament" && ready ? thisTournament(ready) : null}
            tab={rulesFrom === "profile" ? "profile" : "home"}
            onBack={() => setScreen(rulesFrom === "profile" ? "profile" : "tournament")}
            onTab={openTab}
          />
        );
    }
  })();

  return (
    <MemberTabsContext.Provider value={tabs}>
    <AppShell
      tab={tabFor(screen, rulesFrom)}
      name={String(user.name ?? "")}
      role={roleLabel(user.role)}
      onTab={openTab}
      onSubmit={openSubmit}
      onClubRules={() => openClubRules("tournament")}
    >
      {content}
    </AppShell>
    </MemberTabsContext.Provider>
  );
}
