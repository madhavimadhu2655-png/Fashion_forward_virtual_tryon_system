import { describe, expect, it } from "vitest";
import { getGarmentGeometryControlPoints } from "../garmentImage";
import { createArmOcclusionMask } from "../armOcclusion";
import type { ImageDataLike } from "./tpsWarp";
import { GARMENT_FIT_PROFILES } from "./garmentFitProfiles";
import {
  GARMENT_GEOMETRY_PROFILES,
  getGarmentGeometrySourceFractions,
  getGarmentGeometryTargetPoints,
} from "./garmentGeometry";
import { LANDMARK, type PoseLandmarkPoint } from "../poseAnalysis";

function buildLandmarks(overrides: Partial<Record<number, PoseLandmarkPoint>> = {}): PoseLandmarkPoint[] {
  const landmarks: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  for (const [index, point] of Object.entries(overrides)) landmarks[Number(index)] = point!;
  return landmarks;
}

const landmarks = buildLandmarks({
  [LANDMARK.LEFT_SHOULDER]: { x: 0.35, y: 0.2, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_SHOULDER]: { x: 0.65, y: 0.2, z: 0, visibility: 1 },
  [LANDMARK.LEFT_ELBOW]: { x: 0.25, y: 0.4, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_ELBOW]: { x: 0.75, y: 0.4, z: 0, visibility: 1 },
  [LANDMARK.LEFT_WRIST]: { x: 0.2, y: 0.62, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_WRIST]: { x: 0.8, y: 0.62, z: 0, visibility: 1 },
  [LANDMARK.LEFT_HIP]: { x: 0.4, y: 0.6, z: 0, visibility: 1 },
  [LANDMARK.RIGHT_HIP]: { x: 0.6, y: 0.6, z: 0, visibility: 1 },
});

function makeImage(alphaAt: (x: number, y: number) => number): ImageDataLike {
  const width = 120;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alphaAt(x, y);
  }
  return { data, width, height };
}

