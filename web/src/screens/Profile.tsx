// PRF-01 Profile (Figma 65:3561 PRF-01a, 104:8318 PRF-01b, 184:9982 PRF-01c and its views):
// who you are, your stats, your past results, your settings and your account, on a tab screen.
//
// Settings are real: the name and display units save to PocketBase (R-USR-U-01, U-06, U-07), the
// name follows to the member's entries on the server. The stats are read from PocketBase by
// lib/loadProfileStats.ts (the member's own entries and catches; each final's place by scoring.ts).
// Appearance (PRF-01g, Figma "Dark mode" section): a Dark mode switch that applies at once and is
// remembered on this phone only (lib/theme.ts); it is not part of Save.
// Not live (Gap 25): the stats refresh when the screen opens and on focus. While the first read
// is out the stats say "Loading…"; a failed first read offers Try again, a failed refresh keeps
// what was shown under "Not up to date" (the Tournaments list's states; decisions.md 2026-11-18).
//
// A save that gets no reply shows NOT SENT with Retry and keeps the fields locked
// (decisions.md 2026-10-05 "No reply on any change"); no Figma frame draws it, so it reuses the
// SUB-02c banner (proposed as PRF-01d in docs/decisions.md).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordModel } from "pocketbase";
import { BestTile, IdentityCard, StatusCountsCard } from "../components/profile";
import { StatsChart, readChart } from "../components/statsChart";
import { Banner, Button, LargeNavBar, ListLink, SegmentedToggle, SwitchRow, TextField } from "../components/ui";
import {
  PROFILE_COPY,
  UNIT_OPTIONS,
  draftNameError,
  hasChanges,
  profileChanges,
  roleLabel,
  savedNotice,
  savedProfile,
  unitsOf,
  type ProfileChanges,
  type ProfileDraft,
  type SaveOutcome,
} from "../lib/profile";
import { PROFILE_FORMAT, type ProfileStatsData } from "../lib/loadProfileStats";
import { computeStats, type ChartId, type StatsScope } from "../lib/profileStats";
import { APPEARANCE_COPY } from "../lib/theme";
import { setTheme, useTheme } from "../lib/themeStore";
import type { MemberTab } from "./memberTabs";
import { MemberTabBar } from "./MemberTabBar";

interface Props {
  user: RecordModel;
  /** Reads the stats (lib/loadProfileStats.ts); called on open, on focus and on Try again. */
  loadStats: () => Promise<ProfileStatsData>;
  onSave: (changes: ProfileChanges) => Promise<SaveOutcome>;
  onRetry: (changes: ProfileChanges) => Promise<SaveOutcome>;
  /** The saved record, so the whole app shows the new name and units. */
  onUserChange: (user: RecordModel) => void;
  onTab: (tab: MemberTab) => void;
  onSignOut: () => void;
  /** RULES-01a, club-wide only. */
  onClubRules: () => void;
}

type Notice = { kind: "saved"; title: string; message: string } | { kind: "not-sent"; changes: ProfileChanges };

