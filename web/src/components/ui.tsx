// The Figma components the screens use: Brand, Nav bar (Push and Large title), Event status,
// Live badge, Text field, Button (Large, Medium and Text), Action bar (Single and Accessory),
// List link, Tab bar, Banner, Empty state, Status chip, Segmented toggle, Switch row, Locked field
// and Sheet. Their usage notes in Figma are followed here.

import { useEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { badgeText } from "../lib/liveTracker";
import { iconSrc } from "../lib/theme";
import { useTheme } from "../lib/themeStore";

/**
 * A decorative icon (the label next to it carries the meaning). Every icon goes through here
 * so Dark mode can swap in its Dark twin; an <img> can't take a CSS colour (lib/theme.ts).
 */
export function Icon({ src, size, className }: { src: string | undefined; size: number; className?: string }) {
  const theme = useTheme();
  if (src === undefined) return null;
  return <img className={className} src={iconSrc(src, theme)} width={size} height={size} alt="" aria-hidden="true" />;
}

/**
 * The icons a screen shows when the network is gone (NOT SENT banners, locked fields, failed
 * photo chips), fetched while it is still there. The browser keeps a loaded image for the rest of
 * the page's life, so they draw offline instead of as broken images. Both themes, since the
 * theme can change while offline.
 */
export const OFFLINE_ICONS: readonly string[] = [
  "/icons/alert-danger-24.svg",
  "/icons/lock-secondary.svg",
  "/icons/lock-secondary-24.svg",
  "/icons/close-danger.svg",
  "/icons/refresh-on-primary.svg",
  "/icons/refresh-link.svg",
  // The leaderboard's Reconnecting and Updated badges (LB-01b, LB-01c).
  "/icons/refresh-warning.svg",
  "/icons/clock-neutral.svg",
];

export function usePreloadedIcons(paths: readonly string[]): void {
  const held = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    held.current = paths.flatMap((path) =>
      (["light", "dark"] as const).map((theme) => {
        const image = new Image();
        image.src = iconSrc(path, theme);
        return image;
      }),
    );
  }, [paths]);
}

