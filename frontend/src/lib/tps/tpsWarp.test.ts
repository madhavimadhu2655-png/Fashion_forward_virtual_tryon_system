import { describe, it, expect } from "vitest";
import { warpImageData, type ImageDataLike } from "./tpsWarp";

function makeSolidImage(width: number, height: number, r: number, g: number, b: number, a: number): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

describe("warpImageData — identity mapping", () => {
  it("reproduces the source image exactly when destToSource is the identity", () => {
    const src = makeSolidImage(4, 4, 200, 100, 50, 255);
    const out = warpImageData(src, 4, 4, (dx, dy) => ({ x: dx, y: dy }));

    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(200);
      expect(out.data[i + 1]).toBe(100);
      expect(out.data[i + 2]).toBe(50);
      expect(out.data[i + 3]).toBe(255);
    }
  });
});

describe("warpImageData — alpha preservation", () => {
  it("preserves a fully transparent source region as transparent, not opaque black", () => {
    // Left half opaque red, right half fully transparent.
    const width = 4;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x < width / 2) {
          data[idx] = 255;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        } else {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }
    const src: ImageDataLike = { data, width, height };

    const out = warpImageData(src, width, height, (dx, dy) => ({ x: dx, y: dy }));

    // Sample from the transparent half.
    const transparentIdx = (0 * width + 3) * 4;
    expect(out.data[transparentIdx + 3]).toBe(0); // alpha stayed 0

    // Sample from the opaque half.
    const opaqueIdx = (0 * width + 0) * 4;
    expect(out.data[opaqueIdx + 3]).toBe(255);
  });

  it("preserves partial (semi-transparent) alpha through bilinear interpolation, not rounding to 0 or 255", () => {
    const width = 2;
    const height = 1;
    const data = new Uint8ClampedArray(width * height * 4);
    // Pixel 0: alpha 0. Pixel 1: alpha 200.
    data[3] = 0;
    data[7] = 200;
    const src: ImageDataLike = { data, width, height };

    // Sample exactly halfway between the two pixels.
    const out = warpImageData(src, 1, 1, () => ({ x: 0.5, y: 0 }));
    const alpha = out.data[3];

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(200);
  });

  it("prevents transparent padding from tinting visible garment edges", () => {
    const src: ImageDataLike = {
      data: new Uint8ClampedArray([
        255, 120, 40, 255,
        0, 0, 0, 0,
      ]),
      width: 2,
      height: 1,
    };

    const out = warpImageData(src, 1, 1, () => ({ x: 0.5, y: 0 }));

    expect(out.data[3]).toBe(128);
    expect(out.data[0]).toBe(255);
    expect(out.data[1]).toBe(120);
    expect(out.data[2]).toBe(40);
  });
});

describe("warpImageData — out-of-bounds sampling", () => {
  it("writes fully transparent pixels for destination points outside the source image", () => {
    const src = makeSolidImage(2, 2, 255, 255, 255, 255);
    // Every destination pixel maps far outside the 2x2 source.
    const out = warpImageData(src, 2, 2, () => ({ x: 100, y: 100 }));

    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i + 3]).toBe(0); // transparent
      // And not accidentally opaque black misread as "valid black pixel":
      expect(out.data[i]).toBe(0);
      expect(out.data[i + 1]).toBe(0);
      expect(out.data[i + 2]).toBe(0);
    }
  });
});

describe("warpImageData — non-rigid mapping produces genuinely different output", () => {
  it("a non-uniform destToSource produces a different result than a uniform scale", () => {
    // Checkerboard source so warping actually changes visible content.
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const on = (x + y) % 2 === 0;
        data[idx] = on ? 255 : 0;
        data[idx + 1] = on ? 255 : 0;
        data[idx + 2] = on ? 255 : 0;
        data[idx + 3] = 255;
      }
    }
    const src: ImageDataLike = { data, width, height };

    const uniform = warpImageData(src, 4, 4, (dx, dy) => ({ x: dx, y: dy }));
    // A warp that compresses the right half of the destination into a
    // small source region — genuinely non-uniform, not just a scale.
    const nonUniform = warpImageData(src, 4, 4, (dx, dy) => ({
      x: dx < 2 ? dx : 1.5 + (dx - 2) * 0.1,
      y: dy,
    }));

    expect(nonUniform.data).not.toEqual(uniform.data);
  });
});
