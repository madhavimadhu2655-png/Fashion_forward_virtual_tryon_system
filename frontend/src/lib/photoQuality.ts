import { LANDMARK, type PoseLandmarkPoint } from "./poseAnalysis";

/**
 * Pre-generation photo checks. Everything here is a pure function so the
 * thresholds can be tuned and unit-tested in one place.
 *
 * These are heuristic defaults chosen for MediaPipe Pose (lite) output and
 * checked against synthetic cases in photoQuality.test.ts. They have NOT
 * been validated on a labelled photo dataset, and nothing here estimates
 * real body measurements or garment fit — only whether the framing is
 * usable for a front-view try-on.
 */
export const PHOTO_QUALITY_THRESHOLDS = {
  /** Below this the photo is accepted but warned about (hard minimum is 256×384). */
  recommendedWidth: 600,
  recommendedHeight: 800,
  /** Landmarks below this visibility are treated as not seen. */
  minVisibility: 0.5,
  /** Average visibility of shoulders+hips below this suggests the torso is covered. */
  minCoreVisibility: 0.72,
  /** Fraction of the frame edge a landmark must clear. */
  frameMargin: 0.02,
  /** Shoulder span as a fraction of image width. */
  minShoulderSpan: 0.16,
  maxShoulderSpan: 0.8,
  /** Shoulder span ÷ shoulder-to-hip length; front-facing torsos sit well above this. */
  minFrontalRatio: 0.48,
  /** |shoulder height difference| ÷ shoulder span. */
  maxShoulderTilt: 0.18,
  /** Variance of the Laplacian on a ≤512 px greyscale copy. */
  blurBlock: 12,
  blurWarn: 40,
  /** Mean greyscale level 0–255. */
  darkWarn: 60,
  brightWarn: 210,
  /** Standard deviation of greyscale levels. */
  lowContrastWarn: 26,
} as const;

export type QualityThresholds = { [K in keyof typeof PHOTO_QUALITY_THRESHOLDS]: number };

export type QualityIssueId =
  | "resolution"
  | "pose_unavailable"
  | "no_person"
  | "multiple_people"
  | "too_far"
  | "too_close"
  | "shoulders_cropped"
  | "torso_cropped"
  | "outside_frame"
  | "angle"
  | "tilt"
  | "obscured"
  | "blur"
  | "dark"
  | "bright"
  | "low_contrast";

export interface QualityIssue {
  id: QualityIssueId;
  /** "block" issues make a reliable try-on impossible; "warn" issues degrade it. */
  severity: "block" | "warn";
  title: string;
  advice: string;
}

export interface ImageStats {
  brightness: number;
  contrast: number;
  sharpness: number;
}

export interface QualityInput {
  width: number;
  height: number;
  stats: ImageStats;
  /** One landmark list per detected person, or null if pose detection couldn't run. */
  poses: PoseLandmarkPoint[][] | null;
}

export interface QualityReport {
  issues: QualityIssue[];
  blocking: boolean;
  checkedPose: boolean;
  stats: ImageStats;
}

/** Converts RGBA pixels to 0–255 greyscale (Rec.601 luma). */
export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  }
  return gray;
}

export function imageStats(gray: Float32Array, width: number, height: number): ImageStats {
  const count = width * height;
  if (count === 0) return { brightness: 0, contrast: 0, sharpness: 0 };
  let sum = 0;
  for (let i = 0; i < count; i++) sum += gray[i];
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i++) variance += (gray[i] - mean) ** 2;

  // Variance of the 4-neighbour Laplacian — a standard focus measure.
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      lapSum += lap;
      lapSq += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  return {
    brightness: mean,
    contrast: Math.sqrt(variance / count),
    sharpness: lapCount ? lapSq / lapCount - lapMean * lapMean : 0,
  };
}

const seen = (point: PoseLandmarkPoint | undefined, t: QualityThresholds) =>
  point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 0) >= t.minVisibility;

const insideFrame = (point: PoseLandmarkPoint, t: QualityThresholds) =>
  point.x >= t.frameMargin && point.x <= 1 - t.frameMargin && point.y >= t.frameMargin && point.y <= 1 - t.frameMargin;

