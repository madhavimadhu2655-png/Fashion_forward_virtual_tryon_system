import { describe, expect, it } from "vitest";
import { getGarmentControlPointLayout, inspectGarmentImage } from "./garmentImage";
import type { ImageDataLike } from "./tps/tpsWarp";
import { GARMENT_FIT_PROFILES } from "./tps/garmentFitProfiles";

function makeImage(width: number, height: number, alphaAt: (x: number, y: number) => number): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alphaAt(x, y);
  }
  return { data, width, height };
}

describe("inspectGarmentImage", () => {
  it("finds the visible bounds of a garment and confirms transparency", () => {
    const image = makeImage(8, 8, (x, y) => (x >= 2 && x <= 5 && y >= 1 && y <= 6 ? 255 : 0));
    expect(inspectGarmentImage(image)).toEqual({
      valid: true,
      error: null,
      alphaBounds: { minX: 2, minY: 1, maxX: 5, maxY: 6 },
    });
  });

  it("rejects opaque photos instead of compositing their background", () => {
    expect(inspectGarmentImage(makeImage(4, 4, () => 255)).error).toContain("transparent background");
  });

  it("rejects fully transparent or malformed pixel buffers", () => {
    expect(inspectGarmentImage(makeImage(4, 4, () => 0)).error).toContain("no visible garment");
    expect(inspectGarmentImage({ data: new Uint8ClampedArray(3), width: 1, height: 1 }).valid).toBe(false);
  });

  it("fits product-specific source points to visible garment bounds", () => {
    const image = makeImage(100, 100, (x, y) => (x >= 20 && x <= 79 && y >= 10 && y <= 89 ? 255 : 0));
    const layout = getGarmentControlPointLayout(image)!;
    expect(layout.leftShoulder.x).toBeGreaterThan(0.2);
    expect(layout.leftShoulder.y).toBeGreaterThan(0.1);
    expect(layout.rightShoulder.x).toBeLessThan(0.8);
    expect(layout.lowerCenterTorso.y).toBeLessThan(0.89);
    expect(Object.keys(layout)).toHaveLength(10);
    for (const point of Object.values(layout)) {
      const x = Math.round(point.x * image.width);
      const y = Math.round(point.y * image.height);
      expect(image.data[(y * image.width + x) * 4 + 3]).toBeGreaterThan(16);
    }
  });

  it("generates valid, distinct source points for each of the 20 garment profiles", () => {
    const image = makeImage(100, 100, (x, y) => (x >= 5 && x <= 94 && y >= 5 && y <= 94 ? 255 : 0));
    for (const fitProfile of Object.values(GARMENT_FIT_PROFILES)) {
      const layout = getGarmentControlPointLayout(image, fitProfile);
      expect(layout).not.toBeNull();
      expect(new Set(Object.values(layout!).map(({ x, y }) => `${x.toFixed(4)},${y.toFixed(4)}`)).size).toBe(10);
    }
  });

  it("does not produce control points for an invalid image", () => {
    expect(getGarmentControlPointLayout(makeImage(3, 3, () => 255))).toBeNull();
  });
});
