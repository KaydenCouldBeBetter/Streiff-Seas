// The signed-in frame on a wide window (Figma Desktop components, "Sidebar" and "Rail"; option A,
// chosen 13 Nov 2026): a sidebar from 1024 px, an icon rail from 600 px, and on a phone nothing here
// (each screen keeps its own bottom tab bar, and this navigation is hidden). "Submit a catch" is
// the first control in it, in the same place on every screen. Sidebar and rail are one <nav
// aria-label="Main"> that responsive.css resizes, so there is one set of controls to keep right.

import { useRef, type ReactNode } from "react";
import { Icon, TodoTag } from "./ui";
import { MEMBER_TABS, type MemberTab } from "../screens/memberTabs";

interface Props {
  /** The section the screen belongs to, or null when none is (Submit a catch). */
  tab: MemberTab | null;
  /** The signed-in member, for the line at the foot of the sidebar. */
  name: string;
  role: string;
  onTab: (tab: MemberTab) => void;
  onSubmit: () => void;
  children: ReactNode;
}

export function AppShell({ tab, name, role, onTab, onSubmit, children }: Props) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <div className="shell">
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
      <nav className="side-nav" aria-label="Main">
        <div className="side-nav-brand">
          <p className="t-title-section">Chromie Fishing</p>
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
          {MEMBER_TABS.map((item) => {
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
          {/* TODO RULES-01a: the club rules page isn't built; it opens from here once it is. */}
          <button type="button" className="side-nav-item" aria-label="Club rules">
            <Icon src="/icons/info.svg" size={24} />
            <span className="side-nav-long">Club rules</span>
            <span className="side-nav-short" aria-hidden="true">
              Rules
            </span>
            <TodoTag row="RULES-01a" />
          </button>
          <div className="side-nav-user">
            <p className="t-callout-strong">{name}</p>
            <p className="t-footnote t-secondary">{role}</p>
          </div>
        </div>
      </nav>

      <div className="shell-content" id="content" ref={content} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
