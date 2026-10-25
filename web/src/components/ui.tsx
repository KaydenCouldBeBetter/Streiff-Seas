// The Figma components the sign-in screens use: Brand, Nav bar (Push), Text field,
// Button (Large and Text) and Action bar. Their usage notes in Figma are followed here.

import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";

export function Brand() {
  return (
    <div className="brand">
      <p className="t-title-large">Chromie Fishing</p>
      <p className="t-callout t-secondary">Club scoreboard · members only</p>
    </div>
  );
}

interface NavBarProps {
  title: string;
  /** The previous screen's name when it fits, else "Back" (decisions.md 2026-10-03). */
  backLabel: string;
  /** Always "Back to <screen>". */
  backName: string;
  onBack: () => void;
}

/** Push type: back names where it goes; the title is the screen's h1. */
export function NavBar({ title, backLabel, backName, onBack }: NavBarProps) {
  return (
    <div className="nav-bar">
      <button type="button" className="nav-bar-back t-body" aria-label={backName} onClick={onBack}>
        <img src="/icons/chevron-left.svg" width={24} height={24} alt="" aria-hidden="true" />
        <span>{backLabel}</span>
      </button>
      <h1 className="nav-bar-title t-headline">{title}</h1>
      <span className="nav-bar-trailing" aria-hidden="true" />
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  id: string;
  label: string;
  help: string;
  /** Replaces the help line, with the alert icon, and marks the field invalid. */
  error?: string | null;
  value: string;
  onValueChange: (value: string) => void;
}

/** Label always above; the example text is a placeholder, never the label. */
export function TextField({ id, label, help, error, value, onValueChange, ...input }: TextFieldProps) {
  const helpId = `${id}-help`;
  return (
    <div className="field">
      <label htmlFor={id} className="t-callout-strong">
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="field-input"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.currentTarget.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
      />
      <p id={helpId} className={`field-help t-footnote${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
        {error && <img src="/icons/alert.svg" width={18} height={18} alt="" aria-hidden="true" />}
        <span>{error ?? help}</span>
      </p>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  variant: "primary" | "secondary" | "text";
  /** Large is the 56 px action-bar size; text buttons are 48 px. */
  large?: boolean;
  type?: "button" | "submit";
  /** Request in flight: the label changes, aria-busy is set and taps are ignored. */
  loading?: boolean;
  loadingLabel?: string;
  onClick?: () => void;
}

export function Button({ children, variant, large = false, type = "button", loading = false, loadingLabel = "Sending…", onClick }: ButtonProps) {
  const spinner = variant === "primary" ? "/icons/refresh-on-primary.svg" : "/icons/refresh-link.svg";
  return (
    <button
      type={type}
      className={`button button-${variant}${large ? " button-large" : ""}`}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) event.preventDefault();
        else onClick?.();
      }}
    >
      {loading && <img className="spin" src={spinner} width={24} height={24} alt="" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}

/** Sticky bottom actions; includes the home-indicator safe area. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}
