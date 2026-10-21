import { describe, it, expect } from "vitest";
import { computeGarmentTpsContext, computeGarmentWarp } from "./garmentWarpPipeline";
import { getGarmentControlPointLayout, inspectGarmentImage } from "../garmentImage";
import { getSourceControlPointFractions } from "./controlPoints";
import { LANDMARK, type PoseLandmarkPoint, type PoseQualityResult } from "../poseAnalysis";
import type { ImageDataLike } from "./tpsWarp";
import { GARMENT_FIT_PROFILES } from "./garmentFitProfiles";
import { GARMENT_GEOMETRY_PROFILES, getGarmentGeometrySourceFractions } from "./garmentGeometry";

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

const validLandmarks = buildLandmarks({
  [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
  [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
});

const validQuality: PoseQualityResult = {
  pose_valid: true,
  orientation: "front",
  confidence: 0.9,
  message: "Good pose detected.",
  landmarksDetected: { shoulders: true, hips: true, wrists: true },
};

describe("computeGarmentTpsContext", () => {
  it("returns null when the pose is invalid", () => {
    const invalidQuality: PoseQualityResult = { ...validQuality, pose_valid: false };
    expect(computeGarmentTpsContext(validLandmarks, invalidQuality, 1000, 1200, 640, 480)).toBeNull();
  });

  it("returns null when orientation isn't front", () => {
    const sideQuality: PoseQualityResult = { ...validQuality, orientation: "side" };
    expect(computeGarmentTpsContext(validLandmarks, sideQuality, 1000, 1200, 640, 480)).toBeNull();
  });

  it("returns null when landmarks are missing", () => {
    expect(computeGarmentTpsContext(null, validQuality, 1000, 1200, 640, 480)).toBeNull();
  });

  it("produces ten garment-specific control points and a matching mesh grid on a valid pose", () => {
    const ctx = computeGarmentTpsContext(validLandmarks, validQuality, 1000, 1200, 640, 480)!;
    expect(ctx).not.toBeNull();
    expect(ctx.controlPointCount).toBe(10);
    expect(ctx.garmentControlPointsPx.length).toBe(10);
    expect(ctx.bodyTargetPointsPx.length).toBe(10);
    expect(ctx.meshGridCanvasPoints.length).toBeGreaterThan(1);
    expect(ctx.meshGridCanvasPoints[0].length).toBeGreaterThan(1);
    expect(ctx.warpStrength).toBeGreaterThanOrEqual(0);
    expect(ctx.warpStrength).toBeLessThanOrEqual(1);
    if (ctx.warpStrength < 1) expect(ctx.warpWarning).toContain("prevent a folded fit");
  });

  it("combines torso and independent arm/sleeve geometry without duplicate side-seam controls", () => {
    const fit = GARMENT_FIT_PROFILES.CT002;
    const geometry = GARMENT_GEOMETRY_PROFILES.CT002;
    const sourcePoints = getGarmentGeometrySourceFractions(fit, geometry);
    const layout = getSourceControlPointFractions(fit);
    const landmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.35, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.65, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.4, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.6, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.LEFT_ELBOW]: { x: 0.25, y: 0.4, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_ELBOW]: { x: 0.75, y: 0.4, z: 0, visibility: 1 },
      [LANDMARK.LEFT_WRIST]: { x: 0.2, y: 0.62, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_WRIST]: { x: 0.8, y: 0.62, z: 0, visibility: 1 },
    });
    const context = computeGarmentTpsContext(
      landmarks,
      validQuality,
      1000,
      1200,
      640,
      480,
      layout,
      undefined,
      fit,
      undefined,
      sourcePoints,
      geometry
    );

    expect(context).not.toBeNull();
    expect(context?.controlPointCount).toBe(10 + sourcePoints.length);
    expect(context?.geometryPointNames).toContain("armholeLeftTop");
    expect(context?.geometryPointNames).toContain("sleeveLeftCuffOuter");
  });

  it("keeps the widened Classic Cotton shoulder targets aligned to the detected body", () => {
    const fit = GARMENT_FIT_PROFILES.CT001;
    const geometry = GARMENT_GEOMETRY_PROFILES.CT001;
    const sourcePoints = getGarmentGeometrySourceFractions(fit, geometry);
    const cropLandmarks = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.35, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.65, y: 0.6, z: 0, visibility: 1 },
      [LANDMARK.LEFT_ELBOW]: { x: 0.2, y: 0.38, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_ELBOW]: { x: 0.8, y: 0.38, z: 0, visibility: 1 },
    });
    const context = computeGarmentTpsContext(
      cropLandmarks,
      validQuality,
      1000,
      1200,
      640,
      480,
      getSourceControlPointFractions(fit),
      undefined,
      fit,
      undefined,
      sourcePoints,
      geometry
    );

    expect(context).not.toBeNull();
    expect(context!.bodyTargetPointsPx[1].x - context!.bodyTargetPointsPx[0].x).toBeGreaterThan(256);
  });

  it("rejects duplicate garment control points before solving TPS", () => {
    const layout = getSourceControlPointFractions();
    layout.leftNeckline = layout.leftShoulder;
    expect(() => computeGarmentTpsContext(validLandmarks, validQuality, 1000, 1200, 640, 480, layout)).toThrow(
      /distinct points/i
    );
  });

  it("body target points scale with the canvas dimensions passed in", () => {
    const smallCanvas = computeGarmentTpsContext(validLandmarks, validQuality, 1000, 1200, 100, 100)!;
    const largeCanvas = computeGarmentTpsContext(validLandmarks, validQuality, 1000, 1200, 1000, 1000)!;

    expect(largeCanvas.bodyTargetPointsPx[0].x).toBeGreaterThan(smallCanvas.bodyTargetPointsPx[0].x);
  });

  it("the mesh grid visibly moves when the detected body moves — proving it's not a fixed overlay", () => {
    const landmarksA = validLandmarks;
    const landmarksB = buildLandmarks({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.1, y: 0.1, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.5, y: 0.1, z: 0, visibility: 1 },
      [LANDMARK.LEFT_HIP]: { x: 0.15, y: 0.5, z: 0, visibility: 1 },
      [LANDMARK.RIGHT_HIP]: { x: 0.45, y: 0.5, z: 0, visibility: 1 },
    });

    const ctxA = computeGarmentTpsContext(landmarksA, validQuality, 1000, 1200, 640, 480)!;
    const ctxB = computeGarmentTpsContext(landmarksB, validQuality, 1000, 1200, 640, 480)!;

    const cornerA = ctxA.meshGridCanvasPoints[0][0];
    const cornerB = ctxB.meshGridCanvasPoints[0][0];
    expect(cornerA.x).not.toBeCloseTo(cornerB.x, 1);
  });

  it("the backward transform maps canvas body points back onto the garment's control points", () => {
    const ctx = computeGarmentTpsContext(validLandmarks, validQuality, 1000, 1200, 640, 480)!;
    const mapped = ctx.backwardTps.transform(ctx.bodyTargetPointsPx[0]);
    expect(mapped.x).toBeCloseTo(ctx.garmentControlPointsPx[0].x, 0);
    expect(mapped.y).toBeCloseTo(ctx.garmentControlPointsPx[0].y, 0);
  });

  it("warps only the alpha-bounded garment and preserves its transparent background", () => {
    const data = new Uint8ClampedArray(100 * 120 * 4);
    for (let y = 10; y < 110; y++) {
      for (let x = 10; x < 90; x++) data[(y * 100 + x) * 4 + 3] = 255;
    }
    const image: ImageDataLike = { data, width: 100, height: 120 };
    const inspection = inspectGarmentImage(image);
    const layout = getGarmentControlPointLayout(image)!;
    const context = computeGarmentTpsContext(validLandmarks, validQuality, 100, 120, 640, 480, layout)!;
    const result = computeGarmentWarp(context, image, inspection.alphaBounds!);

    expect(result.boundingBoxPx.minX).toBeGreaterThan(0);
    expect(result.warped.data.some((_, index) => index % 4 === 3 && result.warped.data[index] > 0)).toBe(true);
    expect(result.warped.data.some((_, index) => index % 4 === 3 && result.warped.data[index] === 0)).toBe(true);
  });

  it("rejects a folded TPS garment projection", () => {
    const context = computeGarmentTpsContext(validLandmarks, validQuality, 100, 120, 640, 480)!;
    const folded = {
      ...context,
      forwardTps: {
        ...context.forwardTps,
        transform: (point: { x: number; y: number }) => ({ x: -point.x, y: point.y }),
      },
    };
    const image: ImageDataLike = {
      data: new Uint8ClampedArray(100 * 120 * 4).fill(255),
      width: 100,
      height: 120,
    };

    expect(() => computeGarmentWarp(folded, image)).toThrow(/folds or inverts/i);
  });
});
