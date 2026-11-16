// MY-05 Retract: the confirm sheet over My catch (Figma 49:2164, "Sheet / Retract this catch?")
// and its NOT SENT state MY-05c (132:9405). Retract goes alone, with the loaded rev
// (lib/changeCatch.ts). A refusal (MY-05b) is shown on My catch, reloaded.

import { useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, Sheet } from "../components/ui";
import type { Change, ChangeResult } from "../lib/changeCatch";
import { notSentMessage } from "../lib/changeCopy";
import type { MyCatchView } from "../lib/myCatches";

interface Props {
  item: MyCatchView;
  send: (change: Change, retry: boolean) => Promise<ChangeResult>;
  /** Saved, already saved or refused: My catch takes it from here. */
  onDone: (result: ChangeResult) => void;
  onCancel: () => void;
}

const RETRACT: Change = { action: "retract" };

/** What retracting means (screens.md MY-05a; scoring.md §6, example 20). */
const POINTS: readonly [string, string][] = [
  ["/icons/leaderboard-secondary-22.svg", "It will never score."],
  ["/icons/info-secondary-22.svg", "Other members won't see it."],
  ["/icons/archive-secondary-22.svg", "It stays on record in your history."],
  ["/icons/plus-secondary-22.svg", "To replace it, submit a new catch."],
];

export function RetractSheet({ item, send, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<"confirm" | "sending" | "not-sent">("confirm");
  // Set once a send got no reply: from then on the sheet is MY-05c, and each send is a Retry.
  const [unanswered, setUnanswered] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  async function go() {
    setPhase("sending");
    const result = await send(RETRACT, unanswered);
    if (!live.current) return;
    if (result.kind !== "not-sent") return onDone(result);
    setUnanswered(true);
    setPhase("not-sent");
  }

  const sending = phase === "sending";
  const cancel = sending ? undefined : onCancel;

  if (unanswered) {
    const message = notSentMessage("retract");
    return (
      <Sheet
        title="Retract not sent"
        onCancel={cancel}
        footer={
          <Button variant="primary" large loading={sending} loadingLabel="Retracting…" onClick={() => void go()}>
            Retry
          </Button>
        }
      >
        {phase === "not-sent" && (
          <Banner tone="danger" title={message.title}>
            {message.message}
          </Banner>
        )}
        <p className="t-headline">
          Retracting {item.measurement.value} {item.measurement.unit} · {item.species}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Retract this catch?"
      onCancel={cancel}
      footer={
        <Button variant="destructive" large loading={sending} loadingLabel="Retracting…" onClick={() => void go()}>
          Retract catch
        </Button>
      }
    >
      <p className="t-headline sheet-warning">This can't be undone.</p>
      <ul className="sheet-points">
        {POINTS.map(([icon, text]) => (
          <li key={text}>
            <Icon src={icon} size={22} />
            <span className="t-body">{text}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
