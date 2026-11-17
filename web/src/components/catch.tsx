// The Figma components for one catch: Photo slot, Species option (as a picker), Weight input,
// Length input,
// Status chip, Marker / In best 10, Catch card and the photo viewer. Their usage notes in Figma
// are followed here. LB-02, LB-03 and JDG-02 are meant to reuse the catch ones (an angler's
// catches as other members see them, never Rejected or Retracted there), and LB-03, MY-06 and
// JDG-02 the Timeline item.

import { useRef, useState, type ReactElement } from "react";
import { Icon, SegmentedToggle, Sheet, StatusChip, TodoTag, type Tone } from "./ui";
import type { SpeciesChoice } from "../lib/catchSender";
import type { TimelineEntry, TimelineKind } from "../lib/catchTimeline";
import { photoLabels, type CatchPhoto, type CatchStatus } from "../lib/myCatches";
import { EIGHTHS_LABELS, lengthPreview, lengthProblemCopy, parseLength, type LengthEntry } from "../lib/lengthEntry";
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
  /** On a wide window an empty slot is a drop zone with "Choose file" (Figma Photo drop zone). */
  dropZone?: boolean;
}

/** One proof-photo slot. Append-only: no remove, replace or reorder control in any state (R-CAT-U-26). */
export function PhotoSlot({ label, name, note, state, dropZone = false }: PhotoSlotProps) {
  if (state.kind === "empty" && dropZone) return <DropZone label={label} name={name} note={note} onPick={state.onPick} />;
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

/**
 * The empty slot on a wide window: a dashed zone that takes a dropped photo, and always a
 * "Choose file" button, so dragging is an extra and never the only way (WCAG 2.5.7). It takes
 * one image file; anything else is ignored, and the picker's own limits apply after that.
 */
function DropZone({ label, name, note, onPick }: { label: string; name: string; note: string; onPick: (file: File) => void }) {
  const picker = usePhotoPicker(onPick);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`photo-slot drop-zone${over ? " is-over" : ""}`}
      role="group"
      aria-label={`${name}, empty`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) onPick(file);
      }}
    >
      <Icon src="/icons/upload-link.svg" size={24} />
      <p className="t-headline">{label}</p>
      <p className="t-footnote t-secondary">{note}</p>
      <p className="t-callout t-secondary" aria-hidden="true">
        {over ? "Drop to add this photo" : "Drag a photo here, or"}
      </p>
      <button type="button" className="button button-secondary button-medium" onClick={picker.open}>
        Choose file
      </button>
      {picker.input}
    </div>
  );
}

function EmptyImage({ name, onPick }: { name: string; onPick: (file: File) => void }) {
  const picker = usePhotoPicker(onPick);
  return (
    <>
      <button type="button" className="photo-slot-image photo-slot-empty" aria-label={`${name}, empty. Add photo`} onClick={picker.open}>
        <Icon src="/icons/camera-link.svg" size={28} />
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
            <Icon src={selected ? "/icons/radio-selected.svg" : "/icons/radio.svg"} size={22} />
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
        {error && <Icon src="/icons/alert.svg" size={18} />}
        <span>{error ?? (value.format === "lb" ? "Enter exactly what the scale shows, to 2 decimals." : "Ounces to one decimal, 0 to 15.9.")}</span>
      </p>
    </div>
  );
}

interface LengthInputProps {
  id: string;
  value: LengthEntry;
  onChange: (value: LengthEntry) => void;
}

/**
 * Length to the eighth inch: whole inches, plus an eighths selector that opens a sheet listing
 * 0 to 7/8 (tap, no slider or drag). The quarter-inch value the club scores, rounded down, is
 * previewed and announced politely as it changes (Figma Length input; scoring.md example 6).
 */
