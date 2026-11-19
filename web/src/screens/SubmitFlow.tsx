// SUB-01 Submit → SUB-02 Submission status (screens.md §3): the form, then the draft's journey
// through the CatchSender. The draft is fixed at Send and reused, with its `client_uuid`, for
// every retry (R-CAT-C-10).
//
// SUB-01e (submitting not available) never reaches this flow: MemberApp's openSubmit shows it as a
// pop-up (screens/SubmitClosed.tsx, lib/liveTournament.ts submitClosed) and stays where it was.

import { useEffect, useRef, useState } from "react";
import type { CatchDraft, CatchSender, ReceivedCatch, SendProgress, SendResult } from "../lib/catchSender";
import type { SubmitTournament } from "../lib/sampleSubmit";
import { SubmitCatch } from "./SubmitCatch";
import { NotAccepted, NotSent, Received, Sending } from "./SubmissionStatus";

type Phase =
  | { kind: "form" }
  | { kind: "sending"; draft: CatchDraft; progress: SendProgress }
  | { kind: "not-sent"; draft: CatchDraft }
  | { kind: "received"; draft: CatchDraft; stored: ReceivedCatch; alreadyReceived: boolean }
  | { kind: "not-accepted"; draft: CatchDraft };

const TITLES: Record<Phase["kind"], string> = {
  form: "Submit a catch",
  sending: "Sending",
  "not-sent": "Not sent",
  received: "Received",
  "not-accepted": "Not accepted",
};

interface Props {
  tournament: SubmitTournament;
  sender: CatchSender;
  onBack: () => void;
  /** SUB-02b and SUB-02d's View this catch: the received catch's page (MY-02). */
  onViewCatch: (catchId: string) => void;
}

export function SubmitFlow({ tournament, sender, onBack, onViewCatch }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [formKey, setFormKey] = useState(0);
  const previews = useRef<string[]>([]);
  const live = useRef(true);

  function revokePreviews() {
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current = [];
  }

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      revokePreviews();
    };
  }, []);

  useEffect(() => {
    document.title = `${TITLES[phase.kind]} · Streiff Seas`;
  }, [phase.kind]);

  // Leaving while the catch hasn't landed warns (decisions.md 2026-10-02).
  const unsent = phase.kind === "sending" || phase.kind === "not-sent";
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  async function send(draft: CatchDraft) {
    setPhase({ kind: "sending", draft, progress: { photo: 1, photoCount: draft.photos.length, fraction: 0 } });
    let result: SendResult;
    try {
      result = await sender(draft, (progress) => {
        if (live.current) setPhase({ kind: "sending", draft, progress });
      });
    } catch {
      result = { kind: "not-sent" };
    }
    if (!live.current) return;
    switch (result.kind) {
      case "received":
      case "already-received":
        setPhase({ kind: "received", draft, stored: result.catch, alreadyReceived: result.kind === "already-received" });
        break;
      case "not-sent":
        setPhase({ kind: "not-sent", draft });
        break;
      case "not-accepted":
        setPhase({ kind: "not-accepted", draft });
        break;
    }
  }

  function backFromUnsent() {
    if (window.confirm("Leave without sending? Your catch hasn't reached the club yet.")) onBack();
  }

  switch (phase.kind) {
    case "form":
      return (
        <SubmitCatch
          key={formKey}
          tournament={tournament}
          makePreview={(file) => {
            const url = URL.createObjectURL(file);
            previews.current.push(url);
            return url;
          }}
          onSend={(draft) => void send({ ...draft, clientUuid: crypto.randomUUID() })}
          onBack={onBack}
        />
      );
    case "sending":
      return <Sending draft={phase.draft} metric={tournament.metric} progress={phase.progress} onBack={backFromUnsent} />;
    case "not-sent":
      return (
        <NotSent
          draft={phase.draft}
          metric={tournament.metric}
          onRetry={() => void send(phase.draft)}
          onLeave={onBack}
          onBack={backFromUnsent}
        />
      );
    case "received":
      return (
        <Received
          stored={phase.stored}
          thumbnailUrl={phase.draft.photos[0]?.previewUrl ?? null}
          alreadyReceived={phase.alreadyReceived}
          onSubmitAnother={() => {
            revokePreviews();
            setFormKey((key) => key + 1);
            setPhase({ kind: "form" });
          }}
          onView={(catchId) => {
            revokePreviews();
            onViewCatch(catchId);
          }}
          onBack={onBack}
        />
      );
    case "not-accepted":
      return <NotAccepted onBack={onBack} />;
  }
}
