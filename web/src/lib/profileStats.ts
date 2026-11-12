// PRF-01c Profile stats (Figma 184:9982 and its views; a proposal, see docs/decisions.md): the
// member's own bests, charts, status counts and past results, computed from rows the app reads.
// Pure: no DOM, no PocketBase. It counts and groups; it does no scoring. Places and totals come
// in already worked out (scoring.ts over each final standings, S2a), and weights and lengths are
// shown through a `MeasureFormat` (display rounding belongs to scoring.ts, scoring.md section 4).
//
// Wiring: the member's own users record, entries and catches in every status (R-CAT-L-04,
// L-11, L-12; no new API rule) and the events they entered, once M0-03 opens those reads. Until
// then the screen runs on lib/sampleProfile.ts. Bests, charts and counted fish use verified
// catches only (SPEC invariant 1). All dates are club time (America/New_York).

import type { CatchStatus } from "./myCatches";
import { placeLabel, spokenPlace } from "./format";
import type { DisplayUnits } from "./profile";

export type StatsScope = "season" | "all";

export interface StatsEvent {
  id: string;
  name: string;
  /** events.starts_at: the season a tournament belongs to is this date's year in club time. */
  startsAt: Date;
  metric: "weight" | "length";
}

export interface StatsEntry {
  eventId: string;
  withdrawn: boolean;
}

export interface StatsCatch {
  id: string;
  eventId: string;
  /** The name as it is shown ("Largemouth"). */
  species: string;
  status: CatchStatus;
  /** The catch's entry is withdrawn: it is off the board, but still the member's catch. */
  entryWithdrawn: boolean;
  created: Date;
  /** captured_at, from the first photo; absent when the photo had no capture time. */
  capturedAt?: Date;
  /** Integers as stored: hundredths of an ounce, quarter inches. */
  weightHoz?: number;
  lengthQ?: number;
}

/** One final tournament the member fished: their place there, worked out by scoring.ts. */
export interface FinalResult {
  eventId: string;
  /** null when their entry is withdrawn: shown "Withdrawn" instead of a place. */
  place: number | null;
  tied: boolean;
  /** Entries that count on the board. */
  fieldSize: number;
  totalHoz?: number;
  totalQ?: number;
}

export interface JudgingRole {
  role: "Judge" | "Backup judge";
  eventName: string;
}

export interface ProfileStatsInput {
  events: readonly StatsEvent[];
  entries: readonly StatsEntry[];
  catches: readonly StatsCatch[];
  finals: readonly FinalResult[];
  /** Live or closed tournaments the member judges (events.judge, events.backup_judge). */
  judging: readonly JudgingRole[];
}

export interface Display {
  value: string;
  unit: string;
}

/** Weights in the viewer's units; lengths in inches, rounded down to the quarter. */
export interface MeasureFormat {
  weight(hoz: number, units: DisplayUnits): Display;
  length(quarters: number): Display;
}

// ---------------------------------------------------------------------------------------------
// Club time

const CLUB_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;
const WEEK_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

interface ClubParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  /** 0 is Sunday. */
  weekday: number;
}

function clubParts(at: Date): ClubParts {
  const part: Record<string, string> = {};
  for (const { type, value } of CLUB_PARTS.formatToParts(at)) part[type] = value;
  return {
    year: Number(part.year),
    month: Number(part.month),
    day: Number(part.day),
    hour: Number(part.hour) % 24,
    weekday: WEEKDAYS.indexOf(part.weekday ?? ""),
  };
}

/** The club-time year of a moment: the season of a tournament that starts then. */
export function clubYear(at: Date): number {
  return clubParts(at).year;
}

/**
 * The Sunday that starts the club-time week a moment falls in, as that calendar date at UTC
 * midnight. Weeks are counted in calendar days, so a daylight-saving change can't move one.
 */
export function weekStart(at: Date): number {
  const { year, month, day, weekday } = clubParts(at);
  return Date.UTC(year, month - 1, day - weekday);
}

/** "Jul 4" for a week start from weekStart(). */
export function weekLabel(startMs: number): string {
  return WEEK_LABEL.format(new Date(startMs));
}

