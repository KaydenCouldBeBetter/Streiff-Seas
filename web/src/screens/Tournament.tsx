// EVT-02 Tournament (Figma 66:5726 is EVT-02d: live, fishing window open, the viewer's entry
// active). The name, rules line and dates are the live event's; the standing and the counts come
// from the leaderboard's read (lib/leaderboard.ts), refreshed on open and on focus (Gap 25). Club
// rules opens RULES-01a with this tournament's section.
// The bottom action depends on the viewer's entry (`action`):
// Submit a catch (EVT-02d → SUB-01), Join (EVT-02a), or why neither is open (EVT-02h, 02j).

import type { TournamentView } from "../lib/sampleTournament";
import { formatClubTime, placeLabel } from "../lib/format";
import { AccessoryBar, Banner, Button, EmptyState, EventStatus, LargeNavBar, ListLink } from "../components/ui";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

export type TournamentAction =
  /** EVT-02d: an active entry inside the window. */
  | { kind: "submit"; onSubmit: () => void }
  /** EVT-02a: no entry while joining is open. `failed` names what went wrong with the last tap. */
  | { kind: "join"; joining: boolean; failed: "not-sent" | "not-accepted" | null; onJoin: () => void }
  /** EVT-02h: the viewer withdrew themself and may rejoin until submit_deadline. */
  | { kind: "rejoin"; rejoining: boolean; failed: "not-sent" | "not-accepted" | null; onRejoin: () => void }
  /** Neither: a short reason, e.g. "You withdrew from this tournament." */
  | { kind: "closed"; title: string; message: string };

interface Props {
  tournament: TournamentView;
  /** ORG-01 Manage: organizers only (EVT-02m). */
  onManage?: () => void;
  /** Back to the Tournaments list (EVT-01), where every tournament is opened from. */
  onBackToList?: () => void;
  /** screens.md §1 "Entry state": the standing and Withdraw show only for an active entry (EVT-02a has neither). */
  entry: "none" | "active" | "withdrawn";
  action: TournamentAction;
  onTab: (tab: MemberTab) => void;
  onMyCatches: () => void;
  onLeaderboard: () => void;
  /** EVT-03: shown only for an active entry. */
  onWithdraw: () => void;
  /** RULES-01a, with this tournament's section. */
  onClubRules: () => void;
  /** ORG-08 Entries: organizers only (EVT-02m). */
  onEntries?: () => void;
}

/** Withdraw is offered while live or closed, never on a draft or once final (R-ENT-U-02, U-10). */
function onWithdrawShown(status: TournamentView["status"]): boolean {
  return status === "live" || status === "closed";
}

const JOIN_FAILED = {
  "not-sent": "Couldn't reach the club. Check your signal and try again.",
  "not-accepted": "Joining isn't open for this tournament any more.",
} as const;

