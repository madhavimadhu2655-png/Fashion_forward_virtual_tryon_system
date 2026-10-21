import { describe, expect, it } from "vitest";
import {
  applyGain,
  cleanGarmentEdges,
  isPatternColor,
  lightingGain,
  medianLuminance,
} from "./garmentRefinement";

function rgba(pixels: number[][]) {
  return { data: new Uint8ClampedArray(pixels.flat()), width: pixels.length, height: 1 };
}

describe("cleanGarmentEdges", () => {
  it("removes faint halo, makes the near-opaque body opaque and keeps a smooth edge", () => {
    const out = cleanGarmentEdges(rgba([[200, 200, 200, 20], [10, 10, 10, 252], [10, 10, 10, 142], [0, 0, 0, 0]]));
    expect(Array.from(out.data.filter((_, i) => i % 4 === 3))).toEqual([0, 255, 127, 0]);
  });

  it("never touches colour channels and doesn't mutate the input", () => {
    const input = rgba([[12, 34, 56, 100]]);
    const out = cleanGarmentEdges(input);
    expect(Array.from(out.data.slice(0, 3))).toEqual([12, 34, 56]);
    expect(input.data[3]).toBe(100);
  });

  it("rejects an invalid range", () => {
    expect(() => cleanGarmentEdges(rgba([[0, 0, 0, 0]]), 200, 100)).toThrow();
  });
});

describe("lighting match", () => {
  it("measures median luminance and ignores transparent pixels", () => {
    expect(medianLuminance(rgba([[255, 255, 255, 255], [0, 0, 0, 0], [255, 255, 255, 255]]))).toBeCloseTo(1);
  });

  it("keeps the gain within mild bounds", () => {
    expect(lightingGain(0.55)).toBeCloseTo(1);
    expect(lightingGain(0.05)).toBe(0.85);
    expect(lightingGain(0.99)).toBe(1.06);
    expect(lightingGain(Number.NaN)).toBe(1);
  });

  it("applies gain only to visible pixels", () => {
    const out = applyGain(rgba([[100, 100, 100, 255], [100, 100, 100, 0]]), 0.9);
    expect(Array.from(out.data)).toEqual([90, 90, 90, 255, 100, 100, 100, 0]);
  });
});

describe("isPatternColor", () => {
  it("flags printed colourways that a tint can't reproduce", () => {
    expect(isPatternColor("Multicolor")).toBe(true);
    expect(isPatternColor("Light Blue")).toBe(false);
  });
});

describe("recolour limits", () => {
  it("allows small lightness shifts but refuses dark-to-light recolours", async () => {
    const { canRecolour, hexLuminance } = await import("./garmentRefinement");
    const black = hexLuminance("#111827")!;
    expect(canRecolour(black, "#7f1d1d")).toBe(true); // black -> burgundy
    expect(canRecolour(black, "#f9fafb")).toBe(false); // black -> white (would render grey)
    expect(canRecolour(black, "#f472b6")).toBe(false); // black -> pink
    expect(canRecolour(hexLuminance("#d6cdbf")!, "#f9fafb")).toBe(true); // beige -> white
    expect(canRecolour(black, "not-a-colour")).toBe(false);
  });
});
