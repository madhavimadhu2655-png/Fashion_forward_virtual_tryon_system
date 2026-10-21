import { isReliableLandmark, LANDMARK, type PoseLandmarkPoint } from "./poseAnalysis";
import type { GarmentConstruction } from "./tps/garmentGeometry";

export function createArmOcclusionMask(
  segmentation: Float32Array | null,
  segmentationWidth: number,
  segmentationHeight: number,
  frameWidth: number,
  frameHeight: number,
  landmarks: PoseLandmarkPoint[] | null,
  construction: GarmentConstruction,
  threshold = 0.55
): Uint8ClampedArray | null {
  if (
    !segmentation ||
    segmentation.length !== segmentationWidth * segmentationHeight ||
    ![segmentationWidth, segmentationHeight, frameWidth, frameHeight].every(
      (value) => Number.isInteger(value) && value > 0
    ) ||
    !landmarks
  ) {
    return null;
  }

  const shoulders = [landmarks[LANDMARK.LEFT_SHOULDER], landmarks[LANDMARK.RIGHT_SHOULDER]];
  if (shoulders.some((point) => !isReliableLandmark(point))) return null;
  const shoulderSpan =
    Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y) * frameWidth;
  if (!Number.isFinite(shoulderSpan) || shoulderSpan <= 0) return null;
  const alpha = new Uint8ClampedArray(frameWidth * frameHeight);
  if (construction === "long-sleeve") return alpha;
  const arms = [
    { shoulder: LANDMARK.LEFT_SHOULDER, elbow: LANDMARK.LEFT_ELBOW, wrist: LANDMARK.LEFT_WRIST },
    { shoulder: LANDMARK.RIGHT_SHOULDER, elbow: LANDMARK.RIGHT_ELBOW, wrist: LANDMARK.RIGHT_WRIST },
  ];

  for (const arm of arms) {
    const shoulder = landmarks[arm.shoulder];
    const elbow = landmarks[arm.elbow];
    if (!isReliableLandmark(shoulder) || !isReliableLandmark(elbow)) continue;
    const wrist = landmarks[arm.wrist];
    if (isReliableLandmark(wrist)) {
      const segmentStart = construction === "sleeveless" || construction === "halter"
        ? shoulder
        : elbow;
      rasterizeArmSegment(
        alpha,
        segmentation,
        segmentationWidth,
        segmentationHeight,
        frameWidth,
        frameHeight,
        { x: segmentStart.x * frameWidth, y: segmentStart.y * frameHeight },
        { x: wrist.x * frameWidth, y: wrist.y * frameHeight },
        shoulderSpan * 0.085,
        threshold
      );
    }
  }

  return alpha;
}

function rasterizeArmSegment(
  destination: Uint8ClampedArray,
  segmentation: Float32Array,
  segmentationWidth: number,
  segmentationHeight: number,
  frameWidth: number,
  frameHeight: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  radius: number,
  threshold: number
) {
  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - radius));
  const maxX = Math.min(frameWidth - 1, Math.ceil(Math.max(start.x, end.x) + radius));
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - radius));
  const maxY = Math.min(frameHeight - 1, Math.ceil(Math.max(start.y, end.y) + radius));
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared));
      const distance = Math.hypot(x - (start.x + t * dx), y - (start.y + t * dy));
      if (distance > radius) continue;
      const maskX = Math.min(segmentationWidth - 1, Math.floor((x / frameWidth) * segmentationWidth));
      const maskY = Math.min(segmentationHeight - 1, Math.floor((y / frameHeight) * segmentationHeight));
      const confidence = segmentation[maskY * segmentationWidth + maskX];
      if (!Number.isFinite(confidence) || confidence < threshold) continue;
      const index = y * frameWidth + x;
      destination[index] = Math.max(destination[index], Math.round(Math.min(1, confidence) * 255));
    }
  }
}