export function Tournament({ tournament, entry, action, onTab, onMyCatches, onLeaderboard, onWithdraw, onClubRules, onEntries, onManage, onBackToList }: Props) {
  const { standing, catches } = tournament;
  // On a draft only the facts, Manage and Entries show (Figma EVT-02m note): nobody can join yet.
  const draft = tournament.status === "draft";
  const place = standing && standing !== "unavailable" ? placeLabel(standing.place, standing.tied) : null;
  const counts = catches ? `${catches.pending} pending · ${catches.rejected} rejected` : "";
  return (
    <div className="screen tab-screen screen-wide">
      <LargeNavBar
        title={tournament.name}
        badge={<EventStatus status={tournament.status} />}
        subtitle={tournament.rulesLine}
        back={onBackToList && { label: "Tournaments", onBack: onBackToList }}
      />
      <div className="screen-content tournament-grid">
        {action.kind === "closed" && (
          <Banner tone="neutral" title={action.title}>
            {action.message}
          </Banner>
        )}
        {action.kind === "join" && action.failed && (
          <Banner tone="danger" title="Not joined">
            {JOIN_FAILED[action.failed]}
          </Banner>
        )}
        {action.kind === "rejoin" && (
          <Banner tone={action.failed ? "danger" : "neutral"} title={action.failed ? "Not rejoined" : "You withdrew"}>
            {action.failed
              ? JOIN_FAILED[action.failed]
              : "You're not on the leaderboard. Your catches are kept, and pending ones are still judged. Rejoin and your verified fish count again."}
          </Banner>
        )}
        {entry === "active" && !draft && (
          <section className="card card-selected tournament-standing" aria-labelledby="standing-heading">
            <h2 id="standing-heading" className="t-footnote-strong t-secondary">
              Your standing
            </h2>
            {standing && standing !== "unavailable" ? (
              <>
                <div className="standing-numbers">
                  <p className="t-number-large">{place}</p>
                  <p className="standing-total">
                    <span className="t-number-large">{standing.total}</span>
                    <span className="t-callout-strong t-secondary">{standing.unit}</span>
                  </p>
                </div>
                <p className="t-callout">
                  {standing.counted} of {standing.bestN} counted{counts && ` · ${counts}`}
                </p>
              </>
            ) : (
              <p className="t-callout">
                {standing === undefined
                  ? "Loading your place…"
                  : standing === "unavailable"
                    ? "Couldn't load your place. Open the leaderboard, or come back to try again."
                    : `Not on the leaderboard yet: you show up once you have a pending or verified catch.${catches && catches.rejected > 0 ? ` ${catches.rejected} rejected.` : ""}`}
              </p>
            )}
            {/* On a wide window the standing card carries its own way to the board (Figma 220:951). */}
            <div className="tournament-standing-action wide-only">
              <Button variant="secondary" icon="/icons/leaderboard.svg" onClick={onLeaderboard}>
                Open leaderboard
              </Button>
            </div>
          </section>
        )}

        <div className="tournament-facts">
          <h2 className="t-title-section wide-only">
            Dates and rules
          </h2>
          <dl className="card card-sunken t-callout">
            <div className="fact wide-only">
              <dt className="t-secondary">Window opens</dt>
              <dd className="t-callout-strong">{formatClubTime(tournament.startsAt)}</dd>
            </div>
            <div className="fact">
              <dt className="t-secondary">Window closes</dt>
              <dd className="t-callout-strong">{formatClubTime(tournament.endsAt)}</dd>
            </div>
            <div className="fact">
              <dt className="t-secondary">Submit by</dt>
              <dd className="t-callout-strong">{formatClubTime(tournament.submitDeadline)}</dd>
            </div>
            <div className="fact wide-only">
              <dt className="t-secondary">Scoring</dt>
              <dd className="t-callout-strong">{tournament.rules.scoring}</dd>
            </div>
            <div className="fact wide-only">
              <dt className="t-secondary">Species</dt>
              <dd className="t-callout-strong">{tournament.rules.species}</dd>
            </div>
            <div className="fact wide-only">
              <dt className="t-secondary">Code word</dt>
              <dd className="t-callout-strong">{tournament.rules.codeWord}</dd>
            </div>
          </dl>
          <p className="t-footnote t-secondary wide-only">All times Eastern.</p>
          <div className="wide-only">
            <Button variant="text" onClick={onClubRules}>
              Club rules for this tournament
            </Button>
          </div>
        </div>

        <div className="list-links tournament-links">
          {entry !== "none" && !draft && (
            <ListLink
              icon="/icons/list.svg"
              title="My catches"
              detail={catches ? `${catches.submitted} submitted · ${catches.pending} pending` : "Your catches in this tournament"}
              onClick={onMyCatches}
            />
          )}
          {/* screens.md §0 status words: "You're 4th", not the Figma frame's "Live · you're 4th". */}
          {!draft && <ListLink icon="/icons/leaderboard.svg" title="Leaderboard" detail={entry === "active" && place ? `You're ${place}` : "See the standings"} onClick={onLeaderboard} />}
        </div>

        {(onManage || onEntries) && (
          <section className="org-section" aria-labelledby="organizer-heading">
            <h2 id="organizer-heading" className="t-caption-caps t-secondary group-heading">
              Organizer
            </h2>
            <div className="list-links">
              {onManage && <ListLink icon="/icons/edit-link.svg" title="Manage" detail="Edit, open, extend, close, finalize, exports" onClick={onManage} />}
              {onEntries && <ListLink icon="/icons/person-tab.svg" title="Entries" detail="Every angler, withdrawn ones included" onClick={onEntries} />}
            </div>
          </section>
        )}

        {entry === "active" && onWithdrawShown(tournament.status) && (
          <div className="tournament-withdraw">
            <Button variant="secondary" onClick={onWithdraw}>
              Withdraw from tournament…
            </Button>
          </div>
        )}

        <div className="tournament-rules hide-wide">
          <Button variant="text" onClick={onClubRules}>
            Club rules
          </Button>
        </div>
      </div>

      <div className="tab-screen-bottom">
        {action.kind === "submit" && (
          <AccessoryBar>
            <Button variant="primary" full icon="/icons/plus-on-primary.svg" onClick={action.onSubmit}>
              Submit a catch
            </Button>
          </AccessoryBar>
        )}
        {action.kind === "rejoin" && (
          <AccessoryBar>
            <Button variant="primary" full loading={action.rejoining} loadingLabel="Rejoining…" onClick={action.onRejoin}>
              Rejoin tournament
            </Button>
          </AccessoryBar>
        )}
        {action.kind === "join" && (
          <AccessoryBar>
            <Button variant="primary" full loading={action.joining} loadingLabel="Joining…" onClick={action.onJoin}>
              Join tournament
            </Button>
          </AccessoryBar>
        )}
        <MemberTabBar selected="home" onSelect={onTab} />
      </div>
    </div>
  );
}

interface NoTournamentProps {
  /** "loading" while the first read is in flight; "none" when no event is live; "error" when it failed. */
  state: "loading" | "none" | "error";
  onRetry: () => void;
  onTab: (tab: MemberTab) => void;
  /** RULES-01a, club-wide only: there is no tournament to add (Gap 37). */
  onClubRules: () => void;
}

/** Home when there is no live tournament to show (until the Tournaments list, EVT-01a, exists). */
export function NoTournament({ state, onRetry, onTab, onClubRules }: NoTournamentProps) {
  const copy = {
    loading: { title: "Loading…", message: "Getting the live tournament." },
    none: { title: "No live tournament", message: "When the organizer opens a tournament, it shows here and you can join it." },
    error: { title: "Couldn't load the tournament", message: "Check your signal and try again." },
  }[state];
  return (
    <div className="screen tab-screen">
      <LargeNavBar title="Tournament" />
      <div className="screen-content">
        <EmptyState
          icon="/icons/list-large.svg"
          title={copy.title}
          message={copy.message}
          action={
            state === "error" ? (
              <Button variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
        />
        <Button variant="text" onClick={onClubRules}>
          Club rules
        </Button>
      </div>
      <div className="tab-screen-bottom">
        <MemberTabBar selected="home" onSelect={onTab} />
      </div>
    </div>
  );
}
