// EVT-02d Tournament: live, fishing window open, the viewer's entry active (Figma 66:5726).
// A UI skeleton on sample data: controls whose screens aren't built yet carry a TodoTag
// with the screens.md row they open. Submit a catch opens SUB-01 (SubmitFlow).

import type { TournamentView } from "../lib/sampleTournament";
import { formatClubTime, placeLabel } from "../lib/format";
import { AccessoryBar, Button, EventStatus, LargeNavBar, ListLink, TabBar } from "../components/ui";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  tournament: TournamentView;
  onTab: (tab: MemberTab) => void;
  onLeaderboard: () => void;
  onSubmit: () => void;
}

export function Tournament({ tournament, onTab, onLeaderboard, onSubmit }: Props) {
  const { standing, catches } = tournament;
  const place = placeLabel(standing.place, standing.tied);
  return (
    <div className="screen tab-screen">
      <LargeNavBar title={tournament.name} badge={<EventStatus status={tournament.status} />} subtitle={tournament.rulesLine} />
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
          <ListLink icon="/icons/leaderboard.svg" title="Leaderboard" detail={`You're ${place}`} onClick={onLeaderboard} />
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
          <Button variant="primary" full icon="/icons/plus-on-primary.svg" onClick={onSubmit}>
            Submit a catch
          </Button>
        </AccessoryBar>
        <TabBar tabs={MEMBER_TABS} selected="home" onSelect={onTab} />
      </div>
    </div>
  );
}
