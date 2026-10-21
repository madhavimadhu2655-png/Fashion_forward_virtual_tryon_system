import type { Point } from "./tpsMath";
import { isReliableLandmark, LANDMARK, type PoseLandmarkPoint } from "../poseAnalysis";
import {
  getGarmentFitProfile,
  type GarmentFitProfile,
} from "./garmentFitProfiles";

export type ControlPointName =
  | "leftShoulder"
  | "rightShoulder"
  | "leftNeckline"
  | "rightNeckline"
  | "upperLeftTorso"
  | "upperCenterTorso"
  | "upperRightTorso"
  | "lowerLeftTorso"
  | "lowerCenterTorso"
  | "lowerRightTorso";

export const CONTROL_POINT_NAMES: ControlPointName[] = [
  "leftShoulder",
  "rightShoulder",
  "leftNeckline",
  "rightNeckline",
  "upperLeftTorso",
  "upperCenterTorso",
  "upperRightTorso",
  "lowerLeftTorso",
  "lowerCenterTorso",
  "lowerRightTorso",
];

export type ControlPointLayout = Record<ControlPointName, Point>;

export const DEFAULT_GARMENT_FIT_PROFILE: GarmentFitProfile = {
  source: {
    shoulderY: 0.04,
    shoulderInset: 0.1,
    necklineY: 0.43,
    necklineInset: 0.25,
    chestY: 0.61,
    chestInset: 0.03,
    hemY: 0.94,
    hemInset: 0.12,
  },
  target: {
    shoulderWidth: 0.9,
    necklineT: 0.17,
    necklineWidth: 0.56,
    chestT: 0.36,
    chestWidth: 0.94,
    hemT: 0.8,
    hemWidth: 0.86,
  },
};

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function makeTargetRow(left: Point, right: Point, widthScale: number): [Point, Point, Point] {
  const center = lerpPoint(left, right, 0.5);
  const inset = (1 - widthScale) / 2;
  return [
    lerpPoint(left, right, inset),
    center,
    lerpPoint(left, right, 1 - inset),
  ];
}

/**
 * Maps silhouette-specific source rows onto the detected torso quadrilateral.
 * Shoulder and hip joints set the torso axes; product profile proportions
 * determine neckline depth and how much narrower each fabric row fits.
 */
