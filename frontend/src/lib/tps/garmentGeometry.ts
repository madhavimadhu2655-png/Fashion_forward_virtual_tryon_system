import { LANDMARK, isReliableLandmark, type PoseLandmarkPoint } from "../poseAnalysis";
import type { GarmentFitProfile } from "./garmentFitProfiles";
import type { Point } from "./tpsMath";

export type GarmentConstruction = "sleeveless" | "short-sleeve" | "long-sleeve" | "off-shoulder" | "halter";
export type NecklineShape = "crew" | "scoop" | "square" | "high" | "off-shoulder" | "halter" | "tie-front";

export interface GarmentGeometryProfile {
  construction: GarmentConstruction;
  neckline: NecklineShape;
  sourceAnchorFractions?: Partial<Record<string, Point>>;
}

export interface NamedGarmentPoint {
  name: string;
  point: Point;
  region: "neckline" | "armhole" | "sleeve" | "torso";
}

export const GARMENT_GEOMETRY_PROFILES: Record<string, GarmentGeometryProfile> = {
  CT001: { construction: "sleeveless", neckline: "square" },
  CT002: { construction: "short-sleeve", neckline: "crew" },
  CT003: {
    construction: "halter",
    neckline: "halter",
    sourceAnchorFractions: {
      armholeLeftTop: { x: 0.348, y: 0.169 },
      armholeRightTop: { x: 0.652, y: 0.169 },
    },
  },
  CT004: {
    construction: "short-sleeve",
    neckline: "crew",
    sourceAnchorFractions: {
      sleeveLeftOuter: { x: 0.109, y: 0.39 },
      sleeveLeftCuffOuter: { x: 0.089, y: 0.45 },
      sleeveRightOuter: { x: 0.883, y: 0.39 },
      sleeveRightCuffOuter: { x: 0.905, y: 0.45 },
    },
  },
  CT005: { construction: "sleeveless", neckline: "scoop" },
  CT006: { construction: "sleeveless", neckline: "scoop" },
  CT007: {
    construction: "off-shoulder",
    neckline: "off-shoulder",
    sourceAnchorFractions: {
      sleeveLeftOuter: { x: 0.073, y: 0.39 },
      sleeveLeftCuffOuter: { x: 0.22, y: 0.45 },
      sleeveRightOuter: { x: 0.894, y: 0.39 },
      sleeveRightCuffOuter: { x: 0.794, y: 0.45 },
    },
  },
  CT008: { construction: "long-sleeve", neckline: "scoop" },
  CT009: { construction: "sleeveless", neckline: "scoop" },
  CT010: { construction: "sleeveless", neckline: "scoop" },
  CT011: { construction: "sleeveless", neckline: "square" },
  CT012: {
    construction: "halter",
    neckline: "halter",
    sourceAnchorFractions: {
      armholeLeftTop: { x: 0.297, y: 0.188 },
      armholeRightTop: { x: 0.688, y: 0.178 },
      halterStrapLeft: { x: 0.325, y: 0.054 },
    },
  },
  CT013: { construction: "sleeveless", neckline: "square" },
  CT014: { construction: "sleeveless", neckline: "scoop" },
  CT015: { construction: "sleeveless", neckline: "high" },
  CT016: { construction: "sleeveless", neckline: "tie-front" },
  CT017: { construction: "sleeveless", neckline: "square" },
  CT018: {
    construction: "sleeveless",
    neckline: "square",
    sourceAnchorFractions: {
      armholeLeftBottom: { x: 0.262, y: 0.451 },
      armholeRightBottom: { x: 0.739, y: 0.453 },
    },
  },
  CT019: { construction: "sleeveless", neckline: "tie-front" },
  CT020: { construction: "sleeveless", neckline: "scoop" },
};

export const GARMENT_GEOMETRY_BY_PRODUCT = GARMENT_GEOMETRY_PROFILES;

