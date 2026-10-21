import { describe, it, expect } from "vitest";
import { LandmarkSmoother } from "./smoothing";
import type { PoseLandmarkPoint } from "../poseAnalysis";

function point(x: number, y: number): PoseLandmarkPoint {
  return { x, y, z: 0, visibility: 1 };
}

describe("LandmarkSmoother", () => {
  it("passes the first frame through unchanged (nothing to smooth against yet)", () => {
    const smoother = new LandmarkSmoother(0.5);
    const first = [point(0.5, 0.5)];
    const result = smoother.smooth(first);
    expect(result).toEqual(first);
  });

  it("blends toward the new position rather than jumping instantly", () => {
    const smoother = new LandmarkSmoother(0.5);
    smoother.smooth([point(0, 0)]);
    const result = smoother.smooth([point(1, 1)])!;

    // With alpha=0.5, halfway between 0 and 1.
    expect(result[0].x).toBeCloseTo(0.5, 5);
    expect(result[0].y).toBeCloseTo(0.5, 5);
  });

  it("converges toward a held-steady position over repeated frames", () => {
    const smoother = new LandmarkSmoother(0.3);
    smoother.smooth([point(0, 0)]);
    let result = [point(0, 0)];
    for (let i = 0; i < 30; i++) {
      result = smoother.smooth([point(1, 1)])!;
    }
    expect(result[0].x).toBeCloseTo(1, 3);
    expect(result[0].y).toBeCloseTo(1, 3);
  });

  it("a lower alpha smooths more (moves less per frame) than a higher alpha", () => {
    const lowAlpha = new LandmarkSmoother(0.1);
    const highAlpha = new LandmarkSmoother(0.9);

    lowAlpha.smooth([point(0, 0)]);
    highAlpha.smooth([point(0, 0)]);

    const lowResult = lowAlpha.smooth([point(1, 0)])!;
    const highResult = highAlpha.smooth([point(1, 0)])!;

    expect(lowResult[0].x).toBeLessThan(highResult[0].x);
  });

  it("resets cleanly when the pose is lost, avoiding a lag toward a stale position", () => {
    const smoother = new LandmarkSmoother(0.3);
    smoother.smooth([point(0, 0)]);
    smoother.smooth(null); // pose lost
    const result = smoother.smooth([point(5, 5)]); // pose reacquired, far away

    // Should snap to the new position immediately (first-frame-after-reset
    // behavior), not creep slowly from the old (0,0).
    expect(result).toEqual([point(5, 5)]);
  });

  it("does not smooth the visibility value as if it were a position", () => {
    const smoother = new LandmarkSmoother(0.5);
    smoother.smooth([{ x: 0, y: 0, z: 0, visibility: 0.9 }]);
    const result = smoother.smooth([{ x: 1, y: 1, z: 0, visibility: 0.4 }])!;
    expect(result[0].visibility).toBe(0.4); // passed through as-is, not blended to 0.65
  });
});
