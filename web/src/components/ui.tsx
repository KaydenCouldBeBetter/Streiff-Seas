// The Figma components the screens use: Brand, Nav bar (Push and Large title), Event status,
// Live badge, Text field, Button (Large, Medium and Text), Action bar (Single and Accessory),
// List link, Tab bar, Banner, Empty state, Status chip and Segmented toggle. Their usage notes
// in Figma are followed here.

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
  /** The optional trailing text action ("History" on MY-02). */
  trailing?: { label: string; todo?: string; onClick?: () => void };
}

/** Push type: back names where it goes; the title is the screen's h1. */
export function NavBar({ title, backLabel, backName, onBack, trailing }: NavBarProps) {
  return (
    <div className="nav-bar">
      <button type="button" className="nav-bar-back t-body" aria-label={backName} onClick={onBack}>
        <img src="/icons/chevron-left.svg" width={24} height={24} alt="" aria-hidden="true" />
        <span>{backLabel}</span>
      </button>
      <h1 className="nav-bar-title t-headline">{title}</h1>
      {trailing ? (
        <span className="nav-bar-trailing">
          <button type="button" className="nav-bar-action t-body" onClick={trailing.onClick}>
            {trailing.label}
            {trailing.todo && <TodoTag row={trailing.todo} />}
          </button>
        </span>
      ) : (
        <span className="nav-bar-trailing" aria-hidden="true" />
      )}
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
  /** Large is the 56 px action-bar size; the others are 48 px. */
  large?: boolean;
  /** A 48 px primary or secondary as wide as its container (the Accessory action bar). */
  full?: boolean;
  /** A 24 px decorative icon before the label. */
  icon?: string;
  type?: "button" | "submit";
  /** Request in flight: the label changes, aria-busy is set and taps are ignored. */
  loading?: boolean;
  loadingLabel?: string;
  /** Pair it with a line saying what's missing (Figma Button notes; SUB-01d). */
  disabled?: boolean;
  /** The screens.md row this button should open once it's built (see TodoTag). */
  todo?: string;
  onClick?: () => void;
}

export function Button({ children, variant, large = false, full = false, icon, type = "button", loading = false, loadingLabel = "Sending…", disabled = false, todo, onClick }: ButtonProps) {
  const spinner = variant === "primary" ? "/icons/refresh-on-primary.svg" : "/icons/refresh-link.svg";
  const size = large ? " button-large" : variant === "text" ? "" : ` button-medium${full ? " button-full" : ""}`;
  return (
    <button
      type={type}
      className={`button button-${variant}${size}`}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={(event) => {
        if (loading) event.preventDefault();
        else onClick?.();
      }}
    >
      {loading && <img className="spin" src={spinner} width={24} height={24} alt="" aria-hidden="true" />}
      {!loading && icon && <img src={icon} width={24} height={24} alt="" aria-hidden="true" />}
      {loading ? loadingLabel : children}
      {todo && <TodoTag row={todo} />}
    </button>
  );
}

/** Sticky bottom actions; includes the home-indicator safe area. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

/** Accessory type: one compact primary pinned above the tab bar while submitting is open. */
export function AccessoryBar({ children }: { children: ReactNode }) {
  return <div className="action-bar-accessory">{children}</div>;
}

/**
 * Development only: a dashed tag naming the screens.md row a control should open, on
 * controls whose screen isn't built yet, or the features.json item that wires it up. Hidden from assistive tech and absent from
 * production builds, so the accessible names stay as designed.
 */
export function TodoTag({ row }: { row: string }) {
  if (!import.meta.env.DEV) return null;
  return (
    <span className="todo-tag" aria-hidden="true">
      TODO {row}
    </span>
  );
}

export type EventStatusValue = "live";

const EVENT_STATUS: Record<EventStatusValue, { label: string; icon: string }> = {
  // Draft, Closed and Final join this map with their Figma icons when EVT-02 shows them.
  live: { label: "Live", icon: "/icons/clock-success.svg" },
};

/** events.status in the large title's badge slot. Not a control. */
export function EventStatus({ status }: { status: EventStatusValue }) {
  const { label, icon } = EVENT_STATUS[status];
  return (
    <span className={`event-status event-status-${status} t-footnote-strong`}>
      <img src={icon} width={16} height={16} alt="" aria-hidden="true" />
      <span className="visually-hidden">Status: </span>
      {label}
    </span>
  );
}

export type LiveBadgeState = "live";

const LIVE_BADGE: Record<LiveBadgeState, string> = {
  // Reconnecting (LB-01b) and "Updated h:mm" (LB-01c) join this map when realtime lands (S2b).
  live: "Live",
};

/**
 * Leaderboard freshness, not events.status: an outlined pill, never the Event status tag.
 * A polite live region, so a change is announced ("Leaderboard reconnecting").
 */
export function LiveBadge({ state }: { state: LiveBadgeState }) {
  return (
    <span className={`live-badge live-badge-${state} t-footnote-strong`} role="status">
      <img src="/icons/live-dot.svg" width={10} height={10} alt="" aria-hidden="true" />
      <span className="visually-hidden">Leaderboard </span>
      {LIVE_BADGE[state]}
    </span>
  );
}

interface LargeNavBarProps {
  title: string;
  /** The title row's trailing badge: an EventStatus, or a LiveBadge on the leaderboard. */
  badge?: ReactNode;
  subtitle?: string;
}

/** Large title type: top-level screens. The title is the screen's h1. */
export function LargeNavBar({ title, badge, subtitle }: LargeNavBarProps) {
  return (
    <header className="nav-bar-large">
      <div className="nav-bar-large-title">
        <h1 className="t-title-large">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="t-footnote t-secondary">{subtitle}</p>}
    </header>
  );
}

