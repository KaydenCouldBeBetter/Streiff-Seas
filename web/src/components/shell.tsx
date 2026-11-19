// The signed-in frame on a wide window (Figma Desktop components, "Sidebar" and "Rail"; option A,
// chosen 13 Nov 2026): a sidebar from 1024 px, an icon rail from 600 px, and on a phone nothing here
// (each screen keeps its own bottom tab bar, and this navigation is hidden). "Submit a catch" is
// the first control in it, in the same place on every screen. Sidebar and rail are one <nav
// aria-label="Main"> that responsive.css resizes, so there is one set of controls to keep right.
// "Hide menu" takes it away so the page gets the whole width; a slim "Menu" button brings it back
// (decisions.md 2026-11-18). This browser remembers the choice (lib/navHidden.ts).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { readNavHidden, writeNavHidden } from "../lib/navHidden";
import { Icon } from "./ui";
import type { MemberTab } from "../screens/memberTabs";
import { useMemberTabs } from "../screens/MemberTabBar";

interface Props {
  /** The section the screen belongs to, or null when none is (Submit a catch). */
  tab: MemberTab | null;
  /** The signed-in member, for the line at the foot of the sidebar. */
  name: string;
  role: string;
  onTab: (tab: MemberTab) => void;
  onSubmit: () => void;
  /** Opens the club rules (RULES-01a). */
  onClubRules: () => void;
  children: ReactNode;
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function AppShell({ tab, name, role, onTab, onSubmit, onClubRules, children }: Props) {
  const content = useRef<HTMLDivElement>(null);
  const tabs = useMemberTabs();
  const [hidden, setHidden] = useState(() => readNavHidden(browserStorage()));
  // After a toggle, focus goes to the control that undoes it, so keyboard users aren't dropped.
  const toggled = useRef(false);
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toggled.current) return;
    (hidden ? showButton : hideButton).current?.focus();
  }, [hidden]);
  const toggle = (next: boolean) => {
    toggled.current = true;
    writeNavHidden(browserStorage(), next);
    setHidden(next);
  };
  return (
    <div className={`shell${hidden ? " shell-nav-hidden" : ""}`}>
      {/* The first control on the page: lets keyboard users skip the navigation (build note 2). */}
      <a
        className="skip-link"
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          content.current?.focus();
        }}
      >
        Skip to content
      </a>
      {hidden ? (
        <div className="nav-show-rail">
          <button ref={showButton} type="button" className="side-nav-item" aria-label="Show menu" aria-expanded="false" onClick={() => toggle(false)}>
            <Icon src="/icons/list.svg" size={24} />
            <span className="side-nav-label">Menu</span>
          </button>
        </div>
      ) : (
      <nav id="main-nav" className="side-nav" aria-label="Main">
        <div className="side-nav-brand">
          <p className="t-title-section">Streiff Seas</p>
          <p className="t-footnote t-secondary">Club scoreboard</p>
        </div>

        <button type="button" className="button button-primary button-large side-nav-submit" aria-label="Submit a catch" onClick={onSubmit}>
          <Icon src="/icons/plus-on-primary.svg" size={24} />
          <span className="side-nav-long">Submit a catch</span>
          <span className="side-nav-short" aria-hidden="true">
            Submit
          </span>
        </button>

        <ul className="side-nav-list">
          {tabs.map((item) => {
            const selected = item.id === tab;
            return (
              <li key={item.id}>
                <button type="button" className="side-nav-item" aria-current={selected ? "page" : undefined} onClick={() => onTab(item.id)}>
                  <Icon src={selected ? (item.selectedIcon ?? item.icon) : item.icon} size={24} />
                  <span className="side-nav-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="side-nav-foot">
          <button ref={hideButton} type="button" className="side-nav-item" aria-label="Hide menu" aria-expanded="true" onClick={() => toggle(true)}>
            <Icon src="/icons/chevron-left.svg" size={24} />
            <span className="side-nav-long">Hide menu</span>
            <span className="side-nav-short" aria-hidden="true">
              Hide
            </span>
          </button>
          <button type="button" className="side-nav-item" aria-label="Club rules" onClick={onClubRules}>
            <Icon src="/icons/info.svg" size={24} />
            <span className="side-nav-long">Club rules</span>
            <span className="side-nav-short" aria-hidden="true">
              Rules
            </span>
          </button>
          <div className="side-nav-user">
            <p className="t-callout-strong">{name}</p>
            <p className="t-footnote t-secondary">{role}</p>
          </div>
        </div>
      </nav>
      )}

      <div className="shell-content" id="content" ref={content} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
