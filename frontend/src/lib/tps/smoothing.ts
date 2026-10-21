import type { PoseLandmarkPoint } from "../poseAnalysis";

/**
 * Smooths landmark positions frame-to-frame using a simple exponential
 * moving average:
 *
 *   smoothed = alpha * current + (1 - alpha) * previous
 *
 * Lower alpha = more smoothing, more lag. Higher alpha = more responsive,
 * more jitter. Configurable via the constructor/setAlpha rather than a
 * hardcoded constant, per the milestone's requirement.
 */
export class LandmarkSmoother {
  private previous: PoseLandmarkPoint[] | null = null;

  constructor(private alpha: number = 0.5) {}

  setAlpha(alpha: number) {
    this.alpha = alpha;
  }

  /** Resets smoothing history — call when the pose is lost, so a
   * reacquired pose doesn't lag toward a stale previous position. */
  reset() {
    this.previous = null;
  }

  smooth(current: PoseLandmarkPoint[] | null): PoseLandmarkPoint[] | null {
    if (!current) {
      this.previous = null;
      return null;
    }

    if (!this.previous || this.previous.length !== current.length) {
      this.previous = current;
      return current;
    }

    const alpha = this.alpha;
    const result = current.map((point, i) => {
      const prev = this.previous![i];
      return {
        x: alpha * point.x + (1 - alpha) * prev.x,
        y: alpha * point.y + (1 - alpha) * prev.y,
        z: alpha * (point.z ?? 0) + (1 - alpha) * (prev.z ?? 0),
        visibility: point.visibility, // visibility itself isn't smoothed — it's a per-frame confidence, not a position
      };
    });

    this.previous = result;
    return result;
  }
}
