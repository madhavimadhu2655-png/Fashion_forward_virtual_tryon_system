/**
 * Pure pixel-warping logic, deliberately free of any Canvas/DOM API so
 * it can be unit tested directly (construct plain typed arrays, no
 * jsdom/canvas mocking needed). The actual browser code (CameraFeed)
 * wraps this with real Canvas getImageData/putImageData calls.
 */

export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Warps `src` into a `destWidth` x `destHeight` output using BACKWARD
 * mapping: for every destination pixel, `destToSource` says which
 * source pixel to sample. This is the standard approach for warps like
 * this — a forward mapping (walking source pixels to where they land)
 * leaves holes in the output wherever no source pixel happens to land
 * exactly; backward mapping guarantees every destination pixel gets a
 * value.
 *
 * Alpha is preserved through bilinear interpolation just like RGB —
 * never forced to opaque, and destination pixels that map outside the
 * source image are fully transparent (alpha 0), not black.
 */
export function warpImageData(
  src: ImageDataLike,
  destWidth: number,
  destHeight: number,
  destToSource: (dx: number, dy: number) => { x: number; y: number }
): ImageDataLike {
  const out = new Uint8ClampedArray(destWidth * destHeight * 4);

  for (let dy = 0; dy < destHeight; dy++) {
    for (let dx = 0; dx < destWidth; dx++) {
      const { x: sx, y: sy } = destToSource(dx, dy);
      const outIdx = (dy * destWidth + dx) * 4;

      if (
        !Number.isFinite(sx) ||
        !Number.isFinite(sy) ||
        sx < 0 ||
        sy < 0 ||
        sx > src.width - 1 ||
        sy > src.height - 1
      ) {
        out[outIdx] = 0;
        out[outIdx + 1] = 0;
        out[outIdx + 2] = 0;
        out[outIdx + 3] = 0; // transparent, not black — this is what "preserve alpha" means at the edges
        continue;
      }

      const [r, g, b, a] = sampleBilinear(src, sx, sy);
      out[outIdx] = r;
      out[outIdx + 1] = g;
      out[outIdx + 2] = b;
      out[outIdx + 3] = a;
    }
  }

  return { data: out, width: destWidth, height: destHeight };
}

function sampleBilinear(src: ImageDataLike, x: number, y: number): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, src.width - 1);
  const y1 = Math.min(y0 + 1, src.height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const pixelAt = (px: number, py: number): [number, number, number, number] => {
    const idx = (py * src.width + px) * 4;
    return [src.data[idx], src.data[idx + 1], src.data[idx + 2], src.data[idx + 3]];
  };

  const p00 = pixelAt(x0, y0);
  const p10 = pixelAt(x1, y0);
  const p01 = pixelAt(x0, y1);
  const p11 = pixelAt(x1, y1);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const alpha = lerp(
    lerp(p00[3], p10[3], fx),
    lerp(p01[3], p11[3], fx),
    fy,
  );
  if (alpha <= 0) return [0, 0, 0, 0];

  const channel = (index: number) => {
    const premultiplied = lerp(
      lerp(p00[index] * p00[3], p10[index] * p10[3], fx),
      lerp(p01[index] * p01[3], p11[index] * p11[3], fx),
      fy,
    );
    return Math.round(premultiplied / alpha);
  };

  return [channel(0), channel(1), channel(2), Math.round(alpha)];
}
