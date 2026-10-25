// Placeholder for PRF-01 Profile until it's built: who is signed in, and Sign out, which
// lives on Profile (decisions.md 2026-10-03 "Home screen and landing").

import type { RecordModel } from "pocketbase";
import { ActionBar, Button, NavBar, TodoTag } from "../components/ui";

interface Props {
  user: RecordModel;
  onBack: () => void;
  onSignOut: () => void;
}

export function Profile({ user, onBack, onSignOut }: Props) {
  return (
    <div className="screen">
      <NavBar title="Profile" backLabel="Back" backName="Back to Tournament" onBack={onBack} />
      <div className="screen-content">
        <p className="t-body">
          {String(user.name)} · <span className="t-secondary">{String(user.email)}</span>
        </p>
        <p className="t-callout t-secondary todo-host">
          Name, display units and the rest of Profile come next.
          <TodoTag row="PRF-01" />
        </p>
      </div>
      <ActionBar>
        <Button variant="secondary" large onClick={onSignOut}>
          Sign out
        </Button>
      </ActionBar>
    </div>
  );
}
