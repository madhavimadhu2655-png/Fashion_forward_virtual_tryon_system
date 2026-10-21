import { describe, expect, it } from "vitest";
import {
  adjustGarmentFitProfile,
  DEFAULT_GARMENT_FIT_ADJUSTMENTS,
  GARMENT_FIT_PROFILES,
} from "./garmentFitProfiles";
import { computeBodyTargetPoints } from "./controlPoints";
import { LANDMARK, type PoseLandmarkPoint } from "../poseAnalysis";

const visibleTorso: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({
  x: 0.5,
  y: 0.5,
  z: 0,
  visibility: 1,
}));
visibleTorso[LANDMARK.LEFT_SHOULDER] = { x: 0.3, y: 0.2, z: 0, visibility: 1 };
visibleTorso[LANDMARK.RIGHT_SHOULDER] = { x: 0.7, y: 0.2, z: 0, visibility: 1 };
visibleTorso[LANDMARK.LEFT_HIP] = { x: 0.35, y: 0.6, z: 0, visibility: 1 };
visibleTorso[LANDMARK.RIGHT_HIP] = { x: 0.65, y: 0.6, z: 0, visibility: 1 };

describe("adjustGarmentFitProfile", () => {
  it("scales shoulders and body independently and moves the hem with garment length", () => {
    const adjusted = adjustGarmentFitProfile(GARMENT_FIT_PROFILES.CT001, {
      shoulderScale: 1.1,
      torsoScale: 1.2,
      lengthScale: 1.1,
      verticalOffset: 0.03,
      horizontalOffset: -0.02,
    });

    expect(adjusted.target.shoulderWidth).toBeCloseTo(1.02 * 1.1);
    expect(adjusted.target.necklineWidth).toBeCloseTo(0.56 * 1.1);
    expect(adjusted.target.chestWidth).toBeCloseTo(1.08 * 1.2);
    expect(adjusted.target.hemWidth).toBeCloseTo(1.02 * 1.2);
    expect(adjusted.target.necklineT).toBeCloseTo(0.22 * 1.1 + 0.03);
    expect(adjusted.target.chestT).toBeCloseTo(0.36 * 1.1 + 0.03);
    expect(adjusted.target.hemT).toBeCloseTo(0.68 * 1.1 + 0.03);
    expect(adjusted.target.horizontalOffset).toBe(-0.02);
  });

  it("returns the original target geometry for neutral adjustments", () => {
    expect(adjustGarmentFitProfile(
      GARMENT_FIT_PROFILES.CT001,
      DEFAULT_GARMENT_FIT_ADJUSTMENTS,
    )).toEqual(GARMENT_FIT_PROFILES.CT001);
  });

  it("rejects non-finite or out-of-range adjustments", () => {
    expect(() => adjustGarmentFitProfile(GARMENT_FIT_PROFILES.CT001, {
      ...DEFAULT_GARMENT_FIT_ADJUSTMENTS,
      shoulderScale: 1.21,
    })).toThrow("outside their supported range");
    expect(() => adjustGarmentFitProfile(GARMENT_FIT_PROFILES.CT001, {
      ...DEFAULT_GARMENT_FIT_ADJUSTMENTS,
      verticalOffset: Number.NaN,
    })).toThrow("outside their supported range");
  });

  it("keeps every catalog fit profile valid at both manual-adjustment limits", () => {
    const adjustmentLimits = [
      { shoulderScale: 0.8, torsoScale: 0.8, lengthScale: 0.8, verticalOffset: -0.06, horizontalOffset: -0.06 },
      { shoulderScale: 1.2, torsoScale: 1.25, lengthScale: 1.12, verticalOffset: 0.06, horizontalOffset: 0.06 },
    ];
    for (const profile of Object.values(GARMENT_FIT_PROFILES)) {
      for (const adjustments of adjustmentLimits) {
        expect(computeBodyTargetPoints(
          visibleTorso,
          adjustGarmentFitProfile(profile, adjustments),
        )).not.toBeNull();
      }
    }
  });
});
