import { describe, expect, it } from "vitest";
import { EMPTY_WEIGHT, enteredWeightText, parseWeight, switchWeightFormat, weightProblemCopy, type WeightEntry } from "../web/src/lib/weightEntry";

const decimal = (pounds: string): WeightEntry => ({ ...EMPTY_WEIGHT, format: "lb", pounds });
const lbOz = (wholePounds: string, ounces: string): WeightEntry => ({ ...EMPTY_WEIGHT, format: "lb_oz", wholePounds, ounces });

describe("parseWeight: decimal pounds", () => {
  it("stores hundredths of an ounce exactly (scoring.md §4: 3.43 lb = 5,488)", () => {
    expect(parseWeight(decimal("3.43"))).toEqual({ ok: true, hoz: 5488 });
    expect(parseWeight(decimal("3.44"))).toEqual({ ok: true, hoz: 5504 });
  });

  it("takes whole pounds, one decimal, a leading point and a comma decimal mark", () => {
    expect(parseWeight(decimal("4"))).toEqual({ ok: true, hoz: 6400 });
    expect(parseWeight(decimal("2.5"))).toEqual({ ok: true, hoz: 4000 });
    expect(parseWeight(decimal(".75"))).toEqual({ ok: true, hoz: 1200 });
    expect(parseWeight(decimal("3,43"))).toEqual({ ok: true, hoz: 5488 });
    expect(parseWeight(decimal(" 3.43 "))).toEqual({ ok: true, hoz: 5488 });
  });

  it("refuses more than 2 decimals, letters, signs and a lone point", () => {
    for (const text of ["3.431", "3.4.3", "abc", "-3", "+3", ".", "3 lb"]) {
      expect(parseWeight(decimal(text))).toEqual({ ok: false, problem: "format" });
    }
  });

  it("says missing when empty and zero when not above 0 (R-CAT-C-12)", () => {
    expect(parseWeight(decimal(""))).toEqual({ ok: false, problem: "missing" });
    expect(parseWeight(decimal("   "))).toEqual({ ok: false, problem: "missing" });
    expect(parseWeight(decimal("0"))).toEqual({ ok: false, problem: "zero" });
    expect(parseWeight(decimal("0.00"))).toEqual({ ok: false, problem: "zero" });
  });
});

describe("parseWeight: pounds and ounces", () => {
  it("stores hundredths of an ounce exactly (scoring.md §4: 3 lb 7 oz = 5,500)", () => {
    expect(parseWeight(lbOz("3", "7"))).toEqual({ ok: true, hoz: 5500 });
    expect(parseWeight(lbOz("3", "7.0"))).toEqual({ ok: true, hoz: 5500 });
    expect(parseWeight(lbOz("3", "7.5"))).toEqual({ ok: true, hoz: 5550 });
  });

  it("reads an empty half as zero", () => {
    expect(parseWeight(lbOz("", "12.5"))).toEqual({ ok: true, hoz: 1250 });
    expect(parseWeight(lbOz("2", ""))).toEqual({ ok: true, hoz: 3200 });
  });

  it("takes ounces from 0 to 15.9 only", () => {
    expect(parseWeight(lbOz("1", "15.9"))).toEqual({ ok: true, hoz: 3190 });
    expect(parseWeight(lbOz("1", "16"))).toEqual({ ok: false, problem: "ounces" });
  });

  it("refuses part pounds, two ounce decimals and a lone point", () => {
    for (const [pounds, ounces] of [["3.5", "1"], ["3", "7.05"], ["3", "."], ["x", "1"]] as const) {
      expect(parseWeight(lbOz(pounds, ounces))).toEqual({ ok: false, problem: "format" });
    }
  });

  it("says missing when both are empty and zero when both are 0", () => {
    expect(parseWeight(lbOz("", ""))).toEqual({ ok: false, problem: "missing" });
    expect(parseWeight(lbOz("0", "0.0"))).toEqual({ ok: false, problem: "zero" });
  });
});

describe("switchWeightFormat", () => {
  it("fills the other format when the value is exact in it", () => {
    expect(switchWeightFormat(decimal("2.50"), "lb_oz")).toMatchObject({ format: "lb_oz", wholePounds: "2", ounces: "8.0" });
    expect(switchWeightFormat(lbOz("2", "8"), "lb")).toMatchObject({ format: "lb", pounds: "2.50" });
  });

  it("leaves the other format alone when the value isn't exact in it (3 lb 7 oz is 3.4375 lb)", () => {
    expect(switchWeightFormat(lbOz("3", "7"), "lb")).toMatchObject({ format: "lb", pounds: "" });
    expect(switchWeightFormat(decimal("3.44"), "lb_oz")).toMatchObject({ format: "lb_oz", wholePounds: "", ounces: "" });
  });

  it("never overwrites text already typed, so switching back restores it", () => {
    const typed = { format: "lb", pounds: "3.44", wholePounds: "3", ounces: "7.0" } as const;
    const there = switchWeightFormat(typed, "lb_oz");
    expect(there).toMatchObject({ wholePounds: "3", ounces: "7.0" });
    expect(switchWeightFormat(there, "lb")).toEqual(typed);
  });
});

describe("enteredWeightText and weightProblemCopy", () => {
  it("echoes what was typed, with the unit", () => {
    expect(enteredWeightText(decimal("3.44"))).toBe("3.44 lb");
    expect(enteredWeightText(lbOz("3", "7"))).toBe("3 lb 7.0 oz");
    expect(enteredWeightText(lbOz("", "12.5"))).toBe("0 lb 12.5 oz");
  });

  it("has no field error for missing (the still-needed line says it) and the Figma copy for zero", () => {
    expect(weightProblemCopy("missing", "lb")).toBeNull();
    expect(weightProblemCopy("zero", "lb_oz")).toBe("Enter a weight above 0.");
  });
});
