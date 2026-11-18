// EVT-01 Tournaments, the Home tab (Figma 90:4446 EVT-01b; Desktop note 219:1027): Live now, then
// Drafts and the organizer's links (organizers only, R-EVT-L-03), then Past. A card opens that
// tournament's page (EVT-02). Read by lib/tournaments.ts when Home opens and on focus (Gap 25).
// No tab is added for organizer tasks (Figma note).

import { useCallback, useEffect, useState } from "react";
import { GroupHeading, TournamentCard } from "../components/organizer";
import { Banner, Button, EmptyState, LargeNavBar, ListLink } from "../components/ui";
import { pb } from "../lib/pb";
import type { DisplayUnits } from "../lib/profile";
import { loadTournaments, type TournamentsData } from "../lib/tournaments";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

interface Props {
  me: string;
  units: DisplayUnits;
  organizer: boolean;
  onOpen: (eventId: string) => void;
  onNewTournament: () => void;
  onSpecies: () => void;
  onClubRules: () => void;
  onTab: (tab: MemberTab) => void;
}

export function Tournaments({ me, units, organizer, onOpen, onNewTournament, onSpecies, onClubRules, onTab }: Props) {
  const [data, setData] = useState<TournamentsData | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    try {
      setData(await loadTournaments(pb, me, units));
      setFailed(false);
    } catch {
      // A failed refresh keeps the list already shown.
      setFailed(true);
    }
  }, [me, units]);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  useEffect(() => {
    document.title = "Tournaments · Streiff Seas";
  }, []);

  const empty = data && data.live.length === 0 && data.past.length === 0 && (!organizer || data.drafts.length === 0);

  return (
    <div className="screen tab-screen screen-wide">
      <LargeNavBar title="Tournaments" subtitle="Streiff Seas club" />
      <div className="screen-content tournament-list">
        {failed && !data && (
          <EmptyState
            icon="/icons/list-large.svg"
            title="Couldn't load the tournaments"
            message="Check your signal and try again."
            action={
              <Button variant="secondary" onClick={() => void read()}>
                Try again
              </Button>
            }
          />
        )}
        {!data && !failed && <p className="t-body t-secondary">Loading…</p>}
        {failed && data && (
          <Banner tone="warning" title="Not up to date">
            Couldn't refresh the list. It shows what was there before.
          </Banner>
        )}
        {empty && <EmptyState icon="/icons/list-large.svg" title="No tournaments yet" message="When the organizer opens a tournament, it shows here and you can join it." />}
        {data && data.live.length > 0 && (
          <>
            <GroupHeading>Live now</GroupHeading>
            {data.live.map((card) => (
              <TournamentCard key={card.id} card={card} onOpen={() => onOpen(card.id)} />
            ))}
          </>
        )}
        {data && organizer && data.drafts.length > 0 && (
          <>
            <GroupHeading>Drafts</GroupHeading>
            {data.drafts.map((card) => (
              <TournamentCard key={card.id} card={card} onOpen={() => onOpen(card.id)} />
            ))}
          </>
        )}
        {data && organizer && (
          <>
            <GroupHeading>Organizer</GroupHeading>
            <div className="list-links">
              <ListLink icon="/icons/plus.svg" title="New tournament" detail="Starts as a draft only you can see" onClick={onNewTournament} />
              <ListLink
                icon="/icons/list.svg"
                title="Species"
                detail={`${data.speciesCount} ${data.speciesCount === 1 ? "species" : "species"} · add one for a new tournament`}
                onClick={onSpecies}
              />
            </div>
          </>
        )}
        {data && data.past.length > 0 && (
          <>
            <GroupHeading>Past</GroupHeading>
            {data.past.map((card) => (
              <TournamentCard key={card.id} card={card} onOpen={() => onOpen(card.id)} />
            ))}
          </>
        )}
        <div>
          <Button variant="text" onClick={onClubRules}>
            Club rules
          </Button>
        </div>
      </div>
      <div className="tab-screen-bottom">
        <MemberTabBar selected="home" onSelect={onTab} />
      </div>
    </div>
  );
}