export type TimeBucket = "Dawn" | "Morning" | "Midday" | "Afternoon" | "Evening";

export const TIME_BUCKETS: readonly TimeBucket[] = ["Dawn", "Morning", "Midday", "Afternoon", "Evening"];

/** Dawn before 7 AM, Morning 7 to 11, Midday 11 to 2, Afternoon 2 to 5, Evening from 5 PM. */
export function timeBucket(at: Date): TimeBucket {
  const { hour } = clubParts(at);
  if (hour < 7) return "Dawn";
  if (hour < 11) return "Morning";
  if (hour < 14) return "Midday";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/** "Sum 25": the first word cut to 3 letters unless it is 4 or fewer, then the two-digit club-time year. */
export function finishLabel(name: string, startsAt: Date): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const word = Array.from(first);
  const short = word.length <= 4 ? first : word.slice(0, 3).join("");
  return `${short} ${String(clubYear(startsAt) % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// The view model

export interface BestTile extends Display {
  species: string;
  eventName: string;
}

export interface TableRow {
  label: string;
  value: string;
}

interface ChartBase {
  title: string;
  subtitle: string;
  /** The one sentence a screen reader gets for the chart; the Table view has the same numbers. */
  summary: string;
  table: TableRow[];
  /** "None yet" or its own wording when there is nothing to draw. */
  empty: string | null;
}

export interface SpeciesChart extends ChartBase {
  bars: { label: string; count: number; /** 0 to 1 of the largest bar. */ share: number }[];
}

export interface WeeklyChart extends ChartBase {
  points: { label: string; count: number }[];
  /** Axis ticks from 0, e.g. 0, 2, 4. */
  ticks: number[];
}

export interface TimeOfDayChart extends ChartBase {
  columns: { label: TimeBucket; count: number }[];
  ticks: number[];
  note: string;
}

export interface FinishesChart extends ChartBase {
  points: { label: string; place: number; text: string }[];
  /** Places labelled on the axis, 1st first (the axis is inverted). */
  ticks: number[];
  note: string;
}

export interface StatusCounts {
  submitted: number;
  verified: number;
  pending: number;
  rejected: number;
  retracted: number;
  tournaments: number;
  /** Verified fish on an active entry: the ones that count toward a total. */
  counted: number;
}

export interface PastResult {
  eventId: string;
  title: string;
  /** "Final · 3rd of 12 · 158 1/4 in", or "Final · Withdrawn". */
  detail: string;
}

export interface ProfileStats {
  scopeLabel: string;
  heaviest: BestTile | null;
  longest: BestTile | null;
  species: SpeciesChart;
  weekly: WeeklyChart;
  timeOfDay: TimeOfDayChart;
  finishes: FinishesChart;
  counts: StatusCounts;
  /** Every final tournament the member fished, newest first, whatever the scope. */
  past: PastResult[];
}

export const NONE_YET = "None yet";

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Ticks from 0 in a whole step (1, 2, 5, 10 ...) with at most two intervals, e.g. max 3 gives 0, 2, 4. */
export function countTicks(max: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const step = steps.find((candidate) => Math.ceil(max / candidate) <= 2) ?? Math.ceil(max / 2);
  const top = Math.max(1, Math.ceil(max / step)) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return ticks;
}

/** Places labelled on the inverted axis: 1st, 3rd, 5th ... up to the last place plotted. */
export function placeTicks(lastPlace: number): number[] {
  const ticks = [1];
  while (ticks[ticks.length - 1]! < Math.max(lastPlace, 2)) ticks.push(ticks[ticks.length - 1]! + 2);
  return ticks;
}

export function computeStats(
  input: ProfileStatsInput,
  scope: StatsScope,
  season: number,
  units: DisplayUnits,
  format: MeasureFormat,
): ProfileStats {
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const inScope = (eventId: string): boolean => {
    const event = eventById.get(eventId);
    return event !== undefined && (scope === "all" || clubYear(event.startsAt) === season);
  };
  const scopeLabel = scope === "season" ? `Season ${season}` : "All time";

  const catches = input.catches.filter((c) => inScope(c.eventId));
  const verified = catches.filter((c) => c.status === "verified").sort((a, b) => a.created.getTime() - b.created.getTime());

  // Bests: the largest stored integer; the earlier catch wins a tie.
  const best = (measure: (c: StatsCatch) => number | undefined, show: (value: number) => Display): BestTile | null => {
    let top: StatsCatch | undefined;
    for (const c of verified) {
      const value = measure(c);
      if (value !== undefined && value > 0 && (top === undefined || value > (measure(top) ?? 0))) top = c;
    }
    if (top === undefined) return null;
    return { ...show(measure(top)!), species: top.species, eventName: eventById.get(top.eventId)?.name ?? "" };
  };
  const heaviest = best((c) => c.weightHoz, (hoz) => format.weight(hoz, units));
  const longest = best((c) => c.lengthQ, (q) => format.length(q));

  // Species: one bar per species, largest first, each starting at zero.
  const bySpecies = new Map<string, number>();
  for (const c of verified) bySpecies.set(c.species, (bySpecies.get(c.species) ?? 0) + 1);
  const bars = [...bySpecies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topCount = bars[0]?.[1] ?? 0;
  const species: SpeciesChart = {
    title: "Verified catches by species",
    subtitle: `${scopeLabel} · ${verified.length} fish`,
    bars: bars.map(([label, count]) => ({ label, count, share: count / topCount })),
    summary:
      bars.length === 0
        ? NONE_YET
        : bars.map(([label, count], i) => (i === 0 ? `${label} ${count} fish` : `${lowerFirst(label)} ${count}`)).join(", ") + ".",
    table: bars.map(([label, count]) => ({ label, value: `${count} fish` })),
    empty: bars.length === 0 ? NONE_YET : null,
  };

  // Weekly: by the week the photo was taken (the submit time when it had none), every week
  // between the first and last with fish, so a gap reads 0.
  const perWeek = new Map<number, number>();
  for (const c of verified) {
    const key = weekStart(c.capturedAt ?? c.created);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  const weekPoints: WeeklyChart["points"] = [];
  if (perWeek.size > 0) {
    const keys = [...perWeek.keys()];
    for (let key = Math.min(...keys); key <= Math.max(...keys); key += 7 * DAY_MS) {
      weekPoints.push({ label: weekLabel(key), count: perWeek.get(key) ?? 0 });
    }
  }
  const weekly: WeeklyChart = {
    title: "Fish verified each week",
    subtitle: `${scopeLabel} · by the week the photo was taken`,
    points: weekPoints,
    ticks: countTicks(Math.max(0, ...weekPoints.map((p) => p.count))),
    summary:
      weekPoints.length === 0
        ? NONE_YET
        : `Fish verified each week, from ${weekPoints[0]!.label} to ${weekPoints[weekPoints.length - 1]!.label}: ${weekPoints.map((p) => p.count).join(", ")}.`,
    table: weekPoints.map((p) => ({ label: `Week of ${p.label}`, value: `${p.count} fish` })),
    empty: weekPoints.length === 0 ? NONE_YET : null,
  };

  // Time of day: from the photo's capture time only; a catch without one is left out and the
  // subtitle says how many were counted. Capture time is a signal, not proof (invariant 9).
  const timed = verified.filter((c) => c.capturedAt !== undefined);
  const perBucket = new Map<TimeBucket, number>();
  for (const c of timed) perBucket.set(timeBucket(c.capturedAt!), (perBucket.get(timeBucket(c.capturedAt!)) ?? 0) + 1);
  const columns = TIME_BUCKETS.map((label) => ({ label, count: perBucket.get(label) ?? 0 }));
  const timeOfDay: TimeOfDayChart = {
    title: "When you catch them",
    subtitle: `${scopeLabel} · ${timed.length} of ${verified.length} fish had a photo time`,
    columns,
    ticks: countTicks(Math.max(0, ...columns.map((c) => c.count))),
    note: "From each photo's capture time, in club time. Dawn is before 7 AM, Evening after 5 PM.",
    summary: timed.length === 0 ? NONE_YET : columns.map((c, i) => `${i === 0 ? c.label : lowerFirst(c.label)} ${c.count}`).join(", ") + ".",
    table: columns.map((c) => ({ label: c.label, value: `${c.count} fish` })),
    empty: timed.length === 0 ? NONE_YET : null,
  };

  // Finishes: your own place in each final tournament in scope, oldest first, from the
  // standings scoring.ts worked out. Never another member's place, and no points (AOY).
  const finals = input.finals
    .map((result) => ({ result, event: eventById.get(result.eventId) }))
    .filter((row): row is { result: FinalResult; event: StatsEvent } => row.event !== undefined);
  const placed = finals
    .filter((row) => row.result.place !== null && inScope(row.event.id))
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
  const finishPoints = placed.map(({ result, event }) => ({
    label: finishLabel(event.name, event.startsAt),
    place: result.place!,
    text: placeLabel(result.place!, result.tied),
  }));
  const finishes: FinishesChart = {
    title: "Your finishes",
    subtitle:
      scope === "all"
        ? "All time · your place in each final tournament. Higher is better."
        : `${scopeLabel} · your place in each final tournament. Higher is better.`,
    points: finishPoints,
    ticks: placeTicks(Math.max(0, ...finishPoints.map((p) => p.place))),
    note: "Field size and total for each are in Past results.",
    summary:
      finishPoints.length === 0
        ? NONE_YET
        : "Finishes: " +
          placed.map(({ result, event }) => `${finishLabel(event.name, event.startsAt)} ${spokenPlace(result.place!, result.tied)}`).join(", ") +
          ".",
    table: placed.map(({ result, event }) => ({ label: event.name, value: placeLabel(result.place!, result.tied) })),
    empty: finishPoints.length === 0 ? (scope === "season" ? "No final results this season yet" : "No final results yet") : null,
  };

  // Status counts include catches on a withdrawn entry; the fish that count toward totals don't.
  const entered = new Set(input.entries.filter((entry) => inScope(entry.eventId)).map((entry) => entry.eventId));
  const count = (status: CatchStatus) => catches.filter((c) => c.status === status).length;
  const counts: StatusCounts = {
    submitted: catches.length,
    verified: count("verified"),
    pending: count("pending"),
    rejected: count("rejected"),
    retracted: count("retracted"),
    tournaments: entered.size,
    counted: catches.filter((c) => c.status === "verified" && !c.entryWithdrawn).length,
  };

  // Past results: one row per final tournament they fished, newest first, whatever the scope.
  const show = (result: FinalResult, event: StatsEvent): string => {
    if (event.metric === "weight" && result.totalHoz !== undefined) {
      const { value, unit } = format.weight(result.totalHoz, units);
      return `${value} ${unit}`;
    }
    if (result.totalQ !== undefined) {
      const { value, unit } = format.length(result.totalQ);
      return `${value} ${unit}`;
    }
    return "";
  };
  const past: PastResult[] = [...finals]
    .sort((a, b) => b.event.startsAt.getTime() - a.event.startsAt.getTime())
    .map(({ result, event }) => ({
      eventId: event.id,
      title: event.name,
      detail:
        result.place === null
          ? "Final · Withdrawn"
          : ["Final", `${placeLabel(result.place, result.tied)} of ${result.fieldSize}`, show(result, event)].filter((part) => part !== "").join(" · "),
    }));

  return { scopeLabel, heaviest, longest, species, weekly, timeOfDay, finishes, counts, past };
}

// ---------------------------------------------------------------------------------------------
// The chart chips

export type ChartId = "species" | "weekly" | "time" | "finishes";

/** One row of chips above the chart card; exactly one is selected (Figma Filter chip). */
export const CHART_CHIPS: readonly { id: ChartId; label: string }[] = [
  { id: "species", label: "Species" },
  { id: "weekly", label: "Weekly" },
  { id: "time", label: "Time of day" },
  { id: "finishes", label: "Finishes" },
];

/** A remembered chart choice read back from storage: anything unknown reads as Species. */
export function parseChartId(value: unknown): ChartId {
  return CHART_CHIPS.find((chip) => chip.id === value)?.id ?? "species";
}
