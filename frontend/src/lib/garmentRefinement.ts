import type { ImageDataLike } from "./tps/tpsWarp";

/**
 * Garment-cutout refinements applied before warping.
 *
 * Edge cleanup: measured on the shipped cutouts (2026-10-19), garment
 * bodies sit at alpha 250–254 (slightly see-through, so the person's own
 * clothes faintly show through) and several cutouts carry a background
 * "glow" at alpha 1–39 (22–31% of visible pixels in CT011 and CT019,
 * ~3% elsewhere). A linear remap of [floor, ceiling] → [0, 255] removes
 * the glow, makes the body opaque, and keeps a smooth anti-aliased edge.
 */
export const EDGE_ALPHA_FLOOR = 40;
export const EDGE_ALPHA_CEILING = 245;

export function cleanGarmentEdges(
  image: ImageDataLike,
  floor = EDGE_ALPHA_FLOOR,
  ceiling = EDGE_ALPHA_CEILING,
): ImageDataLike {
  if (!(floor >= 0 && ceiling <= 255 && ceiling > floor)) throw new Error("Invalid edge-cleanup range.");
  const pixels = new Uint8ClampedArray(image.data);
  const span = ceiling - floor;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha <= floor) pixels[index] = 0;
    else if (alpha >= ceiling) pixels[index] = 255;
    else pixels[index] = Math.round(((alpha - floor) / span) * 255);
  }
  return { data: pixels, width: image.width, height: image.height };
}

/** Median Rec.709 luminance (0–1) of an RGBA buffer, sampled on a grid. */
export function medianLuminance(image: ImageDataLike, maxSamples = 4096): number {
  const total = image.width * image.height;
  if (total === 0) return 0.5;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const values: number[] = [];
  for (let pixel = 0; pixel < total; pixel += step) {
    const i = pixel * 4;
    if (image.data[i + 3] === 0) continue;
    values.push((image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722) / 255);
  }
  if (values.length === 0) return 0.5;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/**
 * A deliberately mild exposure match: garment cutouts are lit like studio
 * shots, user photos often are not. The gain is bounded to [0.85, 1.06]
 * so colours stay recognisable; it is not relighting.
 */
export function lightingGain(sceneLuminance: number, reference = 0.55): number {
  if (!Number.isFinite(sceneLuminance) || sceneLuminance <= 0) return 1;
  return Math.min(1.06, Math.max(0.85, (sceneLuminance / reference) ** 0.3));
}

export function applyGain(image: ImageDataLike, gain: number): ImageDataLike {
  if (gain === 1) return image;
  const pixels = new Uint8ClampedArray(image.data);
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    pixels[index] = pixels[index] * gain;
    pixels[index + 1] = pixels[index + 1] * gain;
    pixels[index + 2] = pixels[index + 2] * gain;
  }
  return { data: pixels, width: image.width, height: image.height };
}

/** Colours that can't be approximated by tinting a cutout of another colour. */
export function isPatternColor(colorName: string): boolean {
  return /multi|print|floral|pattern/i.test(colorName);
}

/**
 * Recolouring a cutout can shift hue but can't credibly turn a dark fabric
 * light (black -> white comes out flat grey) or vice versa. Beyond this
 * lightness gap (0-1, Rec.709 luma of sRGB values) the preview would
 * misrepresent the product, so it is refused instead.
 */
export const MAX_RECOLOUR_LIGHTNESS_GAP = 0.35;

export function hexLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return (((value >> 16) & 255) * 0.2126 + ((value >> 8) & 255) * 0.7152 + (value & 255) * 0.0722) / 255;
}

export function canRecolour(fromLuminance: number, toHex: string): boolean {
  const to = hexLuminance(toHex);
  return to !== null && Math.abs(to - fromLuminance) <= MAX_RECOLOUR_LIGHTNESS_GAP;
}