describe("garment-specific geometry annotations", () => {
  it("distinguishes neckline and sleeve construction using actual product profiles", () => {
    expect(GARMENT_GEOMETRY_PROFILES.CT001.construction).toBe("sleeveless");
    expect(GARMENT_GEOMETRY_PROFILES.CT002.construction).toBe("short-sleeve");
    expect(GARMENT_GEOMETRY_PROFILES.CT003.construction).toBe("halter");
    expect(GARMENT_GEOMETRY_PROFILES.CT007.construction).toBe("off-shoulder");
    expect(GARMENT_GEOMETRY_PROFILES.CT008.construction).toBe("long-sleeve");
    expect(GARMENT_GEOMETRY_PROFILES.CT009.construction).toBe("sleeveless");
    expect(GARMENT_GEOMETRY_PROFILES.CT012.construction).toBe("halter");
    expect(GARMENT_GEOMETRY_PROFILES.CT015.construction).toBe("sleeveless");
    expect(GARMENT_GEOMETRY_PROFILES.CT016.construction).toBe("sleeveless");
    expect(GARMENT_GEOMETRY_PROFILES.CT005.construction).toBe("sleeveless");

    const tank = getGarmentGeometrySourceFractions(GARMENT_FIT_PROFILES.CT005, GARMENT_GEOMETRY_PROFILES.CT005);
    const tee = getGarmentGeometrySourceFractions(GARMENT_FIT_PROFILES.CT002, GARMENT_GEOMETRY_PROFILES.CT002);
    const longsleeve = getGarmentGeometrySourceFractions(GARMENT_FIT_PROFILES.CT008, GARMENT_GEOMETRY_PROFILES.CT008);
    expect(tank.some(({ name }) => name.includes("sleeve"))).toBe(false);
    expect(tee.some(({ name }) => name.includes("sleeve"))).toBe(true);
    expect(longsleeve.some(({ name }) => name.includes("Cuff"))).toBe(true);
    expect(getGarmentGeometrySourceFractions(GARMENT_FIT_PROFILES.CT003, GARMENT_GEOMETRY_PROFILES.CT003)
      .some(({ name }) => name.startsWith("halterStrap"))).toBe(true);
  });

  it("uses per-asset overrides for silhouettes that differ from shared construction templates", () => {
    const teeSleeve = getGarmentGeometrySourceFractions(
      GARMENT_FIT_PROFILES.CT004,
      GARMENT_GEOMETRY_PROFILES.CT004
    );
    expect(teeSleeve.find(({ name }) => name === "sleeveLeftOuter")?.point).toEqual({ x: 0.109, y: 0.39 });

    const offShoulder = getGarmentGeometrySourceFractions(
      GARMENT_FIT_PROFILES.CT007,
      GARMENT_GEOMETRY_PROFILES.CT007
    );
    expect(offShoulder.find(({ name }) => name === "sleeveLeftCuffOuter")?.point).toEqual({ x: 0.22, y: 0.45 });
  });

  it("maps armhole and bent-sleeve targets from pose landmarks in video-pixel coordinates", () => {
    const fit = GARMENT_FIT_PROFILES.CT002;
    const profile = GARMENT_GEOMETRY_PROFILES.CT002;
    const targets = getGarmentGeometryTargetPoints(landmarks, fit, profile, 640, 480)!;
    const armhole = targets.find(({ name }) => name === "armholeLeftTop")!;
    const sleeve = targets.find(({ name }) => name === "sleeveLeftCuffOuter")!;
    expect(armhole.point.x).toBeGreaterThan(0);
    expect(armhole.point.x).toBeLessThan(640);
    expect(armhole.point.x).toBeGreaterThan(
      landmarks[LANDMARK.LEFT_SHOULDER].x * 640 +
      (landmarks[LANDMARK.LEFT_ELBOW].x - landmarks[LANDMARK.LEFT_SHOULDER].x) * 0.16 * 640
    );
    expect(armhole.point.y).toBeGreaterThan(
      landmarks[LANDMARK.LEFT_SHOULDER].y * 480 +
      (landmarks[LANDMARK.LEFT_ELBOW].y - landmarks[LANDMARK.LEFT_SHOULDER].y) * 0.16 * 480
    );
    expect(sleeve.point.y).toBeGreaterThan(armhole.point.y);
  });

  it("uses elbows and wrists for long sleeves and safely rejects missing joints", () => {
    const profile = GARMENT_GEOMETRY_PROFILES.CT008;
    const fit = GARMENT_FIT_PROFILES.CT008;
    expect(getGarmentGeometryTargetPoints(landmarks, fit, profile, 640, 480)).not.toBeNull();
    const missingWrist = [...landmarks];
    missingWrist[LANDMARK.LEFT_WRIST] = { ...landmarks[LANDMARK.LEFT_WRIST], visibility: 0.1 };
    expect(getGarmentGeometryTargetPoints(missingWrist, fit, profile, 640, 480)).toBeNull();
    const missingElbow = [...landmarks];
    missingElbow[LANDMARK.RIGHT_ELBOW] = { ...landmarks[LANDMARK.RIGHT_ELBOW], visibility: 0.1 };
    expect(getGarmentGeometryTargetPoints(missingElbow, fit, GARMENT_GEOMETRY_PROFILES.CT005, 640, 480)).toBeNull();
  });

  it("rejects arm targets with invalid landmark coordinates", () => {
    const invalid = [...landmarks];
    invalid[LANDMARK.LEFT_ELBOW] = { ...landmarks[LANDMARK.LEFT_ELBOW], x: Number.NaN };
    expect(
      getGarmentGeometryTargetPoints(invalid, GARMENT_FIT_PROFILES.CT005, GARMENT_GEOMETRY_PROFILES.CT005, 640, 480)
    ).toBeNull();
  });

  it("snaps armhole controls to the transparent cavity boundary and keeps alpha cutouts", () => {
    const image = makeImage((x, y) => {
      const garment = x >= 10 && x <= 109 && y >= 10 && y <= 109;
      const neckline = x >= 43 && x <= 76 && y <= 32;
      const leftArmhole = x >= 25 && x <= 34 && y >= 26 && y <= 50;
      const rightArmhole = x >= 85 && x <= 94 && y >= 26 && y <= 50;
      return garment && !neckline && !leftArmhole && !rightArmhole ? 255 : 0;
    });
    const points = getGarmentGeometryControlPoints(
      image,
      GARMENT_FIT_PROFILES.CT001,
      GARMENT_GEOMETRY_PROFILES.CT001
    );
    expect(points).not.toBeNull();
    expect(points?.some(({ name }) => name === "armholeLeftTop")).toBe(true);
    for (const { point } of points ?? []) {
      expect(image.data[(Math.round(point.y * image.height) * image.width + Math.round(point.x * image.width)) * 4 + 3])
        .toBeGreaterThan(16);
    }
  });

  it("limits segmentation compositing to reliable arm-shaped foreground pixels", () => {
    const segmentation = new Float32Array(100).fill(0.95);
    const mask = createArmOcclusionMask(
      segmentation,
      10,
      10,
      100,
      100,
      landmarks,
      "sleeveless"
    );
    expect(mask).not.toBeNull();
    expect(mask?.some((alpha) => alpha > 0)).toBe(true);
    expect(createArmOcclusionMask(null, 10, 10, 100, 100, landmarks, "sleeveless")).toBeNull();
    const longSleeveMask = createArmOcclusionMask(
      segmentation,
      10,
      10,
      100,
      100,
      landmarks,
      "long-sleeve"
    );
    expect(longSleeveMask?.every((alpha) => alpha === 0)).toBe(true);
  });
});
