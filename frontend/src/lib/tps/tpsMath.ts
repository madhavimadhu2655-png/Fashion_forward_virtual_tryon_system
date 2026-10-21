/**
 * Thin Plate Spline (2D), following the standard Bookstein formulation.
 *
 * Given N corresponding control point pairs (source_i -> target_i), TPS
 * finds two scalar interpolating functions f_x(x,y) and f_y(x,y), each of
 * the form:
 *
 *   f(x,y) = a1 + ax*x + ay*y + sum_i [ w_i * U(|P_i - (x,y)|) ]
 *
 * where U(r) = r^2 * log(r^2) is the TPS radial basis function (the
 * "bending energy" kernel), and (a1, ax, ay, w_1..w_N) are solved from
 * the linear system:
 *
 *   [ K  P ] [ w ]   [ v ]
 *   [ P' 0 ] [ a ] = [ 0 ]
 *
 * K_ij = U(|P_i - P_j|), P is the (N x 3) matrix of [1, x_i, y_i] rows.
 * f_x and f_y are solved independently (same K/P, different right-hand
 * side), which is why computeTPS below does two solves.
 */

export interface Point {
  x: number;
  y: number;
}

export interface TPSAxisCoefficients {
  weights: number[]; // length N — the w_i above
  affine: [number, number, number]; // [a1, ax, ay]
}

export interface TPSTransform {
  controlPoints: Point[];
  xCoeffs: TPSAxisCoefficients;
  yCoeffs: TPSAxisCoefficients;
  transform(p: Point): Point;
}

/** U(r) using r² directly (avoids an unnecessary sqrt+square round trip).
 * U(0) is defined as 0 by the standard continuous limit of r²·log(r²). */
function radialBasisFromSquaredDistance(r2: number): number {
  if (r2 <= 1e-12) return 0;
  return r2 * Math.log(r2);
}

function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Solves the dense linear system A·x = b via Gaussian elimination with
 * partial pivoting. Fine for the small systems TPS produces here (N+3
 * where N is a handful of control points, e.g. 8 → 11x11) — no need for
 * a full linear-algebra library at this scale.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0 || A.some((row) => row.length !== n) || b.length !== n) {
    throw new Error("solveLinearSystem: matrix must be square and match the vector length.");
  }

  // Augmented matrix, worked on as a copy so the caller's arrays aren't mutated.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) {
        maxVal = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }

    if (maxVal < 1e-14) {
      throw new Error(
        "TPS linear system is singular or near-singular — control points may be duplicated, " +
          "collinear, or too few. Try adding regularization or checking the control point layout."
      );
    }

    if (pivotRow !== col) {
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    }

    const pivotVal = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pivotVal;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Solves for one axis (x or y) of the TPS mapping — computeTPS calls this
 * twice, once per axis, sharing the same control points.
 *
 * `regularization` is added to the diagonal of the K block. At 0, TPS
 * interpolates control points exactly (which is also what makes the
 * system singular when points coincide or are collinear — the matrix
 * has no unique solution). A small positive value both regularizes
 * that numerical instability AND relaxes exact interpolation into an
 * approximation, trading a little precision at the control points for
 * a system that's guaranteed solvable and less sensitive to jittery
 * landmark input.
 */
export function computeTPSAxis(
  points: Point[],
  values: number[],
  regularization: number
): TPSAxisCoefficients {
  const n = points.length;
  if (n < 3) {
    throw new Error("TPS requires at least 3 control points (need enough to define a 2D affine trend).");
  }
  if (values.length !== n) {
    throw new Error("TPS: control point count and target-value count must match.");
  }

  const size = n + 3;
  const L: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let k = radialBasisFromSquaredDistance(squaredDistance(points[i], points[j]));
      if (i === j) k += regularization;
      L[i][j] = k;
    }
    L[i][n] = 1;
    L[i][n + 1] = points[i].x;
    L[i][n + 2] = points[i].y;
    L[n][i] = 1;
    L[n + 1][i] = points[i].x;
    L[n + 2][i] = points[i].y;
  }
  // Bottom-right 3x3 block stays zero, per the standard formulation.

  const rhs = [...values, 0, 0, 0];
  const solved = solveLinearSystem(L, rhs);

  return {
    weights: solved.slice(0, n),
    affine: [solved[n], solved[n + 1], solved[n + 2]],
  };
}

