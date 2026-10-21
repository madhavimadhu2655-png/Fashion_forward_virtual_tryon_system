import { computeTPS, solveLinearSystem, type Point, type TPSTransform } from "./tpsMath";
import {
  DEFAULT_GARMENT_FIT_PROFILE,
  computeBodyTargetPoints,
  getSourceControlPointFractions,
  layoutToOrderedPoints,
  generateMeshGrid,
  CONTROL_POINT_NAMES,
  type ControlPointLayout,
} from "./controlPoints";
import { warpImageData, type ImageDataLike } from "./tpsWarp";
import type { PoseLandmarkPoint, PoseQualityResult } from "../poseAnalysis";
import type { GarmentFitProfile } from "./garmentFitProfiles";
import {
  getGarmentGeometryTargetPoints,
  type GarmentGeometryProfile,
  type NamedGarmentPoint,
} from "./garmentGeometry";

export const TPS_REGULARIZATION = 1e-3;
export const WARP_MAX_DIMENSION = 360;
export const MESH_GRID_ROWS = 6;
export const MESH_GRID_COLS = 4;
export const PLACEHOLDER_GARMENT_DIMENSIONS = { width: 1000, height: 1200 };

export interface GarmentTpsContext {
  forwardTps: TPSTransform;
  backwardTps: TPSTransform;
  garmentControlPointsPx: Point[];
  bodyTargetPointsPx: Point[];
  meshGridCanvasPoints: Point[][];
  canvasWidth: number;
  canvasHeight: number;
  regularization: number;
  controlPointCount: number;
  controlPointNames: string[];
  geometryPointNames: string[];
  warpStrength: number;
  warpWarning: string | null;
}

export function computeGarmentTpsContext(
  landmarks: PoseLandmarkPoint[] | null,
  quality: PoseQualityResult,
  garmentPixelWidth: number,
  garmentPixelHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  controlPointLayout: ControlPointLayout = getSourceControlPointFractions(),
  regularization: number = TPS_REGULARIZATION,
  fitProfile: GarmentFitProfile = DEFAULT_GARMENT_FIT_PROFILE,
  sourceBounds?: { minX: number; minY: number; maxX: number; maxY: number },
  geometrySourcePoints: NamedGarmentPoint[] = [],
  geometryProfile?: GarmentGeometryProfile
): GarmentTpsContext | null {
  if (
    !quality.pose_valid ||
    quality.orientation !== "front" ||
    ![garmentPixelWidth, garmentPixelHeight, canvasWidth, canvasHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return null;
  }

  const bodyTargets = computeBodyTargetPoints(landmarks, fitProfile);
  if (!bodyTargets) return null;

  const garmentControlPointsNorm = layoutToOrderedPoints(controlPointLayout);
  const bodyTargetPointsNorm = layoutToOrderedPoints(bodyTargets);
  const geometryTargets = geometryProfile
    ? getGarmentGeometryTargetPoints(landmarks, fitProfile, geometryProfile, canvasWidth, canvasHeight)
    : [];
  if (
    geometryProfile &&
    (!geometryTargets || geometryTargets.length !== geometrySourcePoints.length ||
      geometryTargets.some((target, index) => target.name !== geometrySourcePoints[index]?.name))
  ) {
    return null;
  }
  const allGarmentControlPointsNorm = [
    ...garmentControlPointsNorm,
    ...geometrySourcePoints.map(({ point }) => point),
  ];
  const allBodyTargetPointsNorm = [
    ...bodyTargetPointsNorm,
    ...(geometryTargets ?? []).map(({ point }) => ({
      x: point.x / canvasWidth + (fitProfile.target.horizontalOffset ?? 0),
      y: point.y / canvasHeight,
    })),
  ];
  if (
    allGarmentControlPointsNorm.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
    ) ||
    hasDuplicatePoints(allGarmentControlPointsNorm) ||
    hasDuplicatePoints(allBodyTargetPointsNorm)
  ) {
    throw new Error("Garment and torso control points must be finite, distinct points within their image bounds.");
  }

  const garmentControlPointsPx = allGarmentControlPointsNorm.map((point) => ({
    x: point.x * garmentPixelWidth,
    y: point.y * garmentPixelHeight,
  }));
  const bodyTargetPointsPx = allBodyTargetPointsNorm.map((point) => ({
    x: point.x * canvasWidth,
    y: point.y * canvasHeight,
  }));
  if (
    [...garmentControlPointsPx, ...bodyTargetPointsPx].some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    return null;
  }

  const forwardTps = computeTPS(garmentControlPointsPx, bodyTargetPointsPx, regularization);
  const backwardTps = computeTPS(bodyTargetPointsPx, garmentControlPointsPx, regularization);
  const forwardAffine = computeAffineTransform(garmentControlPointsPx, bodyTargetPointsPx);
  const backwardAffine = computeAffineTransform(bodyTargetPointsPx, garmentControlPointsPx);
  const sourceFitBounds = sourceBounds ?? boundsOf(garmentControlPointsPx);
  const targetFitBounds = boundsOf(bodyTargetPointsPx);
  const strengths = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0];
  let warpStrength: number | null = null;
  let stableForward: TPSTransform | null = null;
  let stableBackward: TPSTransform | null = null;

  for (const strength of strengths) {
    const candidateForward = blendTransforms(forwardTps, forwardAffine, strength);
    const candidateBackward = blendTransforms(backwardTps, backwardAffine, strength);
    if (
      isNonFolded(candidateForward.transform, sourceFitBounds) &&
      isNonFolded(candidateBackward.transform, targetFitBounds)
    ) {
      warpStrength = strength;
      stableForward = candidateForward;
      stableBackward = candidateBackward;
      break;
    }
  }

  if (warpStrength === null || !stableForward || !stableBackward) {
    throw new Error("No non-folding garment fit could be found for these source and body points.");
  }

  const meshGridCanvasPoints = generateMeshGrid(MESH_GRID_ROWS, MESH_GRID_COLS).map((row) =>
    row.map((point) =>
      stableForward!.transform({ x: point.x * garmentPixelWidth, y: point.y * garmentPixelHeight })
    )
  );
  if (
    meshGridCanvasPoints.some((row) => row.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
  ) {
    throw new Error("The garment fit produced non-finite canvas coordinates.");
  }

  return {
    forwardTps: stableForward,
    backwardTps: stableBackward,
    garmentControlPointsPx,
    bodyTargetPointsPx,
    meshGridCanvasPoints,
    canvasWidth,
    canvasHeight,
    regularization,
    controlPointCount: garmentControlPointsPx.length,
    controlPointNames: [
      ...CONTROL_POINT_NAMES,
      ...geometrySourcePoints.map(({ name }) => name),
    ],
    geometryPointNames: geometrySourcePoints.map(({ name }) => name),
    warpStrength,
    warpWarning:
      warpStrength < 1
        ? `TPS deformation was reduced to ${Math.round(warpStrength * 100)}% to prevent a folded fit.`
        : null,
  };
}