interface ListLinkProps {
  icon: string;
  title: string;
  detail: string;
  todo?: string;
  onClick?: () => void;
}

/** A navigation row inside a screen; the whole row is one button. */
export function ListLink({ icon, title, detail, todo, onClick }: ListLinkProps) {
  return (
    <button type="button" className="list-link" onClick={onClick}>
      <img src={icon} width={24} height={24} alt="" aria-hidden="true" />
      <span className="list-link-text">
        <span className="t-headline">{title}</span>
        <span className="t-footnote t-secondary">{detail}</span>
      </span>
      <img src="/icons/chevron-right.svg" width={24} height={24} alt="" aria-hidden="true" />
      {todo && <TodoTag row={todo} />}
    </button>
  );
}

export interface Tab<Id extends string = string> {
  id: Id;
  label: string;
  /** The icon as drawn unselected. */
  icon: string;
  /** The icon as drawn selected, where Figma draws it in another color. */
  selectedIcon?: string;
  todo?: string;
}

interface TabBarProps<Id extends string> {
  tabs: readonly Tab<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
}

/** Top-level navigation between sections; tabs never perform actions. */
export function TabBar<Id extends string>({ tabs, selected, onSelect }: TabBarProps<Id>) {
  return (
    <nav className="tab-bar" aria-label="Sections">
      <div role="tablist" className="tab-bar-tabs">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" className="tab" aria-selected={tab.id === selected} onClick={() => onSelect(tab.id)}>
            <img src={tab.id === selected ? (tab.selectedIcon ?? tab.icon) : tab.icon} width={24} height={24} alt="" aria-hidden="true" />
            <span>{tab.label}</span>
            {tab.todo && <TodoTag row={tab.todo} />}
          </button>
        ))}
      </div>
    </nav>
  );
}

export type Tone = "success" | "warning" | "danger" | "neutral" | "selected";

interface StatusChipProps {
  tone: Tone;
  icon: string;
  label: string;
  /** What a screen reader says in place of the label, when the label alone is unclear. */
  spoken?: string;
}

/** Status chip: always icon + word, never color alone. The icon is decorative. */
export function StatusChip({ tone, icon, label, spoken }: StatusChipProps) {
  return (
    <span className={`status-chip status-chip-${tone} t-footnote-strong`}>
      <img src={icon} width={16} height={16} alt="" aria-hidden="true" />
      {spoken === undefined ? (
        label
      ) : (
        <>
          <span aria-hidden="true">{label}</span>
          <span className="visually-hidden">{spoken}</span>
        </>
      )}
    </span>
  );
}

export type BannerTone = "success" | "danger" | "info" | "neutral";

const BANNER_ICON: Partial<Record<BannerTone, string>> = {
  success: "/icons/check-success-24.svg",
  danger: "/icons/alert-danger-24.svg",
};

interface BannerProps {
  tone: BannerTone;
  /** A 24 px icon drawn in the tone's color; success and danger have their own. */
  icon?: string;
  title: string;
  children: ReactNode;
}

/**
 * Page-level status: always icon + title + message. Never blames the angler. Danger (NOT SENT)
 * is role=alert, announced at once; success (Received) is role=status; info and neutral are
 * states shown on open, so they announce nothing.
 */
export function Banner({ tone, icon, title, children }: BannerProps) {
  const role = tone === "danger" ? "alert" : tone === "success" ? "status" : undefined;
  return (
    <div className={`banner banner-${tone}`} role={role}>
      <img src={icon ?? BANNER_ICON[tone]} width={24} height={24} alt="" aria-hidden="true" />
      <div className="banner-body">
        <p className="banner-title t-headline">{title}</p>
        <p className="t-callout">{children}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  /** A 28 px icon in the badge. */
  icon: string;
  title: string;
  message: string;
  /** The next step, only when it's allowed (e.g. Submit only while submitting is open). */
  action?: ReactNode;
}

/** An empty list: says what will appear here. The icon is decorative. */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-badge">
        <img src={icon} width={28} height={28} alt="" aria-hidden="true" />
      </span>
      <h2 className="t-title-section">{title}</h2>
      <p className="t-callout t-secondary">{message}</p>
      {action}
    </div>
  );
}

interface SegmentedToggleProps<Id extends string> {
  /** The id of the visible label that names the group. */
  labelledBy: string;
  options: readonly { id: Id; label: string }[];
  selected: Id;
  onSelect: (id: Id) => void;
}

/** Two-option switch: a radio group, 44 px segments, tap only (no drag). */
export function SegmentedToggle<Id extends string>({ labelledBy, options, selected, onSelect }: SegmentedToggleProps<Id>) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="segmented">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === selected}
          className="segmented-option t-callout-strong"
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
