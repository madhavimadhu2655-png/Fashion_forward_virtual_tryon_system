import { describe, it, expect } from "vitest";
import { computeTPS, computeTPSAxis, solveLinearSystem, type Point } from "./tpsMath";

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function approxEqual(a: number, b: number, tolerance = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

function approxPoint(p: Point, expected: Point, tolerance = 1e-6) {
  approxEqual(p.x, expected.x, tolerance);
  approxEqual(p.y, expected.y, tolerance);
}

describe("solveLinearSystem", () => {
  it("solves a simple known system", () => {
    // 2x + y = 5, x + 3y = 10  →  x=1, y=3
    const x = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10]
    );
    approxEqual(x[0], 1);
    approxEqual(x[1], 3);
  });

  it("throws on a singular matrix rather than returning garbage", () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4], // linearly dependent on row 1
        ],
        [1, 2]
      )
    ).toThrow();
  });
});

describe("TPS — identity transformation", () => {
  it("maps every point to itself when source === target", () => {
    const tps = computeTPS(square, square, 0);
    approxPoint(tps.transform({ x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
    approxPoint(tps.transform({ x: 0.2, y: 0.8 }), { x: 0.2, y: 0.8 });
    // Also true well outside the control points' convex hull — this is
    // the affine part doing its job, not just interpolation between knowns.
    approxPoint(tps.transform({ x: 5, y: -3 }), { x: 5, y: -3 });
  });
});

describe("TPS — pure translation", () => {
  it("reproduces an exact translation for ANY point, not just control points", () => {
    const offset = { x: 0.3, y: -0.15 };
    const target = square.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
    const tps = computeTPS(square, target, 0);

    // Translation is affine — TPS's affine term alone should capture it
    // exactly, meaning the non-rigid weights contribute ~0 everywhere.
    approxPoint(tps.transform({ x: 0.5, y: 0.5 }), { x: 0.5 + offset.x, y: 0.5 + offset.y });
    approxPoint(tps.transform({ x: -2, y: 4 }), { x: -2 + offset.x, y: 4 + offset.y });
  });
});

describe("TPS — pure scaling", () => {
  it("reproduces a uniform scale about the origin exactly", () => {
    const scale = 1.8;
    const target = square.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const tps = computeTPS(square, target, 0);

    approxPoint(tps.transform({ x: 0.4, y: 0.7 }), { x: 0.4 * scale, y: 0.7 * scale });
    approxPoint(tps.transform({ x: 2, y: 3 }), { x: 2 * scale, y: 3 * scale });
  });
});

describe("TPS — pure rotation", () => {
  it("reproduces a rotation about the origin exactly", () => {
    const angle = Math.PI / 6; // 30 degrees
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotate = (p: Point): Point => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
    const target = square.map(rotate);
    const tps = computeTPS(square, target, 0);

    const testPoint = { x: 0.5, y: 0.5 };
    approxPoint(tps.transform(testPoint), rotate(testPoint), 1e-5);
  });
});

describe("TPS — genuine non-rigid deformation", () => {
  it("is NOT a pure affine map when one control point moves independently", () => {
    // Move only the top-right corner outward — this can't be captured
    // by any single affine (linear + translation) map of the whole
    // square, so a correct TPS solution must use non-zero weights.
    const target: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1.6, y: 1.6 }, // perturbed corner
      { x: 0, y: 1 },
    ];
    const tps = computeTPS(square, target, 0);

    // The perturbed corner should map (near) exactly to its target.
    approxPoint(tps.transform(square[2]), target[2], 1e-4);

    // The far corner (0,0) — diagonally opposite the perturbation —
    // should stay close to its own unperturbed target, since a
    // localized bump shouldn't equally distort the whole shape the
    // way a global affine transform would.
    const farCorner = tps.transform(square[0]);
    approxPoint(farCorner, target[0], 1e-4);

    // Directly demonstrate non-rigidity: the fitted weights (the
    // non-affine part of the solution) are non-trivial, not ~0 as they
    // would be for a purely affine (rigid/scale/rotate) fit.
    const weightMagnitude = tps.xCoeffs.weights.reduce((sum, w) => sum + Math.abs(w), 0);
    expect(weightMagnitude).toBeGreaterThan(1e-3);
  });

  it("cannot be reproduced by any single affine map — the definitive non-rigidity proof", () => {
    // A 2D affine map is uniquely determined by any 3 non-collinear point
    // correspondences. Here, corners 0, 1, and 3 map to themselves
    // (identity), and since 3 non-collinear identity correspondences
    // uniquely determine the identity affine map, ANY pure affine
    // (rigid/scale/rotate/translate) transform consistent with those
    // three corners MUST be the identity — it has no freedom left to
    // also satisfy corner 2's independent perturbation.
    const target: Point[] = [
      { x: 0, y: 0 }, // unchanged
      { x: 1, y: 0 }, // unchanged
      { x: 1.9, y: 1.1 }, // perturbed — inconsistent with an identity affine map
      { x: 0, y: 1 }, // unchanged
    ];
    const tps = computeTPS(square, target, 0);

    // TPS (unlike a pure affine map) actually interpolates ALL FOUR
    // corners, including the one no affine map through the other three
    // could reach — this is only possible because TPS is non-rigid.
    const warpedCorner = tps.transform(square[2]);
    approxPoint(warpedCorner, target[2], 1e-4);

    // Explicitly confirm it's NOT the identity-affine prediction a rigid
    // fit through the other 3 corners would have given.
    const identityAffinePrediction = square[2]; // (1,1) — what identity would predict
    const deviation = distance(warpedCorner, identityAffinePrediction);
    expect(deviation).toBeGreaterThan(0.5); // it landed near (1.9,1.1), nowhere near (1,1)
  });
});

describe("TPS — coincident and near-coincident points", () => {
  it("does not produce NaN/Infinity when two control points coincide, given regularization", () => {
    const sourceWithDuplicate: Point[] = [...square, { x: 0, y: 0 }]; // duplicate of first point
    const targetWithDuplicate: Point[] = [...square, { x: 0.1, y: 0.1 }];

    const tps = computeTPS(sourceWithDuplicate, targetWithDuplicate, 1e-3);
    const result = tps.transform({ x: 0.5, y: 0.5 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });

  it("does not blow up for nearly-coincident points", () => {
    const source: Point[] = [...square, { x: 1e-9, y: 1e-9 }];
    const target: Point[] = [...square, { x: 0.05, y: 0.05 }];

    const tps = computeTPS(source, target, 1e-3);
    const result = tps.transform({ x: 0.5, y: 0.5 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    // A reasonable query point shouldn't produce a wildly out-of-range result.
    expect(Math.abs(result.x)).toBeLessThan(100);
    expect(Math.abs(result.y)).toBeLessThan(100);
  });
});

describe("TPS — regularization actually relaxes the fit", () => {
  it("fits control points more loosely as regularization increases", () => {
    const target: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1.6, y: 1.6 },
      { x: 0, y: 1 },
    ];

    const exact = computeTPS(square, target, 1e-8);
    const regularized = computeTPS(square, target, 1.0);

    const exactError = distance(exact.transform(square[2]), target[2]);
    const regularizedError = distance(regularized.transform(square[2]), target[2]);

    // With near-zero regularization, TPS interpolates control points
    // almost exactly. With strong regularization, it deliberately
    // trades that off — so the fit error at the control point itself
    // should measurably increase.
    expect(exactError).toBeLessThan(1e-3);
    expect(regularizedError).toBeGreaterThan(exactError);
  });
});

describe("TPS — invalid control points", () => {
  it("throws a clear error for fewer than 3 points", () => {
    expect(() => computeTPS([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toThrow(/at least 3/i);
  });

  it("throws a clear error when source/target counts don't match", () => {
    expect(() => computeTPS(square, square.slice(0, 3))).toThrow(/same length/i);
  });

  it("throws a clear error for collinear points with no regularization", () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(() => computeTPSAxis(collinear, [0, 1, 2], 0)).toThrow();
  });

  it("rejects collinear TPS correspondences before attempting a warp", () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(() => computeTPS(collinear, collinear)).toThrow(/collinear/i);
  });

  it("rejects non-finite points and invalid regularization", () => {
    expect(() => computeTPS([...square.slice(0, 3), { x: Number.NaN, y: 1 }], square)).toThrow(/finite/i);
    expect(() => computeTPS(square, square, -1)).toThrow(/finite/i);
  });
});

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
