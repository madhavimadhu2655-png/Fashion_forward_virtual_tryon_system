// Landmark indices from the BlazePose 33-point model (same indices used
// by both classic MediaPipe Pose and the current Tasks Vision PoseLandmarker).
export const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export interface PoseLandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Orientation = "front" | "side" | "uncertain";

export interface PoseQualityResult {
  pose_valid: boolean;
  orientation: Orientation;
  confidence: number;
  message: string;
  landmarksDetected: {
    shoulders: boolean;
    hips: boolean;
    wrists: boolean;
  };
}

export interface MeasurementEstimate {
  shoulder_width: number | null;
  hip_width: number | null;
  torso_length: number | null;
  chest_estimate: null; // never computed — see model docstring on the backend
  waist_estimate: null;
}

const VISIBILITY_THRESHOLD = 0.5;
const FRAME_MARGIN = 0.05; // landmarks within this fraction of the edge count as "clipped"

export function isReliableLandmark(landmark: PoseLandmarkPoint | undefined): landmark is PoseLandmarkPoint {
  return (
    landmark !== undefined &&
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    landmark.x >= 0 &&
    landmark.x <= 1 &&
    landmark.y >= 0 &&
    landmark.y <= 1 &&
    Number.isFinite(landmark.visibility) &&
    (landmark.visibility ?? 0) >= VISIBILITY_THRESHOLD
  );
}

function visible(landmarks: PoseLandmarkPoint[], index: number): boolean {
  const lm = landmarks[index];
  return isReliableLandmark(lm);
}

function distance2D(a: PoseLandmarkPoint, b: PoseLandmarkPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midpoint(a: PoseLandmarkPoint, b: PoseLandmarkPoint): PoseLandmarkPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function inFrame(lm: PoseLandmarkPoint): boolean {
  return (
    lm.x >= FRAME_MARGIN &&
    lm.x <= 1 - FRAME_MARGIN &&
    lm.y >= FRAME_MARGIN &&
    lm.y <= 1 - FRAME_MARGIN
  );
}

/**
 * Evaluates whether the current pose is usable, and why not if it isn't.
 * Every threshold here is a heuristic tuned for "good enough to guide the
 * user," not a scientifically validated pose-classification model.
 */
export function analyzePose(landmarks: PoseLandmarkPoint[] | null): PoseQualityResult {
  const empty: PoseQualityResult = {
    pose_valid: false,
    orientation: "uncertain",
    confidence: 0,
    message: "No person detected. Please stand in front of the camera.",
    landmarksDetected: { shoulders: false, hips: false, wrists: false },
  };

  if (!landmarks || landmarks.length === 0) return empty;

  const shouldersVisible = visible(landmarks, LANDMARK.LEFT_SHOULDER) && visible(landmarks, LANDMARK.RIGHT_SHOULDER);
  const hipsVisible = visible(landmarks, LANDMARK.LEFT_HIP) && visible(landmarks, LANDMARK.RIGHT_HIP);
  const wristsVisible = visible(landmarks, LANDMARK.LEFT_WRIST) && visible(landmarks, LANDMARK.RIGHT_WRIST);

  const landmarksDetected = { shoulders: shouldersVisible, hips: hipsVisible, wrists: wristsVisible };

  const coreIndices = [
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.LEFT_HIP,
    LANDMARK.RIGHT_HIP,
  ];
  const coreVisibilities = coreIndices.map((i) => {
    const visibility = landmarks[i]?.visibility;
    return Number.isFinite(visibility) ? Math.max(0, Math.min(1, visibility!)) : 0;
  });
  const confidence = coreVisibilities.reduce((sum, v) => sum + v, 0) / coreIndices.length;

  if (!shouldersVisible) {
    return { ...empty, confidence, message: "Shoulders not visible. Step back or adjust lighting.", landmarksDetected };
  }
  if (!hipsVisible) {
    return {
      ...empty,
      confidence,
      message: "Hips not visible. Make sure your upper body is fully in frame.",
      landmarksDetected,
    };
  }

  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every(isReliableLandmark)) {
    return {
      ...empty,
      confidence,
      message: "Shoulder and hip landmarks need to be clearly visible. Face the camera and improve lighting.",
      landmarksDetected,
    };
  }

  const framingOk = [leftShoulder, rightShoulder, leftHip, rightHip].every(inFrame);
  if (!framingOk) {
    return {
      pose_valid: false,
      orientation: "uncertain",
      confidence,
      message: "Body is partially outside the frame. Step back a little.",
      landmarksDetected,
    };
  }

  const shoulderWidthPx = distance2D(leftShoulder, rightShoulder);
  const shoulderDepthDiff = Math.abs((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));

  let orientation: Orientation;
  if (shoulderWidthPx < 0.08) {
    return {
      pose_valid: false,
      orientation: "uncertain",
      confidence,
      message: "You're too far from the camera. Move closer.",
      landmarksDetected,
    };
  }
  if (shoulderWidthPx > 0.6) {
    return {
      pose_valid: false,
      orientation: "uncertain",
      confidence,
      message: "You're too close to the camera. Step back.",
      landmarksDetected,
    };
  }

  if (shoulderDepthDiff > 0.15 || shoulderWidthPx < 0.12) {
    orientation = "side";
  } else {
    orientation = "front";
  }

  if (orientation !== "front") {
    return {
      pose_valid: false,
      orientation,
      confidence,
      message: "Please stand facing the camera directly.",
      landmarksDetected,
    };
  }

  if (confidence < VISIBILITY_THRESHOLD) {
    return {
      pose_valid: false,
      orientation,
      confidence,
      message: "Pose detection confidence is too low. Improve lighting and try again.",
      landmarksDetected,
    };
  }

  return {
    pose_valid: true,
    orientation: "front",
    confidence,
    message: "Good pose detected.",
    landmarksDetected,
  };
}

/**
 * Returns normalized image-space distances — NOT centimeters. Only
 * computed when the pose is valid and front-facing; otherwise every
 * field is null rather than a guessed number. See the backend
 * BodyMeasurement model for why chest/waist are always null.
 */
export function estimateMeasurements(
  landmarks: PoseLandmarkPoint[] | null,
  quality: PoseQualityResult
): MeasurementEstimate {
  const nullResult: MeasurementEstimate = {
    shoulder_width: null,
    hip_width: null,
    torso_length: null,
    chest_estimate: null,
    waist_estimate: null,
  };

  if (!landmarks || !quality.pose_valid || quality.orientation !== "front") {
    return nullResult;
  }

  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every(isReliableLandmark)) {
    return nullResult;
  }

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const shoulderWidth = distance2D(leftShoulder, rightShoulder);
  const hipWidth = distance2D(leftHip, rightHip);
  const torsoLength = distance2D(shoulderMid, hipMid);
  if (![shoulderWidth, hipWidth, torsoLength].every((value) => Number.isFinite(value) && value > 0 && value <= 1)) {
    return nullResult;
  }

  return {
    shoulder_width: Number(shoulderWidth.toFixed(4)),
    hip_width: Number(hipWidth.toFixed(4)),
    torso_length: Number(torsoLength.toFixed(4)),
    chest_estimate: null,
    waist_estimate: null,
  };
}

// Skeleton connections for drawing — pairs of landmark indices.
export const POSE_CONNECTIONS: [number, number][] = [
  [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW],
  [LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW],
  [LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP],
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP],
  [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP],
  [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
  [LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
  [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
  [LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
];
