// A stored weight (hundredths of an ounce) in the viewer's display units (scoring.md §4,
// "Display units"; example 5). Display only: decimal pounds round to 0.01 lb, ounces to 0.1 oz.
// The scoring itself always uses the stored whole number. Pure.

import type { DisplayUnits } from "./profile";

/** { value, unit } as SUB-02b shows them: { "3.44", "lb" } or { "3 lb 7.0", "oz" }. */
export function displayWeight(weightHoz: number, units: DisplayUnits): { value: string; unit: string } {
  if (units === "lb_oz") {
    // 0.1 oz is 10 hundredths of an ounce; 1 lb is 160 tenths.
    const tenths = Math.round(weightHoz / 10);
    const pounds = Math.floor(tenths / 160);
    const ounces = tenths % 160;
    return { value: `${pounds} lb ${Math.floor(ounces / 10)}.${ounces % 10}`, unit: "oz" };
  }
  // 0.01 lb is 16 hundredths of an ounce.
  const hundredths = Math.round(weightHoz / 16);
  return { value: `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`, unit: "lb" };
}

/** The same as one string: "3.44 lb", "3 lb 7.0 oz". */
export function displayWeightText(weightHoz: number, units: DisplayUnits): string {
  const { value, unit } = displayWeight(weightHoz, units);
  return `${value} ${unit}`;
}
