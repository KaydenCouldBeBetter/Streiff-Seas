import { describe, expect, it } from "vitest";
import { computeStandings, type CatchStatus, type ScoreCatch, type ScoreEntry, type Standing } from "../web/src/lib/scoring";

// Fixtures are scoring.md section 11, written as the scale reads (decimal pounds) and stored the
// way the app stores them: 1 lb = 1,600 hundredths of an ounce (invariant 1).
const hoz = (lb: number) => Math.round(lb * 1600);
const lb = (standing: Standing) => standing.total / 1600;

let seq = 0;
function fish(entry: string, pounds: number[], status: CatchStatus = "verified"): ScoreCatch[] {
  return pounds.map((p) => ({ id: `c${++seq}`, entry, status, weight_hoz: hoz(p) }));
}
const entry = (id: string, withdrawn = false): ScoreEntry => ({ id, withdrawn });
function at<T>(list: T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`no item at ${i}`);
  return item;
}
const one = (rows: Standing[]): Standing => at(rows, 0);
const standingOf = (rows: Standing[], id: string) => rows.find((r) => r.entry === id)!;

const A12 = [2.1, 3.45, 1.2, 4.02, 2.88, 1.75, 3.1, 2.4, 0.95, 1.6, 2.05, 3.8];

describe("scoring.md examples 1 to 4: best 10, culls and pending", () => {
  it("1: A's 12 fish count the best 10, total 27.15 lb", () => {
    const a = one(computeStandings("weight", [entry("A")], fish("A", A12)));
    expect(a.counted).toEqual([4.02, 3.8, 3.45, 3.1, 2.88, 2.4, 2.1, 2.05, 1.75, 1.6].map(hoz));
    expect(a.total).toBe(43440);
    expect(lb(a)).toBe(27.15);
    expect(a.biggest).toBe(hoz(4.02));
  });

  it("2: a 13th fish of 2.50 culls the 1.60, total 28.05", () => {
    const a = one(computeStandings("weight", [entry("A")], fish("A", [...A12, 2.5])));
    expect(a.counted).not.toContain(hoz(1.6));
    expect(a.counted).toContain(hoz(2.5));
    expect(lb(a)).toBe(28.05);
  });

  it("3: a pending 6.00 adds nothing and shows as 1 pending; verified it culls the 1.75, total 32.30", () => {
    const base = fish("A", [...A12, 2.5]);
    const six = fish("A", [6.0], "pending");
    const waiting = one(computeStandings("weight", [entry("A")], [...base, ...six]));
    expect(lb(waiting)).toBe(28.05);
    expect(waiting.pending).toBe(1);

    const done = one(computeStandings("weight", [entry("A")], [...base, { ...at(six, 0), status: "verified" }]));
    expect(lb(done)).toBe(32.3);
    expect(done.pending).toBe(0);
    expect(done.counted).not.toContain(hoz(1.75));
  });

  it("4: B has 4 fish and scores all of them, 16.05, with no penalty", () => {
    const b = one(computeStandings("weight", [entry("B")], fish("B", [5.1, 4.8, 3.95, 2.2])));
    expect(b.counted).toHaveLength(4);
    expect(lb(b)).toBe(16.05);
  });
});

describe("scoring.md examples 8 to 11: ties and shared places", () => {
  it("8: equal totals, the bigger biggest fish ranks ahead (C 4.50 over D 4.20)", () => {
    const rows = computeStandings(
      "weight",
      [entry("D"), entry("C")],
      [...fish("C", [4.5, 4.0, 3.5, 3.0, 2.5, 2.5]), ...fish("D", [4.2, 4.2, 3.8, 3.3, 2.5, 2.0])],
    );
    expect(lb(at(rows, 0))).toBe(20);
    expect(lb(at(rows, 1))).toBe(20);
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["C", 1], ["D", 2]]);
  });

  it("9: equal biggest fish, the second biggest decides (F 4.10 over E 3.90)", () => {
    const rows = computeStandings("weight", [entry("E"), entry("F")], [...fish("E", [4.5, 3.9, 3.6]), ...fish("F", [4.5, 4.1, 3.4])]);
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["F", 1], ["E", 2]]);
  });

  it("10: a fish where the other angler has none wins (G over H, though H has more fish)", () => {
    const rows = computeStandings("weight", [entry("H"), entry("G")], [...fish("G", [5, 4, 3]), ...fish("H", [5, 4, 2, 1])]);
    expect(lb(at(rows, 0))).toBe(12);
    expect(lb(at(rows, 1))).toBe(12);
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["G", 1], ["H", 2]]);
  });

  it("11: K 1st, I and J share 2nd, L 4th", () => {
    const rows = computeStandings(
      "weight",
      [entry("L"), entry("J"), entry("I"), entry("K")],
      [...fish("K", [9]), ...fish("I", [3, 2]), ...fish("J", [2, 3]), ...fish("L", [4])],
    );
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["K", 1], ["I", 2], ["J", 2], ["L", 4]]);
  });
});