export interface GarmentWarpResult {
  warped: ImageDataLike;
  boundingBoxPx: { minX: number; minY: number; maxX: number; maxY: number };
  processingMs: number;
}

export function computeGarmentWarp(
  context: GarmentTpsContext,
  garmentImageData: ImageDataLike,
  alphaBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): GarmentWarpResult {
  const t0 = performance.now();
  const sourceBounds = alphaBounds ?? findVisibleBounds(garmentImageData);
  if (!sourceBounds) throw new Error("The garment has no visible pixels to transform.");
  if (!isNonFolded(context.forwardTps.transform, sourceBounds)) {
    throw new Error("The TPS fit folds or inverts the visible garment.");
  }

  const boundary: Point[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    boundary.push(
      { x: sourceBounds.minX + (sourceBounds.maxX - sourceBounds.minX) * t, y: sourceBounds.minY },
      { x: sourceBounds.minX + (sourceBounds.maxX - sourceBounds.minX) * t, y: sourceBounds.maxY },
      { x: sourceBounds.minX, y: sourceBounds.minY + (sourceBounds.maxY - sourceBounds.minY) * t },
      { x: sourceBounds.maxX, y: sourceBounds.minY + (sourceBounds.maxY - sourceBounds.minY) * t }
    );
  }
  const projectedBoundary = boundary.map((point) => context.forwardTps.transform(point));
  if (projectedBoundary.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error("The garment boundary could not be projected to the camera.");
  }

  const xs = projectedBoundary.map((point) => point.x);
  const ys = projectedBoundary.map((point) => point.y);
  const marginX = Math.max(2, (Math.max(...xs) - Math.min(...xs)) * 0.015);
  const marginY = Math.max(2, (Math.max(...ys) - Math.min(...ys)) * 0.015);
  const minX = Math.max(0, Math.min(...xs) - marginX);
  const maxX = Math.min(context.canvasWidth, Math.max(...xs) + marginX);
  const minY = Math.max(0, Math.min(...ys) - marginY);
  const maxY = Math.min(context.canvasHeight, Math.max(...ys) + marginY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    throw new Error("The transformed garment bounds fall outside the camera canvas.");
  }

  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);
  const scale = Math.min(1, WARP_MAX_DIMENSION / Math.max(boxW, boxH));
  const destWidth = Math.max(1, Math.round(boxW * scale));
  const destHeight = Math.max(1, Math.round(boxH * scale));
  const warped = warpImageData(garmentImageData, destWidth, destHeight, (dx, dy) => {
    const canvasX = minX + (dx / destWidth) * boxW;
    const canvasY = minY + (dy / destHeight) * boxH;
    return context.backwardTps.transform({ x: canvasX, y: canvasY });
  });

  return {
    warped,
    boundingBoxPx: { minX, minY, maxX, maxY },
    processingMs: performance.now() - t0,
  };
}