export function assessPhotoQuality(input: QualityInput, t: QualityThresholds = PHOTO_QUALITY_THRESHOLDS): QualityReport {
  const issues: QualityIssue[] = [];
  const add = (id: QualityIssueId, severity: QualityIssue["severity"], title: string, advice: string) =>
    issues.push({ id, severity, title, advice });

  if (input.width < t.recommendedWidth || input.height < t.recommendedHeight) {
    add(
      "resolution",
      "warn",
      "Low resolution",
      `This photo is ${input.width} × ${input.height} px. Use one at least ${t.recommendedWidth} × ${t.recommendedHeight} px for a sharper result.`,
    );
  }

  const { stats } = input;
  if (stats.sharpness < t.blurBlock) {
    add("blur", "block", "Photo is too blurry", "Hold the camera steady, tap to focus on your torso and retake the photo.");
  } else if (stats.sharpness < t.blurWarn) {
    add("blur", "warn", "Photo looks soft", "A sharper photo gives cleaner garment edges. Retake it in steady light if you can.");
  }
  if (stats.brightness < t.darkWarn) {
    add("dark", "warn", "Photo is dark", "Face a window or turn on more light; avoid strong light behind you.");
  } else if (stats.brightness > t.brightWarn) {
    add("bright", "warn", "Photo is overexposed", "Move out of direct sun or away from a bright background.");
  }
  if (stats.contrast < t.lowContrastWarn) {
    add("low_contrast", "warn", "Low contrast", "Stand against a plain background that contrasts with your clothing.");
  }

  if (input.poses === null) {
    add(
      "pose_unavailable",
      "warn",
      "Body check unavailable",
      "The pose model couldn't load, so framing wasn't checked. Use a front-facing photo with shoulders and hips visible.",
    );
    return finish(issues, false, stats);
  }
  if (input.poses.length === 0) {
    add("no_person", "block", "No person found", "Use a photo where one person faces the camera, upper body clearly visible.");
    return finish(issues, true, stats);
  }
  if (input.poses.length > 1) {
    add(
      "multiple_people",
      "block",
      `${input.poses.length} people detected`,
      "Crop the photo to just the person trying on the top, or retake it alone.",
    );
  }

  const pose = input.poses[0];
  const ls = pose[LANDMARK.LEFT_SHOULDER];
  const rs = pose[LANDMARK.RIGHT_SHOULDER];
  const lh = pose[LANDMARK.LEFT_HIP];
  const rh = pose[LANDMARK.RIGHT_HIP];

  const shouldersSeen = seen(ls, t) && seen(rs, t);
  const hipsSeen = seen(lh, t) && seen(rh, t);
  if (!shouldersSeen || !insideFrame(ls, t) || !insideFrame(rs, t)) {
    add("shoulders_cropped", "block", "Shoulders are cut off", "Step back or tilt the camera so both shoulders are fully inside the photo.");
  }
  if (!hipsSeen || !insideFrame(lh, t) || !insideFrame(rh, t)) {
    add("torso_cropped", "block", "Torso is cut off", "Include everything down to your hips so the crop top's length can be placed.");
  }

  const nose = pose[LANDMARK.NOSE];
  if (nose && (nose.y < 0 || nose.x < 0 || nose.x > 1)) {
    add("outside_frame", "warn", "Partly outside the frame", "Centre yourself in the photo with a little space above your head.");
  }

  if (shouldersSeen) {
    const aspect = input.width / Math.max(1, input.height);
    const span = Math.hypot(ls.x - rs.x, (ls.y - rs.y) / aspect);
    if (span < t.minShoulderSpan) {
      add("too_far", "block", "You're too far away", "Move closer or crop the photo so your upper body fills more of it.");
    } else if (span > t.maxShoulderSpan) {
      add("too_close", "block", "You're too close", "Step back so your shoulders and hips both fit with some margin.");
    }
    if (Math.abs(ls.y - rs.y) / aspect / Math.max(span, 1e-6) > t.maxShoulderTilt) {
      add("tilt", "warn", "Shoulders are tilted", "Stand straight with level shoulders and the camera at chest height.");
    }
    if (hipsSeen) {
      const torso = Math.hypot((ls.x + rs.x - lh.x - rh.x) / 2, (ls.y + rs.y - lh.y - rh.y) / 2 / aspect);
      if (torso > 0 && span / torso < t.minFrontalRatio) {
        add("angle", "block", "Body is turned sideways", "Face the camera directly — the try-on is front-view only.");
      }
    }
  }

  const core = [ls, rs, lh, rh].map((p) => Math.min(1, Math.max(0, p?.visibility ?? 0)));
  const coreVisibility = core.reduce((a, b) => a + b, 0) / core.length;
  if (shouldersSeen && hipsSeen && coreVisibility < t.minCoreVisibility) {
    add("obscured", "warn", "Upper body is partly covered", "Move hair, bags or crossed arms away from your torso and retake.");
  }

  return finish(issues, true, stats);
}

function finish(issues: QualityIssue[], checkedPose: boolean, stats: ImageStats): QualityReport {
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
  return { issues, blocking: issues.some((issue) => issue.severity === "block"), checkedPose, stats };
}
