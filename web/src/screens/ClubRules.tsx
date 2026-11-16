// RULES-01a Club rules (Figma 120:9278, and 120:9358 scrolled): read only, worded from the
// scoring.md version in force (lib/clubRules.ts). Opened from a tournament page it ends with
// "This tournament" (Gap 37); from anywhere else, club-wide rules only. The tab bar keeps the tab
// it was opened from.

import { CLUB_RULES, RULES_IN_FORCE, RULES_VERSION, type Fact } from "../lib/clubRules";
import { NavBar, TabBar } from "../components/ui";
import { MEMBER_TABS, type MemberTab } from "./memberTabs";

interface Props {
  /** Where Back goes: the screen it was opened from. */
  back: { label: string; name: string };
  /** Section 6, only when opened from a tournament page. */
  tournament: Fact[] | null;
  tab: MemberTab;
  onBack: () => void;
  onTab: (tab: MemberTab) => void;
}

export function ClubRules({ back, tournament, tab, onBack, onTab }: Props) {
  return (
    <div className="screen tab-screen">
      <NavBar title="Club rules" backLabel={back.label} backName={back.name} onBack={onBack} />
      <div className="screen-content club-rules">
        <p className="t-footnote t-secondary">
          Rules v{RULES_VERSION} · in force since {RULES_IN_FORCE}
        </p>
        {CLUB_RULES.map((section, index) => (
          <section key={section.title} className="club-rules-section" aria-labelledby={`club-rules-${index + 1}`}>
            <h2 id={`club-rules-${index + 1}`} className="t-title-section">
              {index + 1}&nbsp;&nbsp;{section.title}
            </h2>
            <ul className="club-rules-items t-callout">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        {tournament && (
          <section className="club-rules-section" aria-labelledby="club-rules-tournament">
            <h2 id="club-rules-tournament" className="t-title-section">
              {CLUB_RULES.length + 1}&nbsp;&nbsp;This tournament
            </h2>
            <dl className="card card-sunken t-callout">
              {tournament.map((fact) => (
                <div key={fact.label} className="fact">
                  <dt className="t-secondary">{fact.label}</dt>
                  <dd className="t-callout-strong">
                    {fact.value}
                    {fact.note && <span className="club-rules-note t-footnote t-secondary">{fact.note}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <div className="tab-screen-bottom">
        <TabBar tabs={MEMBER_TABS} selected={tab} onSelect={onTab} />
      </div>
    </div>
  );
}
