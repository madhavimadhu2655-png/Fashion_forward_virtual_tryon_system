import type { ImageDataLike } from "./tps/tpsWarp";
import {
  DEFAULT_GARMENT_FIT_PROFILE,
  getSourceControlPointFractions,
  type ControlPointLayout,
} from "./tps/controlPoints";
import type { GarmentFitProfile } from "./tps/garmentFitProfiles";
import {
  getGarmentGeometrySourceFractions,
  type GarmentGeometryProfile,
  type NamedGarmentPoint,
} from "./tps/garmentGeometry";

export interface GarmentImageInspection {
  valid: boolean;
  error: string | null;
  alphaBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export function inspectGarmentImage(image: ImageDataLike): GarmentImageInspection {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.data.length !== image.width * image.height * 4
  ) {
    return { valid: false, error: "The try-on image has invalid dimensions or pixel data.", alphaBounds: null };
  }

  let hasTransparency = false;
  let visiblePixels = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha < 250) hasTransparency = true;
      if (alpha <= 16) continue;
      visiblePixels++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!hasTransparency) {
    return {
      valid: false,
      error: "The try-on PNG has no transparent background. Use an isolated garment cutout.",
      alphaBounds: null,
    };
  }
  if (visiblePixels === 0 || maxX <= minX || maxY <= minY) {
    return {
      valid: false,
      error: "The try-on image contains no visible garment pixels.",
      alphaBounds: null,
    };
  }

  return {
    valid: true,
    error: null,
    alphaBounds: { minX, minY, maxX, maxY },
  };
}

/**
 * Fit the shared garment template to the actual nontransparent image bounds.
 * This avoids using transparent padding as garment geometry across assets
 * with different canvas sizes or crop margins.
 */
export function getGarmentControlPointLayout(
  image: ImageDataLike,
  fitProfile: GarmentFitProfile = DEFAULT_GARMENT_FIT_PROFILE
): ControlPointLayout | null {
  const inspection = inspectGarmentImage(image);
  if (!inspection.valid || !inspection.alphaBounds) return null;

  return getGarmentControlPointLayoutForProfile(image, inspection.alphaBounds, fitProfile);
}

export function getGarmentControlPointLayoutForProfile(
  image: ImageDataLike,
  alphaBounds: NonNullable<GarmentImageInspection["alphaBounds"]>,
  fitProfile: GarmentFitProfile
): ControlPointLayout | null {
  const fractions = getSourceControlPointFractions(fitProfile);
  const maxSnapDistance = Math.max(
    3,
    Math.min(alphaBounds.maxX - alphaBounds.minX, alphaBounds.maxY - alphaBounds.minY) * 0.035
  );
  const { minX, minY, maxX, maxY } = alphaBounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const layout = {} as ControlPointLayout;

  for (const [name, fraction] of Object.entries(fractions) as [keyof ControlPointLayout, { x: number; y: number }][]) {
    const expectedX = minX + fraction.x * width;
    const expectedY = minY + fraction.y * height;
    let nearest: { x: number; y: number; distanceSquared: number } | null = null;
    const left = Math.max(minX, Math.floor(expectedX - maxSnapDistance));
    const right = Math.min(maxX, Math.ceil(expectedX + maxSnapDistance));
    const top = Math.max(minY, Math.floor(expectedY - maxSnapDistance));
    const bottom = Math.min(maxY, Math.ceil(expectedY + maxSnapDistance));

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
        const distanceSquared = (x - expectedX) ** 2 + (y - expectedY) ** 2;
        if (distanceSquared > maxSnapDistance ** 2) continue;
        if (!nearest || distanceSquared < nearest.distanceSquared) {
          nearest = { x, y, distanceSquared };
        }
      }
    }

    if (!nearest) return null;
    layout[name] = { x: nearest.x / image.width, y: nearest.y / image.height };
  }

  const points = Object.values(layout);
  const unique = new Set(points.map(({ x, y }) => `${x.toFixed(5)},${y.toFixed(5)}`));
  return unique.size === points.length ? layout : null;
}

export function getGarmentGeometryControlPoints(
  image: ImageDataLike,
  fitProfile: GarmentFitProfile,
  geometryProfile: GarmentGeometryProfile,
  alphaBounds?: NonNullable<GarmentImageInspection["alphaBounds"]>
): NamedGarmentPoint[] | null {
  const visibleBounds = alphaBounds ?? inspectGarmentImage(image).alphaBounds;
  if (!visibleBounds) return null;
  const fractions = getGarmentGeometrySourceFractions(fitProfile, geometryProfile);
  const maxSnapDistance = Math.max(
    3,
    Math.min(visibleBounds.maxX - visibleBounds.minX, visibleBounds.maxY - visibleBounds.minY) * 0.035
  );
  const width = visibleBounds.maxX - visibleBounds.minX;
  const height = visibleBounds.maxY - visibleBounds.minY;
  const points: NamedGarmentPoint[] = [];

  for (const anchor of fractions) {
    const expectedX = visibleBounds.minX + anchor.point.x * width;
    const expectedY = visibleBounds.minY + anchor.point.y * height;
    const left = Math.max(visibleBounds.minX, Math.floor(expectedX - maxSnapDistance));
    const right = Math.min(visibleBounds.maxX, Math.ceil(expectedX + maxSnapDistance));
    const top = Math.max(visibleBounds.minY, Math.floor(expectedY - maxSnapDistance));
    const bottom = Math.min(visibleBounds.maxY, Math.ceil(expectedY + maxSnapDistance));
    let nearest: { x: number; y: number; distanceSquared: number } | null = null;

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
        const distanceSquared = (x - expectedX) ** 2 + (y - expectedY) ** 2;
        if (distanceSquared > maxSnapDistance ** 2) continue;
        if (!nearest || distanceSquared < nearest.distanceSquared) {
          nearest = { x, y, distanceSquared };
        }
      }
    }

    if (!nearest) return null;
    points.push({
      name: anchor.name,
      region: anchor.region,
      point: { x: nearest.x / image.width, y: nearest.y / image.height },
    });
  }

  const unique = new Set(points.map(({ point }) => `${point.x.toFixed(5)},${point.y.toFixed(5)}`));
  return unique.size === points.length ? points : null;
}

export function getGarmentAlphaOutline(image: ImageDataLike): { x: number; y: number }[] {
  const rowLeft: { x: number; y: number }[] = [];
  const rowRight: { x: number; y: number }[] = [];
  const columnTop: { x: number; y: number }[] = [];
  const columnBottom: { x: number; y: number }[] = [];
  const isVisible = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3] > 16;

  for (let y = 0; y < image.height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < image.width; x++) {
      if (!isVisible(x, y)) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) {
      rowLeft.push({ x: left, y });
      rowRight.push({ x: right, y });
    }
  }

  for (let x = 0; x < image.width; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < image.height; y++) {
      if (!isVisible(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top >= 0) {
      columnTop.push({ x, y: top });
      columnBottom.push({ x, y: bottom });
    }
  }

  const step = Math.max(1, Math.ceil((image.width + image.height) / 1000));
  const outline = [
    ...rowLeft.filter((_, index) => index % step === 0),
    ...columnBottom.filter((_, index) => index % step === 0),
    ...rowRight.filter((_, index) => index % step === 0).reverse(),
    ...columnTop.filter((_, index) => index % step === 0).reverse(),
  ];
  return outline;
}