export function getGarmentGeometryProfile(productId: string | undefined): GarmentGeometryProfile | null {
  return productId ? GARMENT_GEOMETRY_PROFILES[productId] ?? null : null;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function mirrorX(point: Point): Point {
  return { x: 1 - point.x, y: point.y };
}

function fraction(value: number): number {
  return Math.max(0.015, Math.min(0.985, value));
}

export function getGarmentGeometrySourceFractions(
  fit: GarmentFitProfile,
  geometry: GarmentGeometryProfile
): NamedGarmentPoint[] {
  const { source } = fit;
  const necklineDepth: Record<NecklineShape, number> = {
    crew: 0.075,
    scoop: 0.14,
    square: 0.025,
    high: 0.035,
    "off-shoulder": 0.11,
    halter: 0.12,
    "tie-front": 0.15,
  };
  const shoulderToChest = source.chestY - source.shoulderY;
  const armholeTopInset = geometry.construction === "sleeveless" || geometry.construction === "halter"
    ? fraction(source.shoulderInset + 0.05)
    : fraction(source.shoulderInset + 0.065);
  const armholeBottomInset = geometry.construction === "sleeveless" || geometry.construction === "halter"
    ? fraction(source.chestInset + 0.23)
    : fraction(source.chestInset + 0.12);
  const armholeTopY = fraction(source.shoulderY + shoulderToChest * 0.2);
  const armholeBottomY = fraction(source.shoulderY + shoulderToChest * 0.66);
  const points: NamedGarmentPoint[] = [
    {
      name: "necklineCenter",
      point: { x: 0.5, y: fraction(source.necklineY + necklineDepth[geometry.neckline]) },
      region: "neckline",
    },
    {
      name: "armholeLeftTop",
      point: { x: armholeTopInset, y: armholeTopY },
      region: "armhole",
    },
    {
      name: "armholeLeftBottom",
      point: { x: armholeBottomInset, y: armholeBottomY },
      region: "armhole",
    },
    {
      name: "armholeRightTop",
      point: mirrorX({ x: armholeTopInset, y: armholeTopY }),
      region: "armhole",
    },
    {
      name: "armholeRightBottom",
      point: mirrorX({ x: armholeBottomInset, y: armholeBottomY }),
      region: "armhole",
    },
  ];

  if (geometry.construction === "halter") {
    points.push(
      {
        name: "halterStrapLeft",
        point: { x: fraction(source.shoulderInset + 0.035), y: source.shoulderY },
        region: "neckline",
      },
      {
        name: "halterStrapRight",
        point: mirrorX({ x: fraction(source.shoulderInset + 0.035), y: source.shoulderY }),
        region: "neckline",
      }
    );
  }

  if (geometry.construction === "short-sleeve" || geometry.construction === "off-shoulder") {
    const sleeveY = fraction(source.shoulderY + shoulderToChest * 0.54);
    const cuffY = fraction(source.shoulderY + shoulderToChest * 0.64);
    const sleevePoints: Array<[string, Point]> = [
      ["sleeveLeftCap", { x: fraction(source.shoulderInset + 0.035), y: source.shoulderY + 0.045 }],
      ["sleeveLeftOuter", { x: 0.025, y: sleeveY }],
      ["sleeveLeftCuffInner", { x: 0.19, y: cuffY }],
      ["sleeveLeftCuffOuter", { x: 0.035, y: cuffY - 0.035 }],
    ];
    for (const [name, point] of sleevePoints) points.push({ name, point, region: "sleeve" });
    for (const [name, point] of sleevePoints) {
      points.push({ name: name.replace("Left", "Right"), point: mirrorX(point), region: "sleeve" });
    }
  }

  if (geometry.construction === "long-sleeve") {
    const elbowY = fraction(source.shoulderY + shoulderToChest * 1.18);
    const cuffY = fraction(source.shoulderY + shoulderToChest * 1.8);
    const sleevePoints: Array<[string, Point]> = [
      ["sleeveLeftCap", { x: fraction(source.shoulderInset + 0.035), y: source.shoulderY + 0.045 }],
      ["sleeveLeftElbowInner", { x: 0.2, y: elbowY }],
      ["sleeveLeftElbowOuter", { x: 0.025, y: elbowY }],
      ["sleeveLeftCuffInner", { x: 0.16, y: cuffY }],
      ["sleeveLeftCuffOuter", { x: 0.035, y: cuffY }],
    ];
    for (const [name, point] of sleevePoints) points.push({ name, point, region: "sleeve" });
    for (const [name, point] of sleevePoints) {
      points.push({ name: name.replace("Left", "Right"), point: mirrorX(point), region: "sleeve" });
    }
  }

  return points.map(({ name, point, region }) => ({
    name,
    point: geometry.sourceAnchorFractions?.[name] ?? {
      x: fraction(point.x),
      y: fraction(point.y),
    },
    region,
  }));
}

interface ArmChain {
  shoulder: Point;
  elbow?: Point;
  wrist?: Point;
  side: "Left" | "Right";
}

function getArmChains(landmarks: PoseLandmarkPoint[] | null): ArmChain[] | null {
  if (!landmarks) return null;
  const indexedChains = [
    {
      shoulderIndex: LANDMARK.LEFT_SHOULDER,
      elbowIndex: LANDMARK.LEFT_ELBOW,
      wristIndex: LANDMARK.LEFT_WRIST,
    },
    {
      shoulderIndex: LANDMARK.RIGHT_SHOULDER,
      elbowIndex: LANDMARK.RIGHT_ELBOW,
      wristIndex: LANDMARK.RIGHT_WRIST,
    },
  ];
  const chains = indexedChains.map(({ shoulderIndex, elbowIndex, wristIndex }) => ({
    shoulder: landmarks[shoulderIndex],
    elbow: landmarks[elbowIndex],
    wrist: landmarks[wristIndex],
  }));
  if (chains.some(({ shoulder }) => !isReliableLandmark(shoulder))) {
    return null;
  }
  return chains.map((chain, index) => ({
      ...chain,
      side: index === 0 ? "Left" as const : "Right" as const,
      shoulder: { x: chain.shoulder.x, y: chain.shoulder.y },
      elbow: isReliableLandmark(chain.elbow) ? { x: chain.elbow.x, y: chain.elbow.y } : undefined,
      wrist: isReliableLandmark(chain.wrist) ? { x: chain.wrist.x, y: chain.wrist.y } : undefined,
    }))
    .sort((a, b) => a.shoulder.x - b.shoulder.x)
    .map((chain, index) => ({ ...chain, side: index === 0 ? "Left" as const : "Right" as const }));
}

function normalizeVector(a: Point, b: Point): Point | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

function outwardNormal(a: Point, b: Point, side: "Left" | "Right"): Point | null {
  const direction = normalizeVector(a, b);
  if (!direction) return null;
  const candidates = [{ x: -direction.y, y: direction.x }, { x: direction.y, y: -direction.x }];
  return candidates.find((normal) => (side === "Left" ? normal.x <= 0 : normal.x >= 0)) ?? null;
}

function offset(point: Point, normal: Point, amount: number): Point {
  return { x: point.x + normal.x * amount, y: point.y + normal.y * amount };
}

function addArmTargets(
  targets: NamedGarmentPoint[],
  chain: ArmChain,
  shoulderWidth: number,
  construction: GarmentConstruction
): boolean {
  if (!chain.elbow) return false;
  const upperNormal = outwardNormal(chain.shoulder, chain.elbow, chain.side);
  if (!upperNormal) return false;
  const armholeTop = lerp(chain.shoulder, chain.elbow, 0.16);
  const armholeBottom = lerp(chain.shoulder, chain.elbow, 0.38);
  const armholeInset = shoulderWidth * 0.055;
  targets.push(
    {
      name: `armhole${chain.side}Top`,
      point: offset(armholeTop, upperNormal, -armholeInset),
      region: "armhole",
    },
    {
      name: `armhole${chain.side}Bottom`,
      point: offset(armholeBottom, upperNormal, -armholeInset),
      region: "armhole",
    }
  );

  if (construction === "short-sleeve" || construction === "off-shoulder") {
    const outer = lerp(chain.shoulder, chain.elbow, 0.44);
    const cuffCenter = lerp(chain.shoulder, chain.elbow, 0.62);
    targets.push(
      {
        name: `sleeve${chain.side}Cap`,
        point: offset(chain.shoulder, upperNormal, shoulderWidth * 0.025),
        region: "sleeve",
      },
      {
        name: `sleeve${chain.side}Outer`,
        point: offset(outer, upperNormal, shoulderWidth * 0.11),
        region: "sleeve",
      },
      {
        name: `sleeve${chain.side}CuffInner`,
        point: offset(cuffCenter, upperNormal, -shoulderWidth * 0.075),
        region: "sleeve",
      },
      {
        name: `sleeve${chain.side}CuffOuter`,
        point: offset(cuffCenter, upperNormal, shoulderWidth * 0.075),
        region: "sleeve",
      }
    );
  } else if (construction === "long-sleeve") {
    if (!chain.wrist) return false;
    const forearmNormal = outwardNormal(chain.elbow, chain.wrist, chain.side);
    if (!forearmNormal) return false;
    const elbowInner = offset(chain.elbow, upperNormal, -shoulderWidth * 0.085);
    const elbowOuter = offset(chain.elbow, upperNormal, shoulderWidth * 0.085);
    const cuffInner = offset(chain.wrist, forearmNormal, -shoulderWidth * 0.07);
    const cuffOuter = offset(chain.wrist, forearmNormal, shoulderWidth * 0.07);
    targets.push(
      {
        name: `sleeve${chain.side}Cap`,
        point: offset(chain.shoulder, upperNormal, shoulderWidth * 0.025),
        region: "sleeve",
      },
      { name: `sleeve${chain.side}ElbowInner`, point: elbowInner, region: "sleeve" },
      { name: `sleeve${chain.side}ElbowOuter`, point: elbowOuter, region: "sleeve" },
      { name: `sleeve${chain.side}CuffInner`, point: cuffInner, region: "sleeve" },
      { name: `sleeve${chain.side}CuffOuter`, point: cuffOuter, region: "sleeve" }
    );
  }
  return true;
}

export function getGarmentGeometryTargetPoints(
  landmarks: PoseLandmarkPoint[] | null,
  fit: GarmentFitProfile,
  geometry: GarmentGeometryProfile,
  canvasWidth: number,
  canvasHeight: number
): NamedGarmentPoint[] | null {
  if (!landmarks || ![canvasWidth, canvasHeight].every((dimension) => Number.isFinite(dimension) && dimension > 0)) {
    return null;
  }
  const chains = getArmChains(landmarks);
  if (!chains || (geometry.construction === "long-sleeve" && chains.some((chain) => !chain.elbow || !chain.wrist))) {
    return null;
  }
  const shoulders = [landmarks[LANDMARK.LEFT_SHOULDER], landmarks[LANDMARK.RIGHT_SHOULDER]];
  if (shoulders.some((point) => !isReliableLandmark(point))) return null;
  const shoulderWidth = Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth <= 0) return null;
  const orderedShoulders = [...shoulders].sort((a, b) => a.x - b.x);
  const shoulderMid = lerp(orderedShoulders[0], orderedShoulders[1], 0.5);
  const hips = [landmarks[LANDMARK.LEFT_HIP], landmarks[LANDMARK.RIGHT_HIP]];
  if (hips.some((point) => !isReliableLandmark(point))) return null;
  const orderedHips = [...hips].sort((a, b) => a.x - b.x);
  const hipMid = lerp(orderedHips[0], orderedHips[1], 0.5);
  const torsoVector = { x: hipMid.x - shoulderMid.x, y: hipMid.y - shoulderMid.y };
  const points: NamedGarmentPoint[] = [
    {
      name: "necklineCenter",
      point: {
        x: shoulderMid.x + torsoVector.x * Math.max(0.04, fit.target.necklineT),
        y: shoulderMid.y + torsoVector.y * Math.max(0.04, fit.target.necklineT),
      },
      region: "neckline",
    },
  ];

  if (geometry.construction === "halter") {
    const neckPoint = {
      x: shoulderMid.x,
      y: shoulderMid.y - shoulderWidth * (geometry.neckline === "tie-front" ? 0.12 : 0.09),
    };
    const strapSpread = shoulderWidth * (geometry.neckline === "tie-front" ? 0.18 : 0.13);
    points.push(
      {
        name: "halterStrapLeft",
        point: { x: neckPoint.x - strapSpread, y: neckPoint.y },
        region: "neckline",
      },
      {
        name: "halterStrapRight",
        point: { x: neckPoint.x + strapSpread, y: neckPoint.y },
        region: "neckline",
      }
    );
  }

  for (const chain of chains) {
    if (!addArmTargets(points, chain, shoulderWidth, geometry.construction)) {
      return null;
    }
  }

  const pixelPoints = points.map(({ name, point, region }) => ({
    name,
    point: { x: point.x * canvasWidth, y: point.y * canvasHeight },
    region,
  }));
  const byName = new Map(pixelPoints.map((item) => [item.name, item]));
  const sourceOrder = getGarmentGeometrySourceFractions(fit, geometry);
  if (sourceOrder.some(({ name }) => !byName.has(name))) return null;
  const ordered = sourceOrder.map(({ name }) => byName.get(name)!);
  const unique = new Set(ordered.map(({ point }) => `${point.x.toFixed(5)},${point.y.toFixed(5)}`));
  return unique.size === ordered.length &&
    ordered.every(({ point }) => Number.isFinite(point.x) && Number.isFinite(point.y))
    ? ordered
    : null;
}
