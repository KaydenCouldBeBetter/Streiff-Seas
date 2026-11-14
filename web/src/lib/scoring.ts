// Scoring (scoring.md v0.6.1, the only place the rules live): standings from verified catches.
// Pure, no imports, integers only: weights are weight_hoz (hundredths of an ounce), lengths are
// length_q (quarter inches), so a tie is never a rounding accident. The caller passes the
// event's metric; the two are never mixed in one total (§1). No DOM, no PocketBase.

export type Metric = "weight" | "length";
export type CatchStatus = "pending" | "verified" | "rejected" | "retracted";

/** The part of an entries row scoring reads. */
export interface ScoreEntry {
  id: string;
  withdrawn: boolean;
}

/** The part of a catches row scoring reads. */
export interface ScoreCatch {
  id: string;
  /** The entry's id. */
  entry: string;
  status: CatchStatus;
  weight_hoz?: number;
  length_q?: number;
}

export interface Standing {
  /** The entry's id. */
  entry: string;
  /** 1-based; tied entries share a place and the next place is skipped (1, 2, 2, 4). */
  place: number;
  /** Sum of the counted fish. */
  total: number;
  /** The counted fish (best 10 verified), biggest first. */
  counted: number[];
  /** The catch ids behind `counted`, in the same order. */
  countedIds: string[];
  /** The biggest counted fish, or null when nothing is verified yet. */
  biggest: number | null;
  /** Pending catches only: rejected and retracted ones are never shown (§1). */
  pending: number;
}

/** How many verified fish make up a score (§1). */
export const COUNTED_FISH = 10;

function valueOf(metric: Metric, c: ScoreCatch): number {
  const value = metric === "length" ? c.length_q : c.weight_hoz;
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`catch ${c.id}: ${metric === "length" ? "length_q" : "weight_hoz"} must be a whole number of at least 0, got ${String(value)}`);
  }
  return value;
}

/**
 * Compares two standings' counted fish biggest first (§8 steps 1 to 3): the bigger fish at the
 * first difference wins, and an angler with a fish where the other has none wins.
 * Negative when `a` ranks ahead.
 */
function compareFish(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    if (x !== y) return y - x;
  }
  return 0;
}

/**
 * The standings for one event. Only verified catches score, best 10 per entry (a new verified
 * fish that beats the smallest counted one culls it simply by being in the top 10). Withdrawn
 * entries are left out whole, so a self-rejoin (the flag cleared) brings their verified fish
 * back. An entry shows once it has a pending or verified catch (§9). Ties follow §8.
 */
export function computeStandings(metric: Metric, entries: ScoreEntry[], catches: ScoreCatch[]): Standing[] {
  const active = new Set(entries.filter((e) => !e.withdrawn).map((e) => e.id));
  const verified = new Map<string, { id: string; value: number }[]>();
  const pending = new Map<string, number>();

  for (const c of catches) {
    if (!active.has(c.entry)) continue;
    if (c.status === "pending") {
      valueOf(metric, c); // a bad value is a bug even while it can't score yet
      pending.set(c.entry, (pending.get(c.entry) ?? 0) + 1);
    } else if (c.status === "verified") {
      const list = verified.get(c.entry) ?? [];
      list.push({ id: c.id, value: valueOf(metric, c) });
      verified.set(c.entry, list);
    }
  }

  const rows: Standing[] = [];
  for (const id of active) {
    const fish = verified.get(id) ?? [];
    const waiting = pending.get(id) ?? 0;
    if (fish.length === 0 && waiting === 0) continue;
    // Biggest first; equal weights keep a stable order by catch id.
    const best = [...fish].sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1)).slice(0, COUNTED_FISH);
    const counted = best.map((f) => f.value);
    rows.push({
      entry: id,
      place: 0,
      total: counted.reduce((sum, v) => sum + v, 0),
      counted,
      countedIds: best.map((f) => f.id),
      biggest: counted[0] ?? null,
      pending: waiting,
    });
  }

  rows.sort((a, b) => b.total - a.total || compareFish(a.counted, b.counted) || (a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0));

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const tied = prev !== undefined && prev.total === row.total && compareFish(prev.counted, row.counted) === 0;
    row.place = tied ? prev.place : i + 1;
  });
  return rows;
}