function computeAffineTransform(source: Point[], target: Point[]): TPSTransform {
  const sourceFrame = normalizedFrame(source);
  const targetFrame = normalizedFrame(target);
  const normal: number[][] = Array.from({ length: 3 }, () => [0, 0, 0]);
  const valuesX = [0, 0, 0];
  const valuesY = [0, 0, 0];

  for (let i = 0; i < source.length; i++) {
    const { x, y } = sourceFrame.points[i];
    const row = [1, x, y];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) normal[r][c] += row[r] * row[c];
      valuesX[r] += row[r] * targetFrame.points[i].x;
      valuesY[r] += row[r] * targetFrame.points[i].y;
    }
  }

  const x = solveLinearSystem(normal, valuesX) as [number, number, number];
  const y = solveLinearSystem(normal, valuesY) as [number, number, number];
  return {
    controlPoints: source,
    xCoeffs: { weights: source.map(() => 0), affine: x },
    yCoeffs: { weights: source.map(() => 0), affine: y },
    transform(point: Point): Point {
      const normalized = {
        x: (point.x - sourceFrame.center.x) / sourceFrame.scale,
        y: (point.y - sourceFrame.center.y) / sourceFrame.scale,
      };
      return {
        x: (x[0] + x[1] * normalized.x + x[2] * normalized.y) * targetFrame.scale + targetFrame.center.x,
        y: (y[0] + y[1] * normalized.x + y[2] * normalized.y) * targetFrame.scale + targetFrame.center.y,
      };
    },
  };
}

function normalizedFrame(points: Point[]) {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  );
  const scale = Math.sqrt(
    points.reduce((sum, point) => sum + (point.x - center.x) ** 2 + (point.y - center.y) ** 2, 0) / points.length
  );
  if (!Number.isFinite(scale) || scale <= 1e-12) {
    throw new Error("Affine fallback points have no spatial spread.");
  }
  return {
    center,
    scale,
    points: points.map((point) => ({ x: (point.x - center.x) / scale, y: (point.y - center.y) / scale })),
  };
}

function blendTransforms(tps: TPSTransform, affine: TPSTransform, strength: number): TPSTransform {
  return {
    ...tps,
    transform(point: Point): Point {
      const warped = tps.transform(point);
      const linear = affine.transform(point);
      return {
        x: linear.x + (warped.x - linear.x) * strength,
        y: linear.y + (warped.y - linear.y) * strength,
      };
    },
  };
}

function boundsOf(points: Point[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function hasDuplicatePoints(points: Point[]): boolean {
  return new Set(points.map((point) => `${point.x.toFixed(7)},${point.y.toFixed(7)}`)).size !== points.length;
}

function findVisibleBounds(image: ImageDataLike): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

function isNonFolded(
  transform: (point: Point) => Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) return false;
  if (bounds.maxX - bounds.minX <= 1e-8 || bounds.maxY - bounds.minY <= 1e-8) return false;

  const divisions = 8;
  const grid = Array.from({ length: divisions + 1 }, (_, row) =>
    Array.from({ length: divisions + 1 }, (_, column) =>
      transform({
        x: bounds.minX + ((bounds.maxX - bounds.minX) * column) / divisions,
        y: bounds.minY + ((bounds.maxY - bounds.minY) * row) / divisions,
      })
    )
  );
  for (let row = 0; row < divisions; row++) {
    for (let column = 0; column < divisions; column++) {
      const polygon = [grid[row][column], grid[row][column + 1], grid[row + 1][column + 1], grid[row + 1][column]];
      if (polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
      const area = polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0) / 2;
      if (area <= 1e-7) return false;
    }
  }
  return true;
}
