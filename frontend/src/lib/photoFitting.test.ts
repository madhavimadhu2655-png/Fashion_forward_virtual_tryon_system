import { describe, expect, it } from "vitest";
import { tintGarmentPixels } from "./photoFitting";

describe("tintGarmentPixels", () => {
  it("tints visible garment pixels while preserving their shading and transparency", () => {
    const tinted = tintGarmentPixels(
      {
        data: new Uint8ClampedArray([100, 100, 100, 255, 40, 40, 40, 128, 20, 30, 40, 0]),
        width: 3,
        height: 1,
      },
      "#2563eb",
    );

    expect(tinted.data[2]).toBeGreaterThan(tinted.data[0]);
    expect(tinted.data[4 + 3]).toBe(128);
    expect(Array.from(tinted.data.slice(8))).toEqual([20, 30, 40, 0]);
  });

  it("rejects invalid catalog color values", () => {
    expect(() =>
      tintGarmentPixels(
        { data: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 },
        "blue",
      ),
    ).toThrow("invalid color");
  });

  it("retains source fabric pattern and color variation while applying the selected shade", () => {
    const tinted = tintGarmentPixels(
      {
        data: new Uint8ClampedArray([
          120, 120, 120, 255,
          100, 140, 120, 255,
        ]),
        width: 2,
        height: 1,
      },
      "#2563eb",
    );

    expect(tinted.data.slice(0, 3)).not.toEqual(tinted.data.slice(4, 7));
    expect(tinted.data[2]).toBeGreaterThan(tinted.data[0]);
    expect(tinted.data[4 + 2]).toBeGreaterThan(tinted.data[4]);
  });
});
