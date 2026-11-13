// The bare live page (features.json M0-03 step 5), opened at /#live once signed in: each live
// tournament's pending and verified catches, kept current by useLive, with the realtime badge.
// No design yet; the leaderboard (LB-01, S2b) replaces it. It is the page for the phone checks
// through the tunnel (M0-07 soak).
//
// The badge (Live, Reconnecting, Updated h:mm) says how current the list is; the event's own
// status (Draft, Live, Closed, Final) is a separate line (decisions.md 2026-10-05).

import { useEffect } from "react";
import { fetchLiveBoard, statusWord } from "../lib/liveBoard";
import { badgeText } from "../lib/liveTracker";
import { pb } from "../lib/pb";
import { useLive } from "../lib/useLive";

const loadBoard = () => fetchLiveBoard(pb);

export function LiveCheck({ onSignOut }: { onSignOut: () => void }) {
  const { data, badge } = useLive(loadBoard);

  useEffect(() => {
    document.title = "Live check · Chromie Fishing";
  }, []);

  return (
    <div className="live-check">
      <header className="live-check-header">
        <h1 className="t-title-large">Live check</h1>
        <p className="live-check-badge t-callout-strong" data-badge={badge.kind} role="status">
          <span className="visually-hidden">Updates: </span>
          {badgeText(badge)}
        </p>
      </header>

      {data === undefined ? (
        <p className="t-body">Loading…</p>
      ) : data.events.length === 0 ? (
        <p className="t-body">No tournament is live right now.</p>
      ) : (
        data.events.map((event) => (
          <section key={event.id} className="live-check-event" aria-labelledby={`live-${event.id}`}>
            <h2 id={`live-${event.id}`} className="t-title-section">
              {event.name}
            </h2>
            <p className="t-footnote live-check-muted">Status: {statusWord(event.status)}</p>
            {event.rows.length === 0 ? (
              <p className="t-body">No pending or verified catches yet.</p>
            ) : (
              <ul className="live-check-list">
                {event.rows.map((row) => (
                  <li key={row.id}>
                    <span className="t-headline">{row.angler}</span>
                    <span className="t-callout">
                      {row.measurement} · {row.species} · {row.status}
                    </span>
                    <span className="t-footnote live-check-muted">Submitted {row.submitted}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      <button type="button" className="button button-text live-check-signout" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