describe("scoring.md example 19: withdrawn entries", () => {
  const catches = [...fish("Q", [15.2]), ...fish("P", [12.4]), ...fish("P", [3.0], "pending"), ...fish("R", [9.8])];

  it("P withdraws and is left out whole, pending catch included: Q 1st, R 2nd", () => {
    const rows = computeStandings("weight", [entry("Q"), entry("P", true), entry("R")], catches);
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["Q", 1], ["R", 2]]);
  });

  it("P rejoins and the verified fish count again", () => {
    const rows = computeStandings("weight", [entry("Q"), entry("P", false), entry("R")], catches);
    expect(rows.map((r) => [r.entry, r.place])).toEqual([["Q", 1], ["P", 2], ["R", 3]]);
    expect(lb(standingOf(rows, "P"))).toBe(12.4);
    expect(standingOf(rows, "P").pending).toBe(1);
  });

  it("catches on an entry that isn't in the list are ignored", () => {
    expect(computeStandings("weight", [entry("Q")], [...fish("Q", [1]), ...fish("ghost", [9])])).toHaveLength(1);
  });
});

describe("scoring.md example 20: rejected and retracted", () => {
  it("never score and aren't counted as pending; only the new catch is pending", () => {
    const catches = [...fish("A", [3.9], "retracted"), ...fish("A", [4.4], "rejected"), ...fish("A", [3.9], "pending")];
    const a = one(computeStandings("weight", [entry("A")], catches));
    expect(a.total).toBe(0);
    expect(a.pending).toBe(1);
  });

  it("an angler with only rejected or retracted catches doesn't appear", () => {
    const catches = [...fish("A", [3.9], "retracted"), ...fish("A", [4.4], "rejected")];
    expect(computeStandings("weight", [entry("A")], catches)).toEqual([]);
  });
});

describe("scoring.md example 21: a judge's correction re-culls", () => {
  it("2.05 corrected to 1.05 drops out and the 1.60 comes back: 28.05 becomes 27.60", () => {
    const catches = fish("A", [...A12, 2.5]);
    const before = one(computeStandings("weight", [entry("A")], catches));
    expect(lb(before)).toBe(28.05);

    const target = catches.find((c) => c.weight_hoz === hoz(2.05))!;
    const corrected = catches.map((c) => (c.id === target.id ? { ...c, weight_hoz: hoz(1.05) } : c));
    const after = one(computeStandings("weight", [entry("A")], corrected));
    expect(after.counted).toEqual([4.02, 3.8, 3.45, 3.1, 2.88, 2.5, 2.4, 2.1, 1.75, 1.6].map(hoz));
    expect(lb(after)).toBe(27.6);
  });
});

describe("other rules", () => {
  it("a length tournament scores length_q (example 6 stores 70 and 59)", () => {
    const catches: ScoreCatch[] = [
      { id: "l1", entry: "A", status: "verified", length_q: 70, weight_hoz: 9999 },
      { id: "l2", entry: "A", status: "verified", length_q: 59 },
    ];
    const a = one(computeStandings("length", [entry("A")], catches));
    expect(a.total).toBe(129); // weight_hoz is ignored in a length event
    expect(a.biggest).toBe(70);
  });

  it("an angler with only a pending catch appears with total 0, biggest null and shares the place", () => {
    const rows = computeStandings("weight", [entry("A"), entry("B"), entry("C")], [...fish("A", [2]), ...fish("B", [1], "pending"), ...fish("C", [1], "pending")]);
    expect(rows.map((r) => [r.entry, r.place, r.total, r.biggest])).toEqual([["A", 1, hoz(2), hoz(2)], ["B", 2, 0, null], ["C", 2, 0, null]]);
  });

  it("an entry with no catches doesn't appear", () => {
    expect(computeStandings("weight", [entry("A")], [])).toEqual([]);
  });

  it("equal catches of equal weight keep a stable order, whatever order they arrive in", () => {
    const catches = [...fish("A", [2, 2, 2])];
    const forward = one(computeStandings("weight", [entry("A")], catches));
    const backward = one(computeStandings("weight", [entry("A")], [...catches].reverse()));
    expect(backward.countedIds).toEqual(forward.countedIds);
  });

  it("a weight that isn't a whole number, or is negative, throws", () => {
    const bad = (value: number) => () => computeStandings("weight", [entry("A")], [{ id: "x", entry: "A", status: "verified", weight_hoz: value }]);
    expect(bad(5500.5)).toThrow(RangeError);
    expect(bad(-1)).toThrow(RangeError);
    expect(() => computeStandings("weight", [entry("A")], [{ id: "x", entry: "A", status: "pending" }])).toThrow(RangeError);
  });

  it("does not change its inputs", () => {
    const catches = fish("A", A12);
    const copy = JSON.stringify(catches);
    computeStandings("weight", [entry("A")], catches);
    expect(JSON.stringify(catches)).toBe(copy);
  });
});
