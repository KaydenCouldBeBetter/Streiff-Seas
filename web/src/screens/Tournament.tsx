// EVT-02d Tournament: live, fishing window open, the viewer's entry active (Figma 66:5726).
// A UI skeleton on sample data: controls whose screens aren't built yet carry a TodoTag
// with the screens.md row they open.

import type { TournamentView } from "../lib/sampleTournament";
import { formatClubTime, placeLabel } from "../lib/format";
import { AccessoryBar, Button, LargeNavBar, ListLink, TabBar, type Tab } from "../components/ui";

export type MemberTab = "home" | "leaderboard" | "catches" | "profile";

// Member tabs (Figma Tab bar): Home · Leaderboard · My catches · Profile. The Judge tab
// (JDG-00a) joins them only for a judge or backup judge of a live or closed tournament.
export const MEMBER_TABS: readonly Tab<MemberTab>[] = [
  { id: "home", label: "Home", icon: "/icons/home-selected.svg" },
  { id: "leaderboard", label: "Leaderboard", icon: "/icons/leaderboard.svg", todo: "LB-01" },
  { id: "catches", label: "My catches", icon: "/icons/list-tab.svg", todo: "MY-01" },
  { id: "profile", label: "Profile", icon: "/icons/person-tab.svg", todo: "PRF-01" },
];

interface Props {
  tournament: TournamentView;
  onTab: (tab: MemberTab) => void;
}

export function Tournament({ tournament, onTab }: Props) {
  const { standing, catches } = tournament;
  const place = placeLabel(standing.place, standing.tied);
  return (
    <div className="screen tab-screen">
      <LargeNavBar title={tournament.name} status={tournament.status} subtitle={tournament.rulesLine} />
      <div className="screen-content">
        <section className="card card-selected" aria-labelledby="standing-heading">
          <h2 id="standing-heading" className="t-footnote-strong t-secondary">
            Your standing
          </h2>
          <div className="standing-numbers">
            <p className="t-number-large">{place}</p>
            <p className="standing-total">
              <span className="t-number-large">{standing.total}</span>
              <span className="t-callout-strong t-secondary">{standing.unit}</span>
            </p>
          </div>
          <p className="t-callout">
            {standing.counted} of {standing.bestN} counted · {catches.pending} pending · {catches.rejected} rejected
          </p>
        </section>

        <dl className="card card-sunken t-callout">
          <div className="fact">
            <dt className="t-secondary">Window closes</dt>
            <dd className="t-callout-strong">{formatClubTime(tournament.endsAt)}</dd>
          </div>
          <div className="fact">
            <dt className="t-secondary">Submit by</dt>
            <dd className="t-callout-strong">{formatClubTime(tournament.submitDeadline)}</dd>
          </div>
        </dl>

        <div className="list-links">
          <ListLink
            icon="/icons/list.svg"
            title="My catches"
            detail={`${catches.submitted} submitted · ${catches.pending} pending`}
            todo="MY-01"
          />
          {/* screens.md §0 status words: "You're 4th", not the Figma frame's "Live · you're 4th". */}
          <ListLink icon="/icons/leaderboard.svg" title="Leaderboard" detail={`You're ${place}`} todo="LB-01" />
        </div>

        <div>
          <Button variant="secondary" todo="EVT-03">
            Withdraw from tournament…
          </Button>
        </div>

        <Button variant="text" todo="RULES-01a">
          Club rules
        </Button>
      </div>

      <div className="tab-screen-bottom">
        <AccessoryBar>
          <Button variant="primary" full icon="/icons/plus-on-primary.svg" todo="SUB-01">
            Submit a catch
          </Button>
        </AccessoryBar>
        <TabBar tabs={MEMBER_TABS} selected="home" onSelect={onTab} />
      </div>
    </div>
  );
}