export function Profile({ user, loadStats, onSave, onRetry, onUserChange, onTab, onSignOut, onClubRules }: Props) {
  const [data, setData] = useState<ProfileStatsData | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    try {
      setData(await loadStats());
      setFailed(false);
    } catch {
      // A failed refresh keeps the stats already shown.
      setFailed(true);
    }
  }, [loadStats]);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  const saved = useMemo(() => savedProfile(user), [user]);
  const [draft, setDraft] = useState<ProfileDraft>(saved);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [scope, setScope] = useState<StatsScope>("season");
  const [chart, setChart] = useState<ChartId>(readChart);
  const theme = useTheme();

  const units = unitsOf(user);
  const stats = useMemo(() => (data ? computeStats(data.input, scope, data.season, units, PROFILE_FORMAT) : null), [data, scope, units]);
  const changes = profileChanges(saved, draft);
  const dirty = hasChanges(changes);
  const locked = sending || notice?.kind === "not-sent";
  const roles = [...(user.role === "organizer" ? [roleLabel(user.role)] : []), ...(data?.input.judging ?? []).map((j) => `${j.role} · ${j.eventName}`)];
  const unread = failed ? "Couldn't load this. Check your signal and try again." : "Loading…";

  async function send(run: () => Promise<SaveOutcome>, sent: ProfileChanges) {
    setSending(true);
    setNotice(null);
    const outcome = await run();
    setSending(false);
    if (outcome.kind === "saved") {
      onUserChange(outcome.user);
      setDraft(savedProfile(outcome.user));
      setNameProblem(null);
      setNotice({ kind: "saved", ...savedNotice(sent, unitsOf(outcome.user)) });
    } else if (outcome.kind === "name-refused") {
      setNameProblem(PROFILE_COPY.nameRefused);
    } else {
      setNotice({ kind: "not-sent", changes: sent });
    }
  }

  function save() {
    const problem = draftNameError(draft.name);
    setNameProblem(problem);
    if (problem !== null || !dirty) return;
    void send(() => onSave(changes), changes);
  }

  return (
    <div className="screen tab-screen">
      <LargeNavBar title="Profile" />
      <div className="screen-content profile">
        <IdentityCard name={saved.name} roles={roles} />

        <section className="profile-section profile-section-stats" aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="t-title-section">
            Your stats
          </h2>
          {failed && data && (
            <Banner tone="warning" title="Not up to date">
              Couldn't refresh your stats. They show what was there before.
            </Banner>
          )}
          {!stats || !data ? (
            <>
              <p className="t-body t-secondary">{unread}</p>
              {failed && (
                <Button variant="secondary" onClick={() => void read()}>
                  Try again
                </Button>
              )}
            </>
          ) : (
            <>
              <SegmentedToggle
                labelledBy="stats-heading"
                options={[
                  { id: "season", label: `Season ${data.season}` },
                  { id: "all", label: "All time" },
                ]}
                selected={scope}
                onSelect={setScope}
              />
              <div className="best-tiles">
                <BestTile label="Heaviest fish" tile={stats.heaviest} />
                <BestTile label="Longest fish" tile={stats.longest} />
              </div>
              <StatsChart stats={stats} chart={chart} onChart={setChart} />
              <StatusCountsCard counts={stats.counts} />
              <p className="t-footnote t-secondary">Bests, charts and counted fish use verified catches only.</p>
            </>
          )}
        </section>

        <section className="profile-section profile-section-tight" aria-labelledby="past-heading">
          <h2 id="past-heading" className="t-title-section">
            Past results
          </h2>
          <p className="t-footnote t-secondary">Every final tournament you fished, newest first.</p>
          {!stats ? (
            <p className="t-callout t-secondary">{unread}</p>
          ) : stats.past.length === 0 ? (
            <p className="t-callout t-secondary">None yet</p>
          ) : (
            <div className="list-links">
              {stats.past.map((result) => (
                <ListLink key={result.eventId} icon="/icons/leaderboard.svg" title={result.title} detail={result.detail} todo="LB-01g" />
              ))}
            </div>
          )}
        </section>

        <section className="profile-section" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="t-title-section">
            Settings
          </h2>
          {notice?.kind === "saved" && (
            <Banner tone="success" title={notice.title}>
              {notice.message}
            </Banner>
          )}
          {notice?.kind === "not-sent" && (
            <>
              <Banner tone="danger" title={PROFILE_COPY.notSentTitle}>
                {PROFILE_COPY.notSentMessage}
              </Banner>
              <Button variant="secondary" full onClick={() => void send(() => onRetry(notice.changes), notice.changes)}>
                Retry
              </Button>
            </>
          )}
          <TextField
            id="profile-name"
            label="Your name"
            help={PROFILE_COPY.nameHelp}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={100}
            disabled={locked}
            value={draft.name}
            error={nameProblem}
            onValueChange={(name) => {
              setDraft((current) => ({ ...current, name }));
              if (nameProblem) setNameProblem(null);
            }}
            onBlur={() => setNameProblem(draftNameError(draft.name))}
          />
          <div className="profile-units">
            <p id="units-label" className="t-headline">
              Show weights as
            </p>
            <SegmentedToggle
              labelledBy="units-label"
              options={UNIT_OPTIONS}
              selected={draft.units}
              disabled={locked}
              onSelect={(units) => setDraft((current) => ({ ...current, units }))}
            />
            <p className="t-footnote t-secondary">{PROFILE_COPY.unitsHelp}</p>
          </div>
          <Button variant="primary" full loading={sending} loadingLabel="Saving…" disabled={!dirty || locked} onClick={save}>
            Save changes
          </Button>
          {!dirty && notice?.kind !== "saved" && <p className="t-footnote t-secondary">{PROFILE_COPY.nothingToSave}</p>}
        </section>

        <section className="profile-section" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="t-title-section">
            Appearance
          </h2>
          <SwitchRow
            id="dark-mode"
            label={APPEARANCE_COPY.label}
            detail={APPEARANCE_COPY.detail}
            checked={theme === "dark"}
            onChange={(on) => setTheme(on ? "dark" : "light")}
          />
        </section>

        <section className="profile-section" aria-labelledby="account-heading">
          <h2 id="account-heading" className="t-title-section">
            Account
          </h2>
          <dl className="card card-sunken t-callout">
            <div className="fact">
              <dt className="t-secondary">Signed in as</dt>
              <dd className="t-callout-strong">{String(user.email)}</dd>
            </div>
            <div className="fact">
              <dt className="t-secondary">Role</dt>
              <dd className="t-callout-strong">{roleLabel(user.role)}</dd>
            </div>
          </dl>
          <p className="t-footnote t-secondary">Only the club admin can change your email or role.</p>
          <Button variant="text" onClick={onClubRules}>
            Club rules
          </Button>
          <Button variant="secondary" full onClick={onSignOut}>
            Sign out
          </Button>
        </section>
      </div>

      <div className="tab-screen-bottom">
        <MemberTabBar selected="profile" onSelect={onTab} />
      </div>
    </div>
  );
}
