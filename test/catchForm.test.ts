import { describe, expect, it } from "vitest";
import { missingInputs, photoSlotLabel, photoSlotName, stillNeededLine, type FormInputs } from "../web/src/lib/catchForm";

const complete: FormInputs = { metric: "weight", requiredFilled: [true, true], speciesChosen: true, measurement: { ok: true, hoz: 5504 } };

describe("photo slots", () => {
  it("labels slots 1 and 2 by what they show, and 3 and 4 as extras (screens.md §0)", () => {
    expect(photoSlotLabel(1, "weight")).toBe("1 · Holding the fish");
    expect(photoSlotLabel(2, "weight")).toBe("2 · On the scale");
    expect(photoSlotLabel(2, "length")).toBe("2 · On the board");
    expect(photoSlotLabel(3, "weight")).toBe("Extra photo");
    expect(photoSlotName(4, "weight")).toBe("Photo 4, extra, optional");
    expect(photoSlotName(2, "weight")).toBe("Photo 2, on the scale, required");
  });
});

describe("missingInputs", () => {
  it("is empty when Send can go", () => {
    expect(missingInputs(complete)).toEqual([]);
  });

  it("lists every gap in screen order; an invalid measurement counts (R-CAT-C-12, C-21)", () => {
    expect(missingInputs({ ...complete, requiredFilled: [false, false], speciesChosen: false, measurement: { ok: false, problem: "zero" } })).toEqual([
      "photo1",
      "photo2",
      "species",
      "measurement",
    ]);
    expect(missingInputs({ ...complete, requiredFilled: [true, false] })).toEqual(["photo2"]);
  });
});

describe("stillNeededLine", () => {
  it("matches the SUB-01d frame", () => {
    expect(stillNeededLine(["photo2", "measurement"], "weight")).toBe("To send, add: photo 2 (on the scale) and the weight.");
  });

  it("joins one, and three or more", () => {
    expect(stillNeededLine(["species"], "weight")).toBe("To send, add: the species.");
    expect(stillNeededLine(["photo1", "photo2", "measurement"], "length")).toBe(
      "To send, add: photo 1 (holding the fish), photo 2 (on the board) and the length.",
    );
  });

  it("is null when nothing is missing", () => {
    expect(stillNeededLine([], "weight")).toBeNull();
  });
});
