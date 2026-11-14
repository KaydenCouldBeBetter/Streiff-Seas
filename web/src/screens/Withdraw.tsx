// EVT-03a / EVT-03b Withdraw (self): what withdrawing does, then Confirm or Cancel (screens.md
// §2; scoring.md §3). An angler gives no reason: the entries update rule refuses one from them
// (R-ENT-U-01). EVT-03b is the same screen once rejoining has closed (after submit_deadline).

import { ActionBar, Banner, Button, NavBar } from "../components/ui";
import { formatClubTime } from "../lib/format";

interface Props {
  tournamentName: string;
  /** null once rejoining has closed (EVT-03b). */
  rejoinUntil: Date | null;
  sending: boolean;
  failed: "not-sent" | "not-accepted" | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const FAILED = {
  "not-sent": "Couldn't reach the club. You're still in the tournament. Check your signal and try again.",
  "not-accepted": "The club didn't accept this. Go back to the tournament to see why.",
} as const;

export function Withdraw({ tournamentName, rejoinUntil, sending, failed, onConfirm, onCancel }: Props) {
  return (
    <div className="screen">
      <NavBar title="Withdraw" backLabel="Tournament" backName="Back to Tournament" onBack={onCancel} />
      <div className="screen-content">
        {failed && (
          <Banner tone="danger" title="Not withdrawn">
            {FAILED[failed]}
          </Banner>
        )}
        <h2 className="t-title-section">Withdraw from {tournamentName}?</h2>
        <ul className="t-callout withdraw-facts">
          <li>You come off the leaderboard, and nothing you have scores while you're withdrawn.</li>
          <li>Your entry and your catches are kept.</li>
          <li>Catches waiting for the judge are still judged, but you can't edit them.</li>
          <li>
            {rejoinUntil
              ? `You can rejoin until ${formatClubTime(rejoinUntil)}, and your verified fish count again.`
              : "You won't be able to rejoin: the deadline has passed."}
          </li>
        </ul>
      </div>
      <ActionBar>
        <Button variant="primary" large loading={sending} loadingLabel="Withdrawing…" onClick={onConfirm}>
          Withdraw
        </Button>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </ActionBar>
    </div>
  );
}