export function computeBodyTargetPoints(
  landmarks: PoseLandmarkPoint[] | null,
  fitProfile: GarmentFitProfile = DEFAULT_GARMENT_FIT_PROFILE
): ControlPointLayout | null {
  if (!landmarks) return null;

  const shoulderA = landmarks[LANDMARK.LEFT_SHOULDER];
  const shoulderB = landmarks[LANDMARK.RIGHT_SHOULDER];
  const hipA = landmarks[LANDMARK.LEFT_HIP];
  const hipB = landmarks[LANDMARK.RIGHT_HIP];
  if (![shoulderA, shoulderB, hipA, hipB].every(isReliableLandmark)) return null;

  const [leftShoulder, rightShoulder] =
    shoulderA.x <= shoulderB.x ? [shoulderA, shoulderB] : [shoulderB, shoulderA];
  const [leftHip, rightHip] = hipA.x <= hipB.x ? [hipA, hipB] : [hipB, hipA];

  const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
  const hipWidth = Math.hypot(rightHip.x - leftHip.x, rightHip.y - leftHip.y);
  if (
    ![shoulderWidth, hipWidth, fitProfile.target.shoulderWidth, fitProfile.target.chestWidth,
      fitProfile.target.hemWidth, fitProfile.target.necklineWidth, fitProfile.target.necklineT,
      fitProfile.target.chestT, fitProfile.target.hemT, fitProfile.target.horizontalOffset ?? 0].every(Number.isFinite) ||
    shoulderWidth <= 0 ||
    hipWidth <= shoulderWidth * 0.1 ||
    fitProfile.target.necklineT < -0.3 ||
    fitProfile.target.necklineT >= fitProfile.target.chestT ||
    fitProfile.target.chestT <= 0 ||
    fitProfile.target.hemT <= fitProfile.target.chestT ||
    fitProfile.target.hemT > 1 ||
    fitProfile.target.shoulderWidth <= 0 ||
    fitProfile.target.shoulderWidth > 1.35 ||
    fitProfile.target.chestWidth <= 0 ||
    fitProfile.target.chestWidth > 1.35 ||
    fitProfile.target.hemWidth <= 0 ||
    fitProfile.target.hemWidth > 1.35 ||
    Math.abs(fitProfile.target.horizontalOffset ?? 0) > 0.06 ||
    fitProfile.target.necklineWidth <= 0 ||
    fitProfile.target.necklineWidth >= fitProfile.target.shoulderWidth
  ) {
    return null;
  }

  const atTorsoRow = (t: number, widthScale: number): [Point, Point, Point] => {
    const left = lerpPoint(leftShoulder, leftHip, t);
    const right = lerpPoint(rightShoulder, rightHip, t);
    return makeTargetRow(left, right, widthScale);
  };
  const [shoulderLeft, , shoulderRight] = makeTargetRow(
    leftShoulder,
    rightShoulder,
    fitProfile.target.shoulderWidth
  );
  const [necklineLeft, , necklineRight] = atTorsoRow(
    fitProfile.target.necklineT,
    fitProfile.target.necklineWidth
  );
  const [upperLeftTorso, upperCenterTorso, upperRightTorso] = atTorsoRow(
    fitProfile.target.chestT,
    fitProfile.target.chestWidth
  );
  const [lowerLeftTorso, lowerCenterTorso, lowerRightTorso] = atTorsoRow(
    fitProfile.target.hemT,
    fitProfile.target.hemWidth
  );
  const horizontalOffset = fitProfile.target.horizontalOffset ?? 0;
  const layout = {
    leftShoulder: shoulderLeft,
    rightShoulder: shoulderRight,
    leftNeckline: necklineLeft,
    rightNeckline: necklineRight,
    upperLeftTorso,
    upperCenterTorso,
    upperRightTorso,
    lowerLeftTorso,
    lowerCenterTorso,
    lowerRightTorso,
  };
  for (const point of Object.values(layout)) point.x += horizontalOffset;
  const points = layoutToOrderedPoints(layout);
  const distinct = new Set(points.map(({ x, y }) => `${x.toFixed(5)},${y.toFixed(5)}`));
  return distinct.size === points.length && points.every(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1
  )
    ? layout
    : null;
}

export function layoutToOrderedPoints(layout: ControlPointLayout): Point[] {
  return CONTROL_POINT_NAMES.map((name) => layout[name]);
}

export function generateMeshGrid(rows: number, cols: number): Point[][] {
  const grid: Point[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: Point[] = [];
    for (let c = 0; c <= cols; c++) {
      row.push({ x: c / cols, y: r / rows });
    }
    grid.push(row);
  }
  return grid;
}

export function getSourceControlPointFractions(
  fitProfile: GarmentFitProfile = DEFAULT_GARMENT_FIT_PROFILE
): ControlPointLayout {
  const { source } = fitProfile;
  return {
    leftShoulder: { x: source.shoulderInset, y: source.shoulderY },
    rightShoulder: { x: 1 - source.shoulderInset, y: source.shoulderY },
    leftNeckline: { x: source.necklineInset, y: source.necklineY },
    rightNeckline: { x: 1 - source.necklineInset, y: source.necklineY },
    upperLeftTorso: { x: source.chestInset, y: source.chestY },
    upperCenterTorso: { x: 0.5, y: source.chestY },
    upperRightTorso: { x: 1 - source.chestInset, y: source.chestY },
    lowerLeftTorso: { x: source.hemInset, y: source.hemY },
    lowerCenterTorso: { x: 0.5, y: source.hemY },
    lowerRightTorso: { x: 1 - source.hemInset, y: source.hemY },
  };
}

export function getProductSourceControlPointFractions(productId: string): ControlPointLayout | null {
  const fitProfile = getGarmentFitProfile(productId);
  return fitProfile ? getSourceControlPointFractions(fitProfile) : null;
}
