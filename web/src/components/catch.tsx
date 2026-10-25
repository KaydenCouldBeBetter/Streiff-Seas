// The Figma components for one catch: Photo slot, Species option (as a picker), Weight input
// and Catch card. Their usage notes in Figma are followed here.

import { useRef, useState, type ReactElement } from "react";
import { SegmentedToggle, StatusChip, TodoTag } from "./ui";
import type { SpeciesChoice } from "../lib/catchSender";
import { parseWeight, switchWeightFormat, weightProblemCopy, type WeightEntry, type WeightFormat } from "../lib/weightEntry";

/**
 * A hidden file input and a function that opens it. The picker offers camera or library;
 * capture isn't forced (Figma Photo slot notes).
 */
export function usePhotoPicker(onPick: (file: File) => void): { open: () => void; input: ReactElement } {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      hidden
      tabIndex={-1}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        // Cleared so the same file can be picked again into another slot.
        event.currentTarget.value = "";
        if (file) onPick(file);
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
}

export type PhotoSlotState =
  | { kind: "empty"; onPick: (file: File) => void }
  | { kind: "filled"; previewUrl: string }
  | { kind: "uploading"; previewUrl: string; fraction: number | null }
  | { kind: "failed"; previewUrl: string };

interface PhotoSlotProps {
  /** "1 · Holding the fish" (catchForm.photoSlotLabel). */
  label: string;
  /** The spoken name: "Photo 1, holding the fish, required" (catchForm.photoSlotName). */
  name: string;
  /** "Required", "Optional", "Sent"… Failed always says the photo is still in the camera roll. */
  note: string;
  state: PhotoSlotState;
}

/** One proof-photo slot. Append-only: no remove, replace or reorder control in any state (R-CAT-U-26). */
export function PhotoSlot({ label, name, note, state }: PhotoSlotProps) {
  return (
    <div className="photo-slot">
      {state.kind === "empty" ? <EmptyImage name={name} onPick={state.onPick} /> : <FilledImage name={name} state={state} />}
      <p className="t-callout-strong">{label}</p>
      {state.kind === "failed" ? (
        <p className="t-footnote photo-slot-note-danger">Didn't send. Your photo is still in your camera roll.</p>
      ) : (
        <p className="t-footnote t-secondary">{note}</p>
      )}
    </div>
  );
}

function EmptyImage({ name, onPick }: { name: string; onPick: (file: File) => void }) {
  const picker = usePhotoPicker(onPick);
  return (
    <>
      <button type="button" className="photo-slot-image photo-slot-empty" aria-label={`${name}, empty. Add photo`} onClick={picker.open}>
        <img src="/icons/camera-link.svg" width={28} height={28} alt="" aria-hidden="true" />
        <span className="t-callout-strong">Add photo</span>
      </button>
      {picker.input}
    </>
  );
}