export function LengthInput({ id, value, onChange }: LengthInputProps) {
  const [left, setLeft] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const result = parseLength(value);
  const error = left && !result.ok ? lengthProblemCopy(result.problem) : null;
  const preview = lengthPreview(value);
  const helpId = `${id}-help`;
  const eighths = EIGHTHS_LABELS[value.eighths] ?? "0";
  return (
    <div className="length-input" role="group" aria-labelledby={`${id}-label`}>
      <h2 id={`${id}-label`} className="t-title-section">
        Length
      </h2>
      <div className="unit-fields">
        <div className={`unit-field${error ? " is-invalid" : ""}`}>
          <input
            id={`${id}-inches`}
            className="unit-field-input t-number-row"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Length, whole inches"
            aria-invalid={error ? true : undefined}
            aria-describedby={helpId}
            value={value.inches}
            onChange={(event) => onChange({ ...value, inches: event.currentTarget.value })}
            onBlur={() => setLeft(true)}
          />
          <span className="t-callout-strong t-secondary" aria-hidden="true">
            in
          </span>
        </div>
        <button type="button" className="unit-field eighths-button" aria-label={`Eighths of an inch, ${eighths}`} onClick={() => setChoosing(true)}>
          <span className="t-number-row">{eighths}</span>
          <Icon src="/icons/chevron-down-secondary.svg" size={24} />
        </button>
      </div>
      {/* Figma draws no help line here; the error line appears only when there is one. */}
      <p id={helpId} className="field-help t-footnote is-error" aria-live="polite" hidden={!error}>
        {error && <Icon src="/icons/alert.svg" size={18} />}
        <span>{error}</span>
      </p>
      <p className="length-preview t-callout-strong" aria-live="polite">
        {preview && (
          <>
            <Icon src="/icons/check-success-20.svg" size={20} />
            <span>{preview}</span>
          </>
        )}
      </p>
      {choosing && (
        <Sheet title="Eighths of an inch" onCancel={() => setChoosing(false)}>
          <fieldset className="eighths-options">
            <legend className="visually-hidden">Eighths of an inch</legend>
            {EIGHTHS_LABELS.map((label, index) => {
              const selected = index === value.eighths;
              return (
                <label key={label} className={`species-option${selected ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`${id}-eighths`}
                    className="visually-hidden"
                    checked={selected}
                    onChange={() => {
                      onChange({ ...value, eighths: index });
                      setChoosing(false);
                    }}
                  />
                  <Icon src={selected ? "/icons/radio-selected.svg" : "/icons/radio.svg"} size={22} />
                  <span className="t-headline">{label === "0" ? "0 (whole inch)" : `${label} in`}</span>
                </label>
              );
            })}
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}

const STATUS: Record<CatchStatus, { tone: Tone; label: string; icon: string }> = {
  pending: { tone: "warning", label: "Pending", icon: "/icons/clock-warning.svg" },
  verified: { tone: "success", label: "Verified", icon: "/icons/check-success.svg" },
  rejected: { tone: "danger", label: "Rejected", icon: "/icons/close-danger.svg" },
  retracted: { tone: "neutral", label: "Retracted", icon: "/icons/undo-neutral-small.svg" },
};

/** A catch's status: icon + word, never color alone. Read as "Status: Pending". */
export function CatchStatusChip({ status }: { status: CatchStatus }) {
  const { tone, label, icon } = STATUS[status];
  return <StatusChip tone={tone} icon={icon} label={label} spoken={`Status: ${label}`} />;
}

/** A verified catch counted in the angler's best n. Read as "Counted in best 10". */
export function InBestMarker({ bestN }: { bestN: number }) {
  return (
    <StatusChip tone="selected" icon="/icons/star-link.svg" label={`In best ${bestN}`} spoken={`Counted in best ${bestN}`} />
  );
}

interface CatchCardProps {
  /** Photo 1's preview, or null for the photo icon. */
  thumbnailUrl: string | null;
  /** Final: the archive icon in place of the photo, and no file is requested. */
  archived?: boolean;
  value: string;
  unit: string;
  /** "Largemouth bass · 2 photos" */
  title: string;
  /** "Submitted Sat, Jul 10, 7:42 AM" */
  time: string;
  status: CatchStatus;
  /** Set when a verified catch counts in the angler's best n: the "In best 10" marker. */
  inBestN?: number;
  /** A rejected catch's reason, shown inline on the angler's own list. */
  reason?: string;
  /** The screens.md row the card opens while it isn't built (MY-02). */
  todo?: string;
  /** The catch shown beside the list on a wide window: a 2 px border and a tint, and aria-current. */
  selected?: boolean;
  onClick?: () => void;
}

/** One catch; the whole card is one button. Members never see flag codes. */
export function CatchCard({ thumbnailUrl, archived = false, value, unit, title, time, status, inBestN, reason, todo, selected = false, onClick }: CatchCardProps) {
  return (
    <button type="button" className={`catch-card${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined} onClick={onClick}>
      <span className="catch-card-thumb">
        {thumbnailUrl && !archived ? (
          <img className="photo-slot-preview" src={thumbnailUrl} alt="" />
        ) : (
          <Icon src={archived ? "/icons/archive.svg" : "/icons/photo.svg"} size={24} />
        )}
      </span>
      <span className="catch-card-body">
        <span className="measurement">
          <span className="t-number-row">{value}</span>
          <span className="t-footnote-strong t-secondary">{unit}</span>
        </span>
        <span className="t-callout-strong">{title}</span>
        <span className="t-footnote t-secondary">{time}</span>
        <span className="chips">
          <CatchStatusChip status={status} />
          {inBestN !== undefined && <InBestMarker bestN={inBestN} />}
        </span>
        {reason && <span className="t-footnote catch-card-reason">Reason: “{reason}”</span>}
      </span>
      <Icon src="/icons/chevron-right.svg" size={24} />
      {todo && <TodoTag row={todo} />}
    </button>
  );
}

interface PhotoViewerProps {
  photos: readonly CatchPhoto[];
  /** Final: "Photo archived" in place of each photo, and no file is requested. */
  archived: boolean;
}

/** The large photo with its label, and a row of thumbnails that switch it. */
export function PhotoViewer({ photos, archived }: PhotoViewerProps) {
  const [shown, setShown] = useState(0);
  const labels = photoLabels(photos.length);
  const current = labels[shown];
  if (current === undefined) return null;
  const url = archived ? undefined : photos[shown]?.url;
  const caption = `${shown + 1} of ${photos.length} · ${current.long}${archived ? " · Photo archived" : ""}`;
  return (
    <div className="photo-viewer">
      <figure className="photo-viewer-photo">
        {url && <img src={url} alt="" />}
        {archived && (
          <span className="photo-viewer-archived t-callout-strong">
            <Icon src="/icons/archive.svg" size={24} />
            Photo archived
          </span>
        )}
        <figcaption className="photo-viewer-label t-footnote-strong">{caption}</figcaption>
      </figure>
      <div className="photo-viewer-thumbs">
        {labels.map((label, i) => {
          const thumb = archived ? undefined : photos[i]?.url;
          return (
            <button key={i} type="button" className="photo-viewer-thumb t-footnote" aria-pressed={i === shown} onClick={() => setShown(i)}>
              <span className="photo-viewer-thumb-image">{thumb && <img src={thumb} alt="" />}</span>
              <span>
                <span className="visually-hidden">Show photo {i + 1}: </span>
                {label.short}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TIMELINE_ICON: Record<TimelineKind, string> = {
  Submitted: "/icons/timeline-submitted.svg",
  Edited: "/icons/timeline-edited.svg",
  "Photo added": "/icons/timeline-photo.svg",
  Rejected: "/icons/timeline-rejected.svg",
  "Re-approved": "/icons/timeline-approved.svg",
  "Corrected and approved": "/icons/timeline-corrected.svg",
  Approved: "/icons/timeline-approved.svg",
  Retracted: "/icons/timeline-retracted.svg",
};

interface CatchTimelineProps {
  /** Newest first (timelineEntries). */
  entries: readonly TimelineEntry[];
  /** The id of the heading that names this list. */
  labelledBy: string;
}

/**
 * One catch's audit rows, a marker and a line per item. Each item is drawn for the eye and
 * hidden from screen readers, which get one spoken sentence instead (Figma Timeline item note).
 */
export function CatchTimeline({ entries, labelledBy }: CatchTimelineProps) {
  return (
    <ol className="timeline" aria-labelledby={labelledBy}>
      {entries.map((entry, i) => (
        <li key={entry.id} className="timeline-item">
          <span className="timeline-rail" aria-hidden="true">
            <span className={`timeline-marker timeline-marker-${entry.tone}`}>
              <Icon src={TIMELINE_ICON[entry.kind]} size={18} />
            </span>
            {i < entries.length - 1 && <span className="timeline-line" />}
          </span>
          <div className="timeline-body" aria-hidden="true">
            <p className="t-headline">{entry.kind}</p>
            <p className="t-footnote t-secondary">{entry.meta}</p>
            {entry.detail.map((line) => (
              <p key={line.text} className="t-callout">
                {line.text}
              </p>
            ))}
          </div>
          <p className="visually-hidden">{entry.spoken}</p>
        </li>
      ))}
    </ol>
  );
}
