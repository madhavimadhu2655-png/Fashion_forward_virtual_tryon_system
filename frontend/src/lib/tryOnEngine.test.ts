import { describe, expect, it } from "vitest";
import { generationBlockers, type GenerationState } from "./tryOnEngine";

const ready: GenerationState = {
  engine: "browser_fit",
  hasPhoto: true,
  qualityChecking: false,
  qualityBlocking: false,
  hasProduct: true,
  hasColor: true,
  colorName: "Black",
  consent: true,
  garmentLoading: false,
  garmentAvailable: true,
  exactColor: true,
  fitProfileAvailable: true,
  aiStatus: null,
  aiStatusError: false,
  generating: false,
};

describe("generationBlockers", () => {
  it("allows a complete browser-fit request", () => {
    expect(generationBlockers(ready)).toEqual([]);
  });

  it("lists every missing prerequisite", () => {
    const reasons = generationBlockers({ ...ready, hasPhoto: false, hasProduct: false, consent: false });
    expect(reasons).toEqual(["Add a photo.", "Choose a crop top."]);
    expect(generationBlockers({ ...ready, consent: false })).toEqual(["Confirm you have permission to use this photo."]);
    expect(generationBlockers({ ...ready, qualityBlocking: true })[0]).toContain("photo problems");
  });

  it("refuses a recolour that is too far in lightness from the reference", () => {
    const blocked = generationBlockers({
      ...ready,
      exactColor: false,
      colorName: "White",
      colorHex: "#f9fafb",
      referenceColorName: "Black",
      referenceColorHex: "#111827",
    });
    expect(blocked[0]).toContain("The only garment reference is Black");
    expect(
      generationBlockers({ ...ready, exactColor: false, colorName: "Maroon", colorHex: "#7f1d1d", referenceColorName: "Black", referenceColorHex: "#111827" }),
    ).toEqual([]);
  });

  it("allows tinting a solid colour but refuses to fake a print", () => {
    expect(generationBlockers({ ...ready, exactColor: false, colorName: "White" })).toEqual([]);
    expect(generationBlockers({ ...ready, exactColor: false, colorName: "Multicolor" })[0]).toContain("print");
  });

  it("requires an exact reference and a ready worker for AI generation", () => {
    const ai = { ...ready, engine: "catvton" as const };
    expect(generationBlockers(ai)).toContain("Checking the AI model…");
    const down = generationBlockers({
      ...ai,
      exactColor: false,
      colorName: "White",
      aiStatus: {
        available: false,
        message: "x",
        checks: [
          { id: "worker_url", label: "Local worker address configured", ok: false, help: "" },
          { id: "license", label: "Non-commercial licence confirmed", ok: true, help: "" },
        ],
      },
    });
    expect(down).toEqual([
      "No exact White garment reference is configured for AI generation.",
      "AI model unavailable: Local worker address configured.",
    ]);
    expect(generationBlockers({ ...ai, aiStatus: { available: true, message: "ok" } })).toEqual([]);
  });
});
