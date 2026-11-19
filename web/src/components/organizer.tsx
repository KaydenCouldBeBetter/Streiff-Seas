// Components the Tournaments list and the organizer's screens share (Figma Flow 9a, 9b and their
// component set): Tournament card, Check row, Picker field, Date-time field, Stat tile, Checklist
// item, Export card. Every colour comes from the --cf-* tokens; every icon goes through <Icon>.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChecklistItem } from "../lib/eventAdmin";
import { hashGroups, type ExportFile } from "../lib/exports";
import type { TournamentCardView } from "../lib/tournaments";
import { Button, EventStatus, Icon, Sheet } from "./ui";

/** One tournament on Home (Figma Tournament card 41:157): the whole card opens EVT-02. */
export function TournamentCard({ card, onOpen }: { card: TournamentCardView; onOpen: () => void }) {
  return (
    <button type="button" className="tournament-card" onClick={onOpen}>
      <span className="tournament-card-body">
        <EventStatus status={card.status} />
        <span className="t-headline">{card.name}</span>
        <span className="t-footnote t-secondary">{card.dates}</span>
        <span className="t-callout-strong">{card.entry}</span>
      </span>
      <Icon src="/icons/chevron-right.svg" size={24} />
    </button>
  );
}

/** A group heading in caps (Figma Caption/Caps): "LIVE NOW", "DRAFTS", "PAST". */
export function GroupHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="t-caption-caps t-secondary group-heading">
      {children}
    </h2>
  );
}

/** An icon and a line of secondary text (Figma Note): "Saving enters the judge…". */
export function Note({ icon = "/icons/info.svg", children }: { icon?: string; children: ReactNode }) {
  return (
    <p className="org-note t-callout t-secondary">
      <Icon src={icon} size={24} />
      <span>{children}</span>
    </p>
  );
}

interface CheckGroupProps {
  legend: string;
  options: readonly { id: string; name: string }[];
  selected: readonly string[];
  disabled?: boolean;
  onChange: (selected: string[]) => void;
  /** After the rows, e.g. "Add a species". */
  children?: ReactNode;
}

/**
 * A multi-select list as check rows (Figma Check row 84:512): a fieldset with its legend and one
 * checkbox per row; the whole row toggles. Not a <select multiple>, which iOS hides in a wheel.
 */