export function Brand() {
  return (
    <div className="brand">
      <p className="t-title-large">Streiff Seas</p>
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
        <Icon src="/icons/chevron-left.svg" size={24} />
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
        {error && <Icon src="/icons/alert.svg" size={18} />}
        <span>{error ?? help}</span>
      </p>
    </div>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  help: string;
  error?: string | null;
  value: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

/** A reason in words (JDG-03, JDG-04, JDG-05, ORG-09): the text field, two lines tall and growing. */
export function TextAreaField({ id, label, help, error, value, disabled = false, onValueChange }: TextAreaFieldProps) {
  const helpId = `${id}-help`;
  return (
    <div className="field">
      <label htmlFor={id} className="t-callout-strong">
        {label}
      </label>
      <textarea
        id={id}
        className="field-input field-textarea"
        rows={2}
        value={value}
        disabled={disabled}
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

interface ButtonProps {
  children: ReactNode;
  /** Destructive: withdraw, retract, reject, always behind a confirm sheet (Figma Button notes). */
  variant: "primary" | "secondary" | "text" | "destructive";
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
  const spinner = variant === "primary" || variant === "destructive" ? "/icons/refresh-on-primary.svg" : "/icons/refresh-link.svg";
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
      {loading && <Icon className="spin" src={spinner} size={24} />}
      {!loading && icon && <Icon src={icon} size={24} />}
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

export type EventStatusValue = "draft" | "live" | "closed" | "final";

/** Figma Event status (117:531): a filled square-cornered tag with an icon and the word. */
const EVENT_STATUS: Record<EventStatusValue, { label: string; icon: string }> = {
  draft: { label: "Draft", icon: "/icons/edit-neutral.svg" },
  live: { label: "Live", icon: "/icons/clock-success.svg" },
  closed: { label: "Closed", icon: "/icons/judge-warning.svg" },
  final: { label: "Final", icon: "/icons/lock-neutral-16.svg" },
};

/** events.status in the large title's badge slot. Not a control. */
export function EventStatus({ status }: { status: EventStatusValue }) {
  const { label, icon } = EVENT_STATUS[status];
  return (
    <span className={`event-status event-status-${status} t-footnote-strong`}>
      <Icon src={icon} size={16} />
      <span className="visually-hidden">Status: </span>
      {label}
    </span>
  );
}

export type LiveBadgeState = { kind: "live" } | { kind: "reconnecting" } | { kind: "updated"; atMs: number };

/** Figma Live badge (22:64): the icon and words for each state. */
function liveBadgeParts(state: LiveBadgeState): { icon: string; size: number; text: string; spoken: string } {
  switch (state.kind) {
    case "live":
      return { icon: "/icons/live-dot.svg", size: 10, text: "Live", spoken: "Live" };
    case "reconnecting":
      return { icon: "/icons/refresh-warning.svg", size: 16, text: "Reconnecting…", spoken: "reconnecting" };
    case "updated": {
      // "Updated 9:05 AM" in club time, from the server's clock (liveTracker.badgeText).
      const text = badgeText(state);
      return { icon: "/icons/clock-neutral.svg", size: 16, text, spoken: text.charAt(0).toLowerCase() + text.slice(1) };
    }
  }
}

/**
 * Leaderboard freshness, not events.status: an outlined pill, never the Event status tag.
 * Live (stream healthy), Reconnecting… (stream lost, last standings kept: LB-01b) or Updated h:mm
 * (polling after 150 s of silence: LB-01c). A polite live region, so a change is announced
 * ("Leaderboard reconnecting").
 */
export function LiveBadge({ state }: { state: LiveBadgeState }) {
  const { icon, size, text, spoken } = liveBadgeParts(state);
  return (
    <span className={`live-badge live-badge-${state.kind} t-footnote-strong`} role="status">
      <Icon src={icon} size={size} />
      <span className="visually-hidden">Leaderboard {spoken}</span>
      <span aria-hidden="true">{text}</span>
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
      <Icon src={icon} size={24} />
      <span className="list-link-text">
        <span className="t-headline">{title}</span>
        <span className="t-footnote t-secondary">{detail}</span>
      </span>
      <Icon src="/icons/chevron-right.svg" size={24} />
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
            <Icon src={tab.id === selected ? (tab.selectedIcon ?? tab.icon) : tab.icon} size={24} />
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
      <Icon src={icon} size={16} />
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

export type BannerTone = "success" | "danger" | "warning" | "info" | "neutral";

const BANNER_ICON: Partial<Record<BannerTone, string>> = {
  success: "/icons/check-success-24.svg",
  danger: "/icons/alert-danger-24.svg",
  // A deadline (EVT-02e, MY-04c).
  warning: "/icons/clock-warning-24.svg",
  info: "/icons/info-link.svg",
};

interface BannerProps {
  tone: BannerTone;
  /** A 24 px icon drawn in the tone's color; success, danger, warning and info have their own. */
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
      <Icon src={icon ?? BANNER_ICON[tone]} size={24} />
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
        <Icon src={icon} size={28} />
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
  /** Locked while a change is being sent or waits on Retry (decisions.md 2026-10-05). */
  disabled?: boolean;
  onSelect: (id: Id) => void;
}

/** Two-option switch: a radio group, 44 px segments, tap only (no drag). */
export function SegmentedToggle<Id extends string>({ labelledBy, options, selected, disabled = false, onSelect }: SegmentedToggleProps<Id>) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="segmented">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === selected}
          disabled={disabled}
          className="segmented-option t-callout-strong"
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  /** The line under the label; it is the switch's spoken hint. */
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * An on/off setting as one 56 px row; the whole row is the target (Figma Switch row).
 * On = primary track, knob right. Off = an edged track, knob left, so the state never rests on
 * colour alone. VoiceOver: "Dark mode, switch button, on", the detail line as the hint.
 */
export function SwitchRow({ id, label, detail, checked, disabled = false, onChange }: SwitchRowProps) {
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      disabled={disabled}
      className="switch-row"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-row-text">
        <span id={labelId} className="switch-row-label t-body">
          {label}
        </span>
        <span id={detailId} className="switch-row-detail t-footnote">
          {detail}
        </span>
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}

/**
 * A field that can't be changed in this state, shown rather than hidden: sunken fill, a lock and
 * a one-line reason (Figma Locked field). Not a control: no focus, no tap; the lock is decorative.
 */
export function LockedField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="locked-field">
      <div className="locked-field-text">
        <p className="t-footnote-strong t-secondary">{label}</p>
        <p className="t-body">{value}</p>
        {note && <p className="t-footnote t-secondary">{note}</p>}
      </div>
      <Icon src="/icons/lock-secondary-24.svg" size={24} />
    </div>
  );
}

interface SheetProps {
  /** The header's title, and the dialog's accessible name. */
  title: string;
  /** Cancel in the header, Escape and a tap on the backdrop. Absent while a request is in flight. */
  onCancel?: () => void;
  children: ReactNode;
  /** The sheet's one action (Figma: a 56 px button); none on a picker, where choosing closes it. */
  footer?: ReactNode;
}

/**
 * A bottom sheet over the screen (Figma Sheet: MY-05a, MY-05c): grabber, a header with Cancel,
 * the content, then the action, above the home-indicator inset. A modal dialog: focus moves
 * into it and goes back to where it was when it closes.
 */
export function Sheet({ title, onCancel, children, footer }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" aria-hidden="true" onClick={onCancel} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-header">
          {onCancel ? (
            <button type="button" className="button button-text sheet-cancel" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <span className="sheet-cancel" aria-hidden="true" />
          )}
          <h2 id="sheet-title" className="t-headline">
            {title}
          </h2>
          <span className="sheet-cancel" aria-hidden="true" />
        </div>
        <div className="sheet-content">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

interface OverlayProps {
  /** dialog: centered (Figma Desktop JDG-03a, JDG-05a, ORG-09a); panel: from the right edge (JDG-04a). */
  kind: "dialog" | "panel";
  title: string;
  /** The close button, Escape and a click on the backdrop. Absent while a request is in flight. */
  onClose?: () => void;
  children: ReactNode;
  /** Cancel and the action, right-aligned. */
  footer?: ReactNode;
}

/**
 * A modal dialog or side panel on a wide window, where a phone uses a Sheet or a page of its own.
 * Focus moves into it and goes back to where it was when it closes, as Sheet does.
 */
export function Overlay({ kind, title, onClose, children, footer }: OverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("textarea, input, button:not([disabled])")?.focus();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`overlay-layer overlay-${kind}`}>
      <div className="sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="overlay" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
        <div className="overlay-header">
          <h2 id="overlay-title" className="t-title-section">
            {title}
          </h2>
          {onClose && (
            <button type="button" className="overlay-close" aria-label="Close" onClick={onClose}>
              <Icon src="/icons/close.svg" size={24} />
            </button>
          )}
        </div>
        <div className="overlay-content">{children}</div>
        {footer && <div className="overlay-footer">{footer}</div>}
      </div>
    </div>
  );
}