export function evaluateTPSAxis(coeffs: TPSAxisCoefficients, controlPoints: Point[], p: Point): number {
  let sum = coeffs.affine[0] + coeffs.affine[1] * p.x + coeffs.affine[2] * p.y;
  for (let i = 0; i < controlPoints.length; i++) {
    sum += coeffs.weights[i] * radialBasisFromSquaredDistance(squaredDistance(p, controlPoints[i]));
  }
  return sum;
}

/**
 * Fits a full 2D TPS transform mapping sourcePoints[i] -> targetPoints[i]
 * for every i, and returns a `.transform(p)` function that applies that
 * fitted mapping to any point (not just the control points themselves) —
 * this is what makes it a genuine non-rigid warp rather than a lookup
 * table of the original correspondences.
 */
export function computeTPS(
  sourcePoints: Point[],
  targetPoints: Point[],
  regularization = 1e-3
): TPSTransform {
  if (sourcePoints.length !== targetPoints.length) {
    throw new Error("computeTPS: sourcePoints and targetPoints must have the same length.");
  }
  if (sourcePoints.length < 3) {
    throw new Error("TPS requires at least 3 control points (need enough to define a 2D affine trend).");
  }
  if (
    !Number.isFinite(regularization) ||
    regularization < 0 ||
    [...sourcePoints, ...targetPoints].some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) {
    throw new Error("TPS control points and regularization must contain finite, valid values.");
  }

  const sourceFrame = normalizeFrame(sourcePoints);
  const targetFrame = normalizeFrame(targetPoints);
  if (!sourceFrame || !targetFrame) {
    throw new Error("TPS control points must span a two-dimensional area.");
  }
  if (!spansTwoDimensions(sourceFrame.points) || !spansTwoDimensions(targetFrame.points)) {
    throw new Error("TPS control points are collinear or too tightly grouped for a stable fit.");
  }

  const xCoeffs = computeTPSAxis(sourceFrame.points, targetFrame.points.map((p) => p.x), regularization);
  const yCoeffs = computeTPSAxis(sourceFrame.points, targetFrame.points.map((p) => p.y), regularization);
  if ([...xCoeffs.weights, ...xCoeffs.affine, ...yCoeffs.weights, ...yCoeffs.affine].some((v) => !Number.isFinite(v))) {
    throw new Error("TPS solving produced non-finite transform coefficients.");
  }

  return {
    controlPoints: sourcePoints.map((point) => ({ ...point })),
    xCoeffs,
    yCoeffs,
    transform(p: Point): Point {
      const normalized = normalizePoint(p, sourceFrame);
      return {
        x: evaluateTPSAxis(xCoeffs, sourceFrame.points, normalized) * targetFrame.scale + targetFrame.center.x,
        y: evaluateTPSAxis(yCoeffs, sourceFrame.points, normalized) * targetFrame.scale + targetFrame.center.y,
      };
    },
  };
}

interface NormalizedFrame {
  points: Point[];
  center: Point;
  scale: number;
}

function normalizeFrame(points: Point[]): NormalizedFrame | null {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  );
  const meanSquaredDistance =
    points.reduce((sum, point) => sum + squaredDistance(point, center), 0) / points.length;
  const scale = Math.sqrt(meanSquaredDistance);
  if (!Number.isFinite(scale) || scale <= 1e-12) return null;
  return { points: points.map((point) => ({ x: (point.x - center.x) / scale, y: (point.y - center.y) / scale })), center, scale };
}

function normalizePoint(point: Point, frame: NormalizedFrame): Point {
  return {
    x: (point.x - frame.center.x) / frame.scale,
    y: (point.y - frame.center.y) / frame.scale,
  };
}

function spansTwoDimensions(points: Point[]): boolean {
  const tolerance = 1e-7;
  for (let i = 0; i < points.length - 2; i++) {
    for (let j = i + 1; j < points.length - 1; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const area2 =
          (points[j].x - points[i].x) * (points[k].y - points[i].y) -
          (points[j].y - points[i].y) * (points[k].x - points[i].x);
        if (Math.abs(area2) > tolerance) return true;
      }
    }
  }
  return false;
}