function FilledImage({ name, state }: { name: string; state: Exclude<PhotoSlotState, { kind: "empty" }> }) {
  return (
    <div className={`photo-slot-image photo-slot-filled${state.kind === "failed" ? " is-failed" : ""}`}>
      <img className="photo-slot-preview" src={state.previewUrl} alt={`${name}, added`} />
      {state.kind === "filled" && <StatusChip tone="success" icon="/icons/check-success.svg" label="Added" />}
      {state.kind === "failed" && <StatusChip tone="danger" icon="/icons/close-danger.svg" label="Not sent" />}
      {state.kind === "uploading" && (
        <div className="photo-slot-progress">
          <p className="t-footnote-strong">{state.fraction === null ? "Uploading…" : `Uploading… ${Math.round(state.fraction * 100)}%`}</p>
          <div className="progress-track progress-track-small" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${Math.round((state.fraction ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

interface SpeciesPickerProps {
  /** This tournament's species only (R-CAT-C-09). */
  species: readonly SpeciesChoice[];
  selectedId: string | null;
  onSelect: (species: SpeciesChoice) => void;
}

/** Species options stacked full width; nothing is pre-selected. Native radios, so "1 of 2" is announced. */
export function SpeciesPicker({ species, selectedId, onSelect }: SpeciesPickerProps) {
  // TODO(S1): more than 4 species open the same list in a sheet (Figma Species option notes).
  return (
    <fieldset className="species-picker">
      <legend className="t-title-section">Species</legend>
      {species.map((option) => {
        const selected = option.id === selectedId;
        return (
          <label key={option.id} className={`species-option${selected ? " is-selected" : ""}`}>
            <input type="radio" name="species" className="visually-hidden" checked={selected} onChange={() => onSelect(option)} />
            <img src={selected ? "/icons/radio-selected.svg" : "/icons/radio.svg"} width={22} height={22} alt="" aria-hidden="true" />
            <span className="t-headline">{option.name}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

const WEIGHT_FORMATS: readonly { id: WeightFormat; label: string }[] = [
  { id: "lb", label: "Decimal lb" },
  { id: "lb_oz", label: "lb + oz" },
];

interface WeightInputProps {
  id: string;
  value: WeightEntry;
  onChange: (value: WeightEntry) => void;
}

/**
 * Both entry formats whatever the member's display units (scoring.md §4). The unit is part of
 * each field's accessible name. A field's error shows once it has been left.
 */
export function WeightInput({ id, value, onChange }: WeightInputProps) {
  const [left, setLeft] = useState(false);
  const result = parseWeight(value);
  const error = left && !result.ok ? weightProblemCopy(result.problem, value.format) : null;
  const helpId = `${id}-help`;
  const field = (key: "pounds" | "wholePounds" | "ounces", unit: string, spoken: string, inputMode: "decimal" | "numeric") => (
    <div className={`unit-field${error ? " is-invalid" : ""}`}>
      <input
        id={`${id}-${key}`}
        className="unit-field-input t-number-row"
        inputMode={inputMode}
        autoComplete="off"
        aria-label={`Weight, ${spoken}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
        value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.currentTarget.value })}
        onBlur={() => setLeft(true)}
      />
      <span className="t-callout-strong t-secondary" aria-hidden="true">
        {unit}
      </span>
    </div>
  );

  return (
    <div className="weight-input" role="group" aria-labelledby={`${id}-label`}>
      <h2 id={`${id}-label`} className="t-title-section">
        Weight
      </h2>
      <SegmentedToggle
        labelledBy={`${id}-label`}
        options={WEIGHT_FORMATS}
        selected={value.format}
        onSelect={(format) => onChange(switchWeightFormat(value, format))}
      />
      <div className="unit-fields">
        {value.format === "lb" ? (
          field("pounds", "lb", "pounds", "decimal")
        ) : (
          <>
            {field("wholePounds", "lb", "pounds", "numeric")}
            {field("ounces", "oz", "ounces", "decimal")}
          </>
        )}
      </div>
      <p id={helpId} className={`field-help t-footnote${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
        {error && <img src="/icons/alert.svg" width={18} height={18} alt="" aria-hidden="true" />}
        <span>{error ?? (value.format === "lb" ? "Enter exactly what the scale shows, to 2 decimals." : "Ounces to one decimal, 0 to 15.9.")}</span>
      </p>
    </div>
  );
}

interface CatchCardProps {
  /** Photo 1's preview, or null for the photo icon. */
  thumbnailUrl: string | null;
  value: string;
  unit: string;
  /** "Largemouth bass · 2 photos" */
  title: string;
  /** "Submitted Sat, Jul 10, 7:42 AM" */
  time: string;
  /** The screens.md row the card opens while it isn't built (MY-02). */
  todo?: string;
  onClick?: () => void;
}

/** One catch; the whole card is one button. Members never see flag codes. */
export function CatchCard({ thumbnailUrl, value, unit, title, time, todo, onClick }: CatchCardProps) {
  // Only the Pending chip for now: SUB-02b shows a catch the moment it lands. MY-01 and LB-02
  // add Verified, Rejected (with its reason), Retracted, Archived and the "In best 10" marker.
  return (
    <button type="button" className="catch-card" onClick={onClick}>
      <span className="catch-card-thumb">
        {thumbnailUrl ? (
          <img className="photo-slot-preview" src={thumbnailUrl} alt="" />
        ) : (
          <img src="/icons/photo.svg" width={24} height={24} alt="" aria-hidden="true" />
        )}
      </span>
      <span className="catch-card-body">
        <span className="catch-card-measurement">
          <span className="t-number-row">{value}</span>
          <span className="t-footnote-strong t-secondary">{unit}</span>
        </span>
        <span className="t-callout-strong">{title}</span>
        <span className="t-footnote t-secondary">{time}</span>
        <span className="catch-card-chips">
          <StatusChip tone="warning" icon="/icons/clock-warning.svg" label="Pending" />
        </span>
      </span>
      <img src="/icons/chevron-right.svg" width={24} height={24} alt="" aria-hidden="true" />
      {todo && <TodoTag row={todo} />}
    </button>
  );
}
