import { describe, expect, it } from "vitest";
import { analyzePose, estimateMeasurements, LANDMARK, type PoseLandmarkPoint } from "./poseAnalysis";

function buildLandmarks(): PoseLandmarkPoint[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  landmarks[LANDMARK.LEFT_SHOULDER] = { x: 0.65, y: 0.2, z: 0, visibility: 0.9 };
  landmarks[LANDMARK.RIGHT_SHOULDER] = { x: 0.35, y: 0.2, z: 0, visibility: 0.9 };
  landmarks[LANDMARK.LEFT_HIP] = { x: 0.62, y: 0.6, z: 0, visibility: 0.9 };
  landmarks[LANDMARK.RIGHT_HIP] = { x: 0.38, y: 0.6, z: 0, visibility: 0.9 };
  return landmarks;
}

describe("pose analysis and live measurements", () => {
  it("accepts a clear torso pose without requiring a visible face", () => {
    const landmarks = buildLandmarks();
    landmarks[LANDMARK.NOSE] = { x: 0.5, y: 0.1, z: 0, visibility: 0 };

    const quality = analyzePose(landmarks);
    expect(quality.pose_valid).toBe(true);
    expect(quality.confidence).toBeCloseTo(0.9);
  });

  it("rejects absent, low-confidence, non-finite, and out-of-frame required landmarks", () => {
    const missing = buildLandmarks();
    delete (missing as (PoseLandmarkPoint | undefined)[])[LANDMARK.LEFT_HIP];
    expect(analyzePose(missing).pose_valid).toBe(false);

    const lowConfidence = buildLandmarks();
    lowConfidence[LANDMARK.RIGHT_SHOULDER].visibility = 0.2;
    expect(analyzePose(lowConfidence).pose_valid).toBe(false);

    const invalid = buildLandmarks();
    invalid[LANDMARK.LEFT_HIP].x = Number.NaN;
    expect(analyzePose(invalid).pose_valid).toBe(false);

    const clipped = buildLandmarks();
    clipped[LANDMARK.RIGHT_HIP].x = 1.1;
    expect(analyzePose(clipped).pose_valid).toBe(false);
  });

  it("calculates normalized estimates from known landmark distances", () => {
    const landmarks = buildLandmarks();
    const measurements = estimateMeasurements(landmarks, analyzePose(landmarks));

    expect(measurements.shoulder_width).toBe(0.3);
    expect(measurements.hip_width).toBe(0.24);
    expect(measurements.torso_length).toBe(0.4);
    expect(measurements.chest_estimate).toBeNull();
    expect(measurements.waist_estimate).toBeNull();
  });

  it("keeps estimates null when the latest required landmarks cannot be trusted", () => {
    const landmarks = buildLandmarks();
    landmarks[LANDMARK.LEFT_HIP].visibility = 0.1;
    const quality = analyzePose(landmarks);

    expect(quality.pose_valid).toBe(false);
    expect(estimateMeasurements(landmarks, quality).shoulder_width).toBeNull();
  });
});
