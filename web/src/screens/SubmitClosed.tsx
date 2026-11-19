// SUB-01e Submit: not available (screens.md), as a pop-up over the screen the member tapped Submit
// on: a dialog from 1024 px, a bottom sheet on a phone (as Entries does). It says why submitting
// is closed (lib/liveTournament.ts submitClosed) and offers the one way on. Found in Kayden's
// testing, 2026-11-18: the sidebar's Submit did nothing visible with no tournament open.

import { Button, Overlay, Sheet } from "../components/ui";
import type { SubmitClosed as Closed } from "../lib/liveTournament";
import { useBreakpoint } from "../lib/useBreakpoint";

interface Props {
  closed: Closed;
  /** The tournament's name, for "Go to Fall Bass 2026". */
  tournamentName: string | null;
  onClose: () => void;
  onNext: (next: "tournament" | "tournaments") => void;
}

export function SubmitClosed({ closed, tournamentName, onClose, onNext }: Props) {
  const wide = useBreakpoint() === "expanded";
  const next = closed.next;
  const label = next === "tournament" ? `Go to ${tournamentName ?? "the tournament"}` : "Go to Tournaments";
  const body = (
    <p className="t-body" role="alert">
      {closed.message}
    </p>
  );
  const go = next && (
    <Button variant="primary" large={!wide} onClick={() => onNext(next)}>
      {label}
    </Button>
  );
  if (wide) {
    return (
      <Overlay
        kind="dialog"
        title={closed.title}
        onClose={onClose}
        footer={
          <>
            <Button variant={go ? "secondary" : "primary"} onClick={onClose}>
              OK
            </Button>
            {go}
          </>
        }
      >
        {body}
      </Overlay>
    );
  }
  return (
    <Sheet title={closed.title} onCancel={onClose} footer={go ?? (
      <Button variant="primary" large onClick={onClose}>
        OK
      </Button>
    )}>
      {body}
    </Sheet>
  );
}
