// SYS-04a Session ended (Figma 104:8358): the held session has expired or the server refused it
// (lib/auth.ts checkSession). Sign in goes to AUTH-01 with the member's email filled in.
//
// Figma draws this state inside the screen the member was on (there, the Leaderboard). When the
// app opens there is no such screen yet, so it sits under the brand, as the sign-in screens do;
// the h1 is visually hidden so the page still has one.

import { Brand, Button, EmptyState } from "../components/ui";

interface Props {
  onSignIn: () => void;
}

export function SessionEnded({ onSignIn }: Props) {
  return (
    <div className="screen">
      <div className="screen-content">
        <Brand />
        <h1 className="visually-hidden">Session ended</h1>
        <EmptyState
          icon="/icons/list-large.svg"
          title="Please sign in again"
          message="Your session ended. Your catches are safe, and a photo you haven't sent is still in your camera roll."
          action={
            <Button variant="primary" onClick={onSignIn}>
              Sign in
            </Button>
          }
        />
      </div>
    </div>
  );
}
