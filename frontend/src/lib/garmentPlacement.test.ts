import { describe, it, expect } from "vitest";
import { computeGarmentPlacement } from "./garmentPlacement";
import { LANDMARK, type PoseLandmarkPoint, type PoseQualityResult } from "./poseAnalysis";

function buildLandmarks(overrides: Partial<Record<number, PoseLandmarkPoint>> = {}): PoseLandmarkPoint[] {
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

const validQuality: PoseQualityResult = {
  pose_valid: true,
  orientation: "front",
  confidence: 0.95,
  message: "Good pose detected.",
  landmarksDetected: { shoulders: true, hips: true, wrists: true },
};

describe("computeGarmentPlacement", () => {
  it("returns null when pose is not valid or not front-facing", () => {
    const landmarks = buildLandmarks({
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.35, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_SHOULDER]: { x: 0.65, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.38, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.62, y: 0.6, z: 0, visibility: 1 },
    });

    expect(computeGarmentPlacement(landmarks, { ...validQuality, pose_valid: false })).toBeNull();
    expect(computeGarmentPlacement(landmarks, { ...validQuality, orientation: "side" })).toBeNull();
    expect(computeGarmentPlacement(null, validQuality)).toBeNull();
  });

  it("calculates upright 0-degree rotation (not 180 degrees) with real front-camera landmarks", () => {
    // In front-camera MediaPipe: right shoulder is at smaller x (0.35), left shoulder is at larger x (0.65)
    const landmarks = buildLandmarks({
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.35, y: 0.25, z: 0, visibility: 1 },
      [LANDMARK.LEFT_SHOULDER]: { x: 0.65, y: 0.25, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.38, y: 0.65, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.62, y: 0.65, z: 0, visibility: 1 },
    });

    const placement = computeGarmentPlacement(landmarks, validQuality);
    expect(placement).not.toBeNull();

    // Upright shoulders should have rotationDeg near 0, NOT 180!
    expect(placement!.rotationDeg).toBeCloseTo(0, 1);
    expect(placement!.centerX).toBeCloseTo(0.5, 2);
    expect(placement!.shoulderWidth).toBeCloseTo(0.3, 2);
    expect(placement!.width).toBeGreaterThan(placement!.shoulderWidth);
  });

  it("calculates accurate tilt angle when body is tilted", () => {
    // Person tilted to their left (screen-right shoulder lower than screen-left shoulder)
    const landmarks = buildLandmarks({
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.35, y: 0.20, z: 0, visibility: 1 },
      [LANDMARK.LEFT_SHOULDER]: { x: 0.65, y: 0.30, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.38, y: 0.60, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.62, y: 0.70, z: 0, visibility: 1 },
    });

    const placement = computeGarmentPlacement(landmarks, validQuality);
    expect(placement).not.toBeNull();

    // Positive tilt angle (screenRight y > screenLeft y)
    expect(placement!.rotationDeg).toBeGreaterThan(0);
    expect(placement!.rotationDeg).toBeLessThan(45);
  });
});
