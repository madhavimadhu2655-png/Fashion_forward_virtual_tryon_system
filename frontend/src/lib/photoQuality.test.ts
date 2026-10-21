import { describe, expect, it } from "vitest";
import { assessPhotoQuality, imageStats, toGrayscale, type ImageStats } from "./photoQuality";
import { LANDMARK, type PoseLandmarkPoint } from "./poseAnalysis";

const GOOD_STATS: ImageStats = { brightness: 128, contrast: 50, sharpness: 120 };

function pose(overrides: Partial<Record<number, Partial<PoseLandmarkPoint>>> = {}): PoseLandmarkPoint[] {
  const points: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  points[LANDMARK.NOSE] = { x: 0.5, y: 0.15, z: 0, visibility: 0.99 };
  points[LANDMARK.LEFT_SHOULDER] = { x: 0.68, y: 0.3, z: 0, visibility: 0.97 };
  points[LANDMARK.RIGHT_SHOULDER] = { x: 0.32, y: 0.3, z: 0, visibility: 0.97 };
  points[LANDMARK.LEFT_HIP] = { x: 0.62, y: 0.68, z: 0, visibility: 0.93 };
  points[LANDMARK.RIGHT_HIP] = { x: 0.38, y: 0.68, z: 0, visibility: 0.93 };
  for (const [index, value] of Object.entries(overrides)) points[Number(index)] = { ...points[Number(index)], ...value };
  return points;
}

const assess = (poses: PoseLandmarkPoint[][] | null, stats = GOOD_STATS, size = [900, 1200]) =>
  assessPhotoQuality({ width: size[0], height: size[1], stats, poses });
const ids = (report: ReturnType<typeof assess>) => report.issues.map((issue) => issue.id);

describe("assessPhotoQuality", () => {
  it("passes a well-framed, front-facing, sharp photo", () => {
    const report = assess([pose()]);
    expect(report.issues).toEqual([]);
    expect(report.blocking).toBe(false);
  });

  it("blocks when nobody or several people are found", () => {
    expect(ids(assess([]))).toEqual(["no_person"]);
    const multi = assess([pose(), pose()]);
    expect(ids(multi)).toContain("multiple_people");
    expect(multi.blocking).toBe(true);
  });

  it("detects cropped shoulders and torso", () => {
    expect(ids(assess([pose({ [LANDMARK.LEFT_SHOULDER]: { x: 1.01 } })]))).toContain("shoulders_cropped");
    expect(ids(assess([pose({ [LANDMARK.LEFT_HIP]: { visibility: 0.2 } })]))).toContain("torso_cropped");
    expect(ids(assess([pose({ [LANDMARK.RIGHT_HIP]: { y: 0.995 } })]))).toContain("torso_cropped");
  });

  it("detects distance problems", () => {
    const far = pose({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.54 },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.46 },
      [LANDMARK.LEFT_HIP]: { x: 0.53, y: 0.4 },
      [LANDMARK.RIGHT_HIP]: { x: 0.47, y: 0.4 },
    });
    expect(ids(assess([far]))).toContain("too_far");
    const close = pose({ [LANDMARK.LEFT_SHOULDER]: { x: 0.97 }, [LANDMARK.RIGHT_SHOULDER]: { x: 0.03 } });
    expect(ids(assess([close]))).toContain("too_close");
  });

  it("detects a sideways body and tilted shoulders", () => {
    const side = pose({ [LANDMARK.LEFT_SHOULDER]: { x: 0.57 }, [LANDMARK.RIGHT_SHOULDER]: { x: 0.43 } });
    expect(ids(assess([side]))).toContain("angle");
    const tilted = pose({ [LANDMARK.LEFT_SHOULDER]: { y: 0.42 } });
    expect(ids(assess([tilted]))).toContain("tilt");
  });

  it("warns when the torso is partly covered", () => {
    const covered = pose({
      [LANDMARK.LEFT_SHOULDER]: { visibility: 0.62 },
      [LANDMARK.LEFT_HIP]: { visibility: 0.52 },
      [LANDMARK.RIGHT_HIP]: { visibility: 0.55 },
    });
    expect(ids(assess([covered]))).toContain("obscured");
  });

  it("separates blur severity and lighting warnings", () => {
    expect(assess([pose()], { ...GOOD_STATS, sharpness: 5 }).issues[0]).toMatchObject({ id: "blur", severity: "block" });
    expect(assess([pose()], { ...GOOD_STATS, sharpness: 25 }).issues[0]).toMatchObject({ id: "blur", severity: "warn" });
    expect(ids(assess([pose()], { ...GOOD_STATS, brightness: 30 }))).toContain("dark");
    expect(ids(assess([pose()], { ...GOOD_STATS, brightness: 240 }))).toContain("bright");
    expect(ids(assess([pose()], { ...GOOD_STATS, contrast: 10 }))).toContain("low_contrast");
  });

  it("warns on low resolution and says when the body check couldn't run", () => {
    expect(ids(assess([pose()], GOOD_STATS, [300, 420]))).toContain("resolution");
    const noPose = assess(null);
    expect(noPose.checkedPose).toBe(false);
    expect(ids(noPose)).toEqual(["pose_unavailable"]);
    expect(noPose.blocking).toBe(false);
  });

  it("orders blocking issues first", () => {
    const report = assess([pose(), pose()], { ...GOOD_STATS, brightness: 30 });
    expect(report.issues[0].severity).toBe("block");
  });
});

describe("imageStats", () => {
  function image(width: number, height: number, value: (x: number, y: number) => number) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const v = value(x, y);
        rgba.set([v, v, v, 255], (y * width + x) * 4);
      }
    return imageStats(toGrayscale(rgba, width, height), width, height);
  }

  it("scores a sharp checkerboard far above a flat image", () => {
    const sharp = image(32, 32, (x, y) => ((x + y) % 2 ? 255 : 0));
    const flat = image(32, 32, () => 128);
    expect(sharp.sharpness).toBeGreaterThan(1000);
    expect(flat.sharpness).toBe(0);
    expect(flat.brightness).toBeCloseTo(128, 0);
    expect(flat.contrast).toBe(0);
  });

  it("scores a smooth gradient as soft", () => {
    expect(image(64, 64, (x) => x * 4).sharpness).toBeLessThan(1);
  });
});
