// SUB-01a Submit a catch (weight), with SUB-01d (incomplete) as its disabled-Send state
// (Figma 66:5838 and 45:1184). A UI skeleton on sample data: the draft goes to SubmitFlow,
// which hands it to a CatchSender.
//
// Not built yet:
// - SUB-01b (length): a length event shows a placeholder where the weight input goes.
// - SUB-01c (after the window): a Deadline banner, "Window closed at <ends_at>; a fish caught
//   after it is flagged and doesn't count", with the extension note when extended (Gap 28).
//   It needs "now" from serverClock and the event's live phase (M0-03).

import { useState, type FormEvent } from "react";
import { ActionBar, Button, Icon, NavBar, TodoTag } from "../components/ui";
import { PhotoSlot, SpeciesPicker, WeightInput, usePhotoPicker } from "../components/catch";
import { useBreakpoint } from "../lib/useBreakpoint";
import { MAX_PHOTOS, missingInputs, photoSlotLabel, photoSlotName, stillNeededLine } from "../lib/catchForm";
import type { CatchDraft, PickedPhoto, SpeciesChoice } from "../lib/catchSender";
import { formatClubTime } from "../lib/format";
import type { SubmitTournament } from "../lib/sampleSubmit";
import { EMPTY_WEIGHT, enteredWeightText, parseWeight, type WeightResult } from "../lib/weightEntry";

interface Props {
  tournament: SubmitTournament;
  /** Makes an object URL for a picked photo; SubmitFlow revokes them. */
  makePreview: (file: File) => string;
  onSend: (draft: Omit<CatchDraft, "clientUuid">) => void;
  onBack: () => void;
}

const NO_LENGTH_YET: WeightResult = { ok: false, problem: "missing" };

export function SubmitCatch({ tournament, makePreview, onSend, onBack }: Props) {
  const { metric } = tournament;
  // From 1024 px: photos on the left, species, weight and Send on the right, so Send is always in
  // view without a sticky bar; an empty slot is a drop zone (Figma 221:1139).
  const wide = useBreakpoint() === "expanded";
  const [required, setRequired] = useState<readonly [PickedPhoto | null, PickedPhoto | null]>([null, null]);
  const [extras, setExtras] = useState<readonly PickedPhoto[]>([]);
  const [species, setSpecies] = useState<SpeciesChoice | null>(null);
  const [weight, setWeight] = useState(EMPTY_WEIGHT);

  const pick = (file: File): PickedPhoto => ({ file, previewUrl: makePreview(file) });
  const extraPicker = usePhotoPicker((file) => setExtras((current) => [...current, pick(file)]));

  const measurement = metric === "weight" ? parseWeight(weight) : NO_LENGTH_YET;
  const missing = missingInputs({ metric, requiredFilled: [required[0] !== null, required[1] !== null], speciesChosen: species !== null, measurement });
  const stillNeeded = stillNeededLine(missing, metric);
  const photoCount = (required[0] ? 1 : 0) + (required[1] ? 1 : 0) + extras.length;
  // Extras come after both required photos, so photos 1 and 2 keep their meaning (scoring.md §5).
  const canAddExtra = required[0] !== null && required[1] !== null && photoCount < MAX_PHOTOS;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (missing.length > 0 || !measurement.ok || !species || !required[0] || !required[1]) return;
    onSend({
      eventId: tournament.eventId,
      species,
      weightHoz: measurement.hoz,
      photos: [required[0], required[1], ...extras],
      enteredMeasurement: enteredWeightText(weight),
    });
  }

  function requiredSlot(index: 0 | 1) {
    const slot = index + 1;
    const photo = required[index];
    return (
      <PhotoSlot
        key={slot}
        label={photoSlotLabel(slot, metric)}
        name={photoSlotName(slot, metric)}
        dropZone={wide}
        note={photo || !(required[0] || required[1]) ? "Required" : "Required · add this to send"}
        state={
          photo
            ? { kind: "filled", previewUrl: photo.previewUrl }
            : { kind: "empty", onPick: (file) => setRequired((current) => (index === 0 ? [pick(file), current[1]] : [current[0], pick(file)])) }
        }
      />
    );
  }

  const codeWord = tournament.codeWord && (
    <div className="code-word">
      <p className="code-word-word">
        <span className="t-caption-caps code-word-label">Code word</span>
        <span className="t-number-row">{tournament.codeWord}</span>
      </p>
      <p className="t-callout code-word-help">Write it on a card. Show it in either required photo.</p>
    </div>
  );

  const photos = (
    <>
      <div className="section-heading">
        <h2 className="t-title-section">Proof photos</h2>
        <p className="t-callout t-secondary">Both required · up to 2 more</p>
      </div>

      <div className="photo-slots">
        {requiredSlot(0)}
        {requiredSlot(1)}
        {extras.map((photo, index) => (
          <PhotoSlot
            key={index + 3}
            label={photoSlotLabel(index + 3, metric)}
            name={photoSlotName(index + 3, metric)}
            note="Optional"
            state={{ kind: "filled", previewUrl: photo.previewUrl }}
          />
        ))}
      </div>

      {canAddExtra && (
        <>
          <Button variant="secondary" full={!wide} icon="/icons/plus.svg" onClick={extraPicker.open}>
            Add photo (optional)
          </Button>
          {extraPicker.input}
        </>
      )}
    </>
  );

  const speciesAndWeight = (
    <>
      <SpeciesPicker species={tournament.species} selectedId={species?.id ?? null} onSelect={setSpecies} />

      {metric === "weight" ? (
        <WeightInput id="catch-weight" value={weight} onChange={setWeight} />
      ) : (
        <p className="t-callout t-secondary todo-host">
          Length entry comes next.
          <TodoTag row="SUB-01b" />
        </p>
      )}
    </>
  );

  const send = (
    <>
      <ActionBar>
        <Button variant="primary" large type="submit" disabled={stillNeeded !== null} todo="S1-submit">
          Send catch
        </Button>
      </ActionBar>
      {stillNeeded && (
        <p className="still-needed t-callout-strong" aria-live="polite">
          <Icon src="/icons/alert-warning.svg" size={20} />
          <span>{stillNeeded}</span>
        </p>
      )}
    </>
  );

  const dates = (
    <p className="t-footnote t-secondary">
      Fishing until {formatClubTime(tournament.endsAt)} · submit by {formatClubTime(tournament.submitDeadline)}
    </p>
  );

  if (wide) {
    return (
      <form className="screen screen-wide" onSubmit={submit} noValidate>
        <NavBar title="Submit a catch" backLabel="Tournament" backName="Back to Tournament" onBack={onBack} />
        <div className="screen-content submit-content submit-columns">
          <div className="submit-columns-head">
            {dates}
            {codeWord}
          </div>
          <div className="submit-columns-photos">{photos}</div>
          <div className="submit-columns-form">
            {speciesAndWeight}
            <div className="submit-columns-send">{send}</div>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <NavBar title="Submit a catch" backLabel="Tournament" backName="Back to Tournament" onBack={onBack} />
      <div className="screen-content submit-content">
        {dates}
        {codeWord}
        {photos}
        {speciesAndWeight}
      </div>

      <div className="submit-bottom">
        {stillNeeded && (
          <p className="still-needed t-callout-strong" aria-live="polite">
            <Icon src="/icons/alert-warning.svg" size={20} />
            <span>{stillNeeded}</span>
          </p>
        )}
        <ActionBar>
          <Button variant="primary" large type="submit" disabled={stillNeeded !== null} todo="S1-submit">
            Send catch
          </Button>
        </ActionBar>
      </div>
    </form>
  );
}
