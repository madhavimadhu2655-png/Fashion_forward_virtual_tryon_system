import { describe, it, expect } from "vitest";
import {
  computeBodyTargetPoints,
  DEFAULT_GARMENT_FIT_PROFILE,
  generateMeshGrid,
  layoutToOrderedPoints,
  CONTROL_POINT_NAMES,
} from "./controlPoints";
import { GARMENT_FIT_PROFILES } from "./garmentFitProfiles";
import { LANDMARK, type PoseLandmarkPoint } from "../poseAnalysis";

function buildLandmarks(overrides: Partial<Record<number, PoseLandmarkPoint>> = {}): PoseLandmarkPoint[] {
  // 33 landmarks, all present with a default position/visibility, then
  // overridden at specific indices for the ones each test cares about.
  const landmarks: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = point!;
  }
  return landmarks;
}

describe("computeBodyTargetPoints", () => {
  it("returns null when landmarks are missing entirely", () => {
    expect(computeBodyTargetPoints(null)).toBeNull();
  });

  it("returns null when a required landmark (e.g. a hip) is absent from the array", () => {
    const short = buildLandmarks().slice(0, 20); // cuts off before hip indices (23, 24)
    expect(computeBodyTargetPoints(short)).toBeNull();
  });

  it("narrows garment shoulders to the product fit proportion around detected body landmarks", () => {
    const landmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
    });

    const result = computeBodyTargetPoints(landmarks)!;
    expect(result.leftShoulder.x).toBeGreaterThan(0.3);
    expect(result.rightShoulder.x).toBeLessThan(0.7);
    expect(result.leftShoulder.y).toBeCloseTo(0.2);
    expect(result.rightShoulder.y).toBeCloseTo(0.2);
    expect(result.leftNeckline.y).toBeGreaterThan(result.leftShoulder.y);
  });

  it("fits the Classic Cotton Crop Top neckline and hem to crop-top proportions", () => {
    const landmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
    });
    const fitProfile = GARMENT_FIT_PROFILES.CT001;
    const result = computeBodyTargetPoints(landmarks, fitProfile)!;
    const shifted = computeBodyTargetPoints(landmarks, {
      ...fitProfile,
      target: { ...fitProfile.target, horizontalOffset: 0.04 },
    })!;

    expect(result.lowerCenterTorso.y).toBeCloseTo(0.2 + 0.68 * 0.4);
    expect(result.lowerCenterTorso.y).toBeLessThan(0.5);
    expect(result.leftNeckline.y).toBeCloseTo(0.2 + 0.22 * 0.4);
    expect(result.upperRightTorso.x - result.upperLeftTorso.x).toBeCloseTo(1.08 * (0.4 * 0.64 + 0.3 * 0.36));
    expect(result.leftShoulder.x).toBeLessThan(0.3);
    expect(result.rightShoulder.x).toBeGreaterThan(0.7);
    expect(shifted.upperCenterTorso.x - result.upperCenterTorso.x).toBeCloseTo(0.04);
  });

  it("orders shoulder and hip targets by image position, not anatomical labels", () => {
    const landmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
    });

    const result = computeBodyTargetPoints(landmarks)!;
    expect(result.leftShoulder.x).toBeGreaterThan(0.3);
    expect(result.rightShoulder.x).toBeLessThan(0.7);
    expect(result.lowerLeftTorso.x).toBeLessThan(result.lowerRightTorso.x);
  });

  it("interpolates the torso rows between the shoulder and hip lines, not fixed values", () => {
    const landmarksA = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
    });
    // Move the whole body down the frame — the derived torso row
    // y-positions must shift too, proving they're computed from the
    // landmarks each time, not cached/fixed.
    const landmarksB = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.4, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.4, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.8, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.8, z: 0, visibility: 1 },
    });

    const resultA = computeBodyTargetPoints(landmarksA)!;
    const resultB = computeBodyTargetPoints(landmarksB)!;

    expect(resultA.upperCenterTorso.y).not.toBeCloseTo(resultB.upperCenterTorso.y, 3);
    expect(resultA.lowerCenterTorso.y).not.toBeCloseTo(resultB.lowerCenterTorso.y, 3);

    // Sanity: rows should be sandwiched between the shoulder and hip lines.
    expect(resultA.upperCenterTorso.y).toBeGreaterThan(0.2);
    expect(resultA.upperCenterTorso.y).toBeLessThan(0.6);
    expect(resultA.lowerCenterTorso.y).toBeGreaterThan(resultA.upperCenterTorso.y);
    expect(resultA.lowerCenterTorso.y).toBeLessThan(0.6);
  });

  it("widens/narrows the torso rows proportionally to detected shoulder width", () => {
    const narrow = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.45, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.55, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.45, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.55, y: 0.6, z: 0, visibility: 1 },
    });
    const wide = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.2, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.8, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.2, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.8, y: 0.6, z: 0, visibility: 1 },
    });

    const narrowResult = computeBodyTargetPoints(narrow)!;
    const wideResult = computeBodyTargetPoints(wide)!;

    const narrowRowWidth = narrowResult.upperRightTorso.x - narrowResult.upperLeftTorso.x;
    const wideRowWidth = wideResult.upperRightTorso.x - wideResult.upperLeftTorso.x;

    expect(wideRowWidth).toBeGreaterThan(narrowRowWidth);
  });
});

describe("layoutToOrderedPoints", () => {
  it("returns points in the same fixed order as CONTROL_POINT_NAMES", () => {
    const landmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
    });
    const layout = computeBodyTargetPoints(landmarks)!;
    const ordered = layoutToOrderedPoints(layout);

    expect(ordered.length).toBe(CONTROL_POINT_NAMES.length);
    expect(ordered[0]).toEqual(layout.leftShoulder);
    expect(ordered[1]).toEqual(layout.rightShoulder);
    expect(ordered[2]).toEqual(layout.leftNeckline);
    expect(ordered).toHaveLength(10);
  });
});

describe("per-product fitting profiles", () => {
  it("defines valid, distinct source geometry for all catalogue products", () => {
    expect(Object.keys(GARMENT_FIT_PROFILES).sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `CT${String(index + 1).padStart(3, "0")}`)
    );
    for (const fitProfile of Object.values(GARMENT_FIT_PROFILES)) {
      const values = Object.values(fitProfile.source);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(fitProfile.source.necklineY).not.toBe(fitProfile.source.chestY);
      expect(fitProfile.target.necklineT).toBeLessThan(fitProfile.target.chestT);
      expect(fitProfile.target.chestT).toBeLessThan(fitProfile.target.hemT);
      expect(fitProfile.target.chestWidth).toBeLessThanOrEqual(1.1);
    }
    expect(GARMENT_FIT_PROFILES.CT002.source.necklineY).not.toBe(DEFAULT_GARMENT_FIT_PROFILE.source.necklineY);
  });
});

describe("generateMeshGrid", () => {
  it("produces (rows+1) x (cols+1) points spanning 0..1", () => {
    const grid = generateMeshGrid(4, 6);
    expect(grid.length).toBe(5);
    expect(grid[0].length).toBe(7);
    expect(grid[0][0]).toEqual({ x: 0, y: 0 });
    expect(grid[4][6]).toEqual({ x: 1, y: 1 });
  });
});
