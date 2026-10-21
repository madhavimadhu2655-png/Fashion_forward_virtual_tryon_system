import { LANDMARK, type PoseLandmarkPoint, type PoseQualityResult } from "./poseAnalysis";

export interface GarmentPlacement {
  centerX: number; // normalized 0-1, frame-relative
  centerY: number;
  width: number; // normalized 0-1
  height: number;
  rotationDeg: number;
  shoulderWidth: number; // raw detected shoulder distance — exposed for the debug panel
}

// Configurable — tune these to adjust how garments scale/hang relative to
// detected body geometry. Not hardcoded screen sizes; both are multipliers
// applied to real per-frame landmark measurements.
export const GARMENT_SCALE_FACTOR = 1.15; // garment is slightly wider than bare shoulder distance
export const GARMENT_HEIGHT_RATIO = 0.85; // crop tops cover most but not all of the torso

/**
 * Computes where a crop top would sit, purely from this frame's detected
 * landmarks — every number here is derived geometry, nothing hardcoded.
 * Returns null when the pose isn't valid/front-facing, since placing a
 * garment on an unreliable pose would be misleading.
 */
export function computeGarmentPlacement(
  landmarks: PoseLandmarkPoint[] | null,
  quality: PoseQualityResult
): GarmentPlacement | null {
  if (!landmarks || !quality.pose_valid || quality.orientation !== "front") return null;

  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  const shoulderWidth = Math.sqrt((rightShoulder.x - leftShoulder.x) ** 2 + (rightShoulder.y - leftShoulder.y) ** 2);
  const torsoHeight = Math.abs(hipMidY - shoulderMidY);

  const garmentWidth = shoulderWidth * GARMENT_SCALE_FACTOR;
  const garmentHeight = torsoHeight * GARMENT_HEIGHT_RATIO;

  // Crop top starts roughly at the shoulder line and hangs down from there.
  const centerX = shoulderMidX;
  const centerY = shoulderMidY + garmentHeight / 2;

  const imageLeftShoulder = leftShoulder.x < rightShoulder.x ? leftShoulder : rightShoulder;
  const imageRightShoulder = leftShoulder.x < rightShoulder.x ? rightShoulder : leftShoulder;
  const rotationRad = Math.atan2(
    imageRightShoulder.y - imageLeftShoulder.y,
    imageRightShoulder.x - imageLeftShoulder.x
  );
  const rotationDeg = (rotationRad * 180) / Math.PI;

  return {
    centerX,
    centerY,
    width: garmentWidth,
    height: garmentHeight,
    rotationDeg,
    shoulderWidth: Number(shoulderWidth.toFixed(4)),
  };
}
