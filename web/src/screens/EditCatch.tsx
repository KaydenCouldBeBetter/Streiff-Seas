// MY-03 Edit pending catch (Figma 48:2062) and its NOT SENT state MY-03c (131:9361): species and
// weight or length, prefilled, while the catch is pending. Save sends only what changed, with the
// loaded rev (lib/changeCatch.ts). A refusal (MY-03b) is shown on My catch, reloaded, so it isn't
// here. Both prefills are exact, so an untouched measurement is never sent.

import { useEffect, useRef, useState } from "react";
import { LengthInput, SpeciesPicker, WeightInput } from "../components/catch";
import { ActionBar, Banner, Button, LockedField, NavBar } from "../components/ui";
import { editFields, type CatchBase, type Change, type ChangeResult } from "../lib/changeCatch";
import type { SpeciesChoice } from "../lib/catchSender";
import { notSentMessage } from "../lib/changeCopy";
import { formatClubTime } from "../lib/format";
import { enteredLengthText, lengthEntryFromQ, parseLength } from "../lib/lengthEntry";
import type { MyCatchesContext } from "../lib/myCatches";
import type { DisplayUnits } from "../lib/profile";
import { enteredWeightText, parseWeight, weightEntryFromHoz } from "../lib/weightEntry";

interface Props {
  context: MyCatchesContext;
  base: CatchBase;
  /** This tournament's species only (R-CAT-U-17). */
  species: readonly SpeciesChoice[];
  /** The member's display format, used when the stored weight is exact in it. */
  units: DisplayUnits;
  /** Sends the change; `retry` reloads first and never sends it twice. */
  send: (change: Change, retry: boolean) => Promise<ChangeResult>;
  /** Saved, already saved or refused: My catch takes it from here. */
  onDone: (result: ChangeResult) => void;
  onCancel: () => void;
}

export function EditCatch({ context, base, species, units, send, onDone, onCancel }: Props) {
  const [speciesId, setSpeciesId] = useState(base.speciesId);
  const [weight, setWeight] = useState(() => weightEntryFromHoz(base.weightHoz, units));
  const [length, setLength] = useState(() => lengthEntryFromQ(base.lengthQ));
  const [phase, setPhase] = useState<"form" | "sending" | "not-sent">("form");
  const [sent, setSent] = useState<Change | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const metric = context.metric;
  const parsed = metric === "weight" ? parseWeight(weight) : parseLength(length);
  const measurement = parsed.ok ? ("hoz" in parsed ? parsed.hoz : parsed.q) : null;
  const fields = measurement === null ? null : editFields(base, metric, speciesId, measurement);
  const speciesName = species.find((option) => option.id === speciesId)?.name ?? "";

  async function go(change: Change, retry: boolean) {
    setSent(change);
    setPhase("sending");
    const result = await send(change, retry);
    if (!live.current) return;
    if (result.kind === "not-sent") setPhase("not-sent");
    else onDone(result);
  }

  if (phase !== "form" && sent) {
    const message = notSentMessage("edit");
    return (
      <div className="screen">
        <NavBar title="Edit catch" backLabel="Catch" backName="Back to Catch" onBack={onCancel} />
        <div className="screen-content submit-content">
          {phase === "not-sent" && (
            <Banner tone="danger" title={message.title}>
              {message.message}
            </Banner>
          )}
          <LockedField label="Species" value={speciesName} />
          <LockedField
            label={metric === "weight" ? "Weight" : "Length"}
            value={metric === "weight" ? enteredWeightText(weight) : enteredLengthText(length)}
            note="Locked until sent. Retry checks the catch first, so it is never changed twice."
          />
        </div>
        <ActionBar>
          <Button variant="primary" large loading={phase === "sending"} loadingLabel="Saving…" onClick={() => void go(sent, true)}>
            Retry
          </Button>
          <Button variant="text" onClick={onCancel}>
            Cancel
          </Button>
        </ActionBar>
      </div>
    );
  }

  const why =
    measurement === null
      ? !parsed.ok && parsed.problem === "missing"
        ? `Enter the ${metric} to save.`
        : null
      : fields === null
        ? `Change the species or ${metric} to save.`
        : null;

  return (
    <div className="screen">
      <NavBar title="Edit catch" backLabel="Catch" backName="Back to Catch" onBack={onCancel} />
      <div className="screen-content submit-content">
        <p className="t-callout t-secondary">
          You can change the species and {metric} until the judge decides or {formatClubTime(context.submitDeadline)}. Every change is recorded in the
          catch history.
        </p>
        <SpeciesPicker species={species} selectedId={speciesId} onSelect={(choice) => setSpeciesId(choice.id)} />
        {metric === "weight" ? (
          <WeightInput id="edit-weight" value={weight} onChange={setWeight} />
        ) : (
          <LengthInput id="edit-length" value={length} onChange={setLength} />
        )}
      </div>
      <ActionBar>
        {why && <p className="t-footnote t-secondary">{why}</p>}
        <Button variant="primary" large disabled={fields === null} onClick={() => fields && void go({ action: "edit", fields }, false)}>
          Save changes
        </Button>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </ActionBar>
    </div>
  );
}