export function CheckGroup({ legend, options, selected, disabled = false, onChange, children }: CheckGroupProps) {
  const chosen = new Set(selected);
  return (
    <fieldset className="check-group" disabled={disabled}>
      <legend className="t-title-section">
        {legend}
        <span className="visually-hidden">, {chosen.size} chosen</span>
      </legend>
      {options.map((option) => {
        const checked = chosen.has(option.id);
        return (
          <label key={option.id} className={`check-row${checked ? " is-checked" : ""}`}>
            <input
              type="checkbox"
              className="visually-hidden"
              checked={checked}
              onChange={() => onChange(checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
            />
            <span className="check-box" aria-hidden="true">
              {checked && <Icon src="/icons/check-on-primary.svg" size={18} />}
            </span>
            <span className="t-body">{option.name}</span>
          </label>
        );
      })}
      {children}
    </fieldset>
  );
}

interface PickerFieldProps {
  id: string;
  label: string;
  help: string;
  error?: string | null;
  value: string;
  options: readonly { id: string; name: string }[];
  /** The sheet's title, naming the role: "Choose the judge". */
  sheetTitle: string;
  /** Under the sheet's title: "Only organizers can judge". */
  sheetNote?: string;
  /** Offer "No one" as the first row (the backup judge of a draft may be left empty). */
  allowNone?: boolean;
  onChange: (id: string) => void;
}

/**
 * Chooses one person (Figma Picker field 85:490): looks like a field, acts as a button; it opens a
 * sheet of 48 px radio rows. Empty shows "Choose a person". Error: danger border and the message.
 */
export function PickerField({ id, label, help, error, value, options, sheetTitle, sheetNote, allowNone = false, onChange }: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.id === value);
  const helpId = `${id}-help`;
  const rows = allowNone ? [{ id: "", name: "No one yet" }, ...options] : options;
  return (
    <div className="field">
      <span id={`${id}-label`} className="t-callout-strong">
        {label}
      </span>
      <button
        type="button"
        id={id}
        className={`picker-field${error ? " is-invalid" : ""}`}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}`}
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        onClick={() => setOpen(true)}
      >
        <span className={`t-body${chosen ? "" : " t-secondary"}`}>{chosen?.name ?? "Choose a person"}</span>
        <Icon src="/icons/chevron-down-secondary.svg" size={24} />
      </button>
      <p id={helpId} className={`field-help t-footnote${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
        {error && <Icon src="/icons/alert.svg" size={18} />}
        <span>{error ?? help}</span>
      </p>
      {open && (
        <Sheet title={sheetTitle} onCancel={() => setOpen(false)}>
          {sheetNote && <p className="t-footnote t-secondary">{sheetNote}</p>}
          <fieldset className="species-picker">
            <legend className="visually-hidden">{sheetTitle}</legend>
            {rows.map((option) => {
              const selected = option.id === value;
              return (
                <label key={option.id || "none"} className={`species-option${selected ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`${id}-choice`}
                    className="visually-hidden"
                    checked={selected}
                    onChange={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  />
                  <Icon src={selected ? "/icons/radio-selected.svg" : "/icons/radio.svg"} size={22} />
                  <span className="t-headline">{option.name}</span>
                </label>
              );
            })}
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}

interface DateTimeFieldProps {
  id: string;
  label: string;
  help: string;
  error?: string | null;
  /** A `datetime-local` value read as Eastern time (lib/clubTime.ts). */
  value: string;
  min?: string;
  onValueChange: (value: string) => void;
}

/** A date and time in Eastern time (Figma Date-time field; P12): the native picker, labelled as Eastern. */
export function DateTimeField({ id, label, help, error, value, min, onValueChange }: DateTimeFieldProps) {
  const helpId = `${id}-help`;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label-pair">
        <span className="t-callout-strong">{label}</span>
        <span className="t-footnote t-secondary">Eastern time</span>
      </label>
      <input
        id={id}
        type="datetime-local"
        className="field-input"
        value={value}
        min={min}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
      />
      <p id={helpId} className={`field-help t-footnote${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
        {error && <Icon src="/icons/alert.svg" size={18} />}
        <span>{error ?? help}</span>
      </p>
    </div>
  );
}

/** A big number and what it counts (Figma Manage "Right now" tiles). */
export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <p className="t-number-large">{value}</p>
      <p className="t-footnote t-secondary">{label}</p>
    </div>
  );
}

/**
 * The Open checklist (ORG-01a): done items with a check, the rest as "To do" with what to fix.
 * With `onFix`, each "To do" row is a button that opens the tournament form to fix it.
 */
export function Checklist({ items, onFix }: { items: readonly ChecklistItem[]; onFix?: () => void }) {
  const ready = items.every((item) => item.done);
  return (
    <section className="checklist-card" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading" className="t-headline">
        {ready ? "Ready to open" : "Before you can open"}
      </h2>
      <ul className="checklist">
        {items.map((item) => {
          const row = (
            <>
              <Icon src={item.done ? "/icons/check-success-24.svg" : "/icons/alert-warning.svg"} size={24} />
              <span className="t-callout">
                {item.done ? item.label : item.fix}
                <span className="visually-hidden">{item.done ? ", done" : ", to do"}</span>
              </span>
            </>
          );
          return (
            <li key={item.id} className={`checklist-item${item.done ? " is-done" : ""}`}>
              {!item.done && onFix ? (
                <button type="button" className="checklist-fix" onClick={onFix}>
                  {row}
                  <Icon src="/icons/chevron-right.svg" size={24} />
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ExportCardProps {
  title: string;
  file: ExportFile;
  /** ORG-01d, while closed: Download only, no hash, "Preview, not final" (Gap 15). */
  preview?: boolean;
}

/** The browser can hand this file to the share sheet (Web Share with files; decisions.md 2026-10-05). */
function shareable(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/** One export (Figma Export card 86:579): the file, its SHA-256 in 8 groups, Share, Download, Copy hash. */
export function ExportCard({ title, file, preview = false }: ExportCardProps) {
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const csv = new File([file.text], file.fileName, { type: "text/csv" });
  const groups = hashGroups(file.sha256);

  function download() {
    const url = URL.createObjectURL(csv);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus({ tone: "success", text: "Downloaded. Find it in Files › Downloads." });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.sha256);
      setCopied(true);
      setStatus({ tone: "success", text: "Hash copied. Paste it in the group chat." });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setStatus({ tone: "danger", text: "Couldn't copy. Press and hold the hash to copy it." });
    }
  }

  async function share() {
    try {
      await navigator.share({ files: [csv], text: `${file.fileName} SHA-256: ${file.sha256}` });
      setStatus({ tone: "success", text: "Shared." });
    } catch (error) {
      // Closing the share sheet is not an error worth showing.
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus({ tone: "danger", text: "Couldn't share. Download it and copy the hash instead." });
    }
  }

  return (
    <section className="export-card" aria-label={`${title}, ${file.fileName}, ${file.rows} rows`}>
      <div>
        <h2 className="t-headline">{title}</h2>
        <p className="t-footnote t-secondary">
          {file.fileName} · {file.rows} {file.rows === 1 ? "row" : "rows"}
        </p>
      </div>
      {preview ? (
        <p className="export-preview t-footnote-strong">
          <Icon src="/icons/alert-warning.svg" size={24} />
          <span>Preview, not final. No hash: don't post it.</span>
        </p>
      ) : (
        <div className="hash-block">
          <p className="t-caption-caps t-secondary">SHA-256</p>
          <p className="hash-text" aria-label="SHA-256 hash, 64 characters">
            {[0, 2, 4, 6].map((i) => (
              <span key={i} aria-hidden="true">
                {groups[i]} {groups[i + 1]}
              </span>
            ))}
          </p>
        </div>
      )}
      {status && (
        <p className={`export-status t-footnote-strong is-${status.tone}`} role="status">
          <Icon src={status.tone === "success" ? "/icons/check-success-24.svg" : "/icons/alert-danger-24.svg"} size={24} />
          <span>{status.text}</span>
        </p>
      )}
      {!preview && shareable(csv) && (
        <Button variant="primary" full icon="/icons/upload-on-primary.svg" onClick={() => void share()}>
          Share file and hash
        </Button>
      )}
      <div className="export-actions">
        <Button variant="secondary" full onClick={download}>
          Download
        </Button>
        {!preview && (
          <Button variant="secondary" full icon={copied ? "/icons/check-link.svg" : undefined} onClick={() => void copy()}>
            {copied ? "Copied" : "Copy hash"}
          </Button>
        )}
      </div>
    </section>
  );
}
