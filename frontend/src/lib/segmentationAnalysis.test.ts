import { describe, it, expect } from "vitest";
import { analyzeSegmentation } from "./segmentationAnalysis";

describe("analyzeSegmentation", () => {
  it("handles null or empty mask data safely", () => {
    const res = analyzeSegmentation(null, 0, 0);
    expect(res.person_detected).toBe(false);
    expect(res.person_area_fraction).toBe(0);
    expect(res.confidence).toBe(0);
  });

  it("identifies when person coverage is too small (< 4%)", () => {
    const width = 100;
    const height = 100;
    const mask = new Float32Array(width * height);
    // Fill only 200 pixels (2%)
    for (let i = 0; i < 200; i++) mask[i] = 0.9;

    const res = analyzeSegmentation(mask, width, height);
    expect(res.person_detected).toBe(false);
    expect(res.person_area_fraction).toBeCloseTo(0.02, 2);
    expect(res.message).toBe("Step into the camera frame.");
  });

  it("accurately computes 10% coverage and confidence for standard torso framing", () => {
    const width = 100;
    const height = 100;
    const mask = new Float32Array(width * height);
    // Fill a 25x40 rectangle (1000 pixels = 10% coverage)
    // from x: [35..59] (width 25) and y: [20..59] (height 40)
    for (let y = 20; y < 60; y++) {
      for (let x = 35; x < 60; x++) {
        mask[y * width + x] = 0.95;
      }
    }

    const res = analyzeSegmentation(mask, width, height);
    expect(res.person_detected).toBe(true);
    expect(res.person_area_fraction).toBeCloseTo(0.10, 2);
    expect(res.confidence).toBeGreaterThan(0.9);
    expect(res.message).toBe("Body detected.");
  });

  it("identifies when person is too close (> 90%)", () => {
    const width = 50;
    const height = 50;
    const mask = new Float32Array(width * height);
    mask.fill(0.95); // 100% covered

    const res = analyzeSegmentation(mask, width, height);
    expect(res.person_detected).toBe(true);
    expect(res.person_area_fraction).toBe(1);
    expect(res.message).toBe("Move slightly farther from the camera.");
  });
});
