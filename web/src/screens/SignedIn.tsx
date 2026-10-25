// Where sign-in lands until LB-01 and EVT-01 are built: who is signed in, and Sign out.

import type { RecordModel } from "pocketbase";
import { ActionBar, Brand, Button } from "../components/ui";

interface Props {
  user: RecordModel;
  onSignOut: () => void;
}

export function SignedIn({ user, onSignOut }: Props) {
  return (
    <div className="screen">
      <div className="screen-content">
        <Brand />
        <h1 className="t-title-section">You're signed in</h1>
        <p className="t-body">
          {String(user.name)} · <span className="t-secondary">{String(user.email)}</span>
        </p>
        <p className="t-callout t-secondary">The leaderboard and tournaments come next.</p>
      </div>
      <ActionBar>
        <Button variant="secondary" large onClick={onSignOut}>
          Sign out
        </Button>
      </ActionBar>
    </div>
  );
}
