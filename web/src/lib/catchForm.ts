// The submit form's rules that don't need a screen (SUB-01a, SUB-01d): photo slot labels and
// what's still missing before Send. Pure: no DOM, no PocketBase.

import type { LengthResult } from "./lengthEntry";
import type { WeightResult } from "./weightEntry";

export type Metric = "weight" | "length";

/** Two required photos plus up to 2 more (scoring.md §5; schema max 4, R-CAT-C-21). */
export const REQUIRED_PHOTOS = 2;
export const MAX_PHOTOS = 4;

/** screens.md §0 "Photo slots": 1 holding the fish, 2 on the scale or board, 3 and 4 extras. */
export function photoSlotLabel(slot: number, metric: Metric): string {
  if (slot === 1) return "1 · Holding the fish";
  if (slot === 2) return metric === "weight" ? "2 · On the scale" : "2 · On the board";
  return "Extra photo";
}

/** The slot's spoken name (Figma Photo slot notes): "Photo 2, on the scale, required". */
export function photoSlotName(slot: number, metric: Metric): string {
  if (slot === 1) return "Photo 1, holding the fish, required";
  if (slot === 2) return `Photo 2, ${metric === "weight" ? "on the scale" : "on the board"}, required`;
  return `Photo ${slot}, extra, optional`;
}

export type MissingInput = "photo1" | "photo2" | "species" | "measurement";

export interface FormInputs {
  metric: Metric;
  /** Which of the two required slots hold a photo. */
  requiredFilled: readonly [boolean, boolean];
  speciesChosen: boolean;
  /** The parsed weight or length; only whether it is valid matters here. */
  measurement: WeightResult | LengthResult;
}

/** Everything that still stops Send, in screen order. An invalid measurement counts as missing. */
export function missingInputs({ requiredFilled, speciesChosen, measurement }: FormInputs): MissingInput[] {
  const missing: MissingInput[] = [];
  if (!requiredFilled[0]) missing.push("photo1");
  if (!requiredFilled[1]) missing.push("photo2");
  if (!speciesChosen) missing.push("species");
  if (!measurement.ok) missing.push("measurement");
  return missing;
}

/** SUB-01d's line above the disabled Send: "To send, add: photo 2 (on the scale) and the weight." */
export function stillNeededLine(missing: readonly MissingInput[], metric: Metric): string | null {
  if (missing.length === 0) return null;
  const words: Record<MissingInput, string> = {
    photo1: "photo 1 (holding the fish)",
    photo2: metric === "weight" ? "photo 2 (on the scale)" : "photo 2 (on the board)",
    species: "the species",
    measurement: metric === "weight" ? "the weight" : "the length",
  };
  const items = missing.map((input) => words[input]);
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  return `To send, add: ${list}.`;
}
