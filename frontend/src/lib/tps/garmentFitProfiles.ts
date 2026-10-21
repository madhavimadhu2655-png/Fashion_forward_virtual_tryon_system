export interface GarmentFitProfile {
  source: {
    shoulderY: number;
    shoulderInset: number;
    necklineY: number;
    necklineInset: number;
    chestY: number;
    chestInset: number;
    hemY: number;
    hemInset: number;
  };
  target: {
    shoulderWidth: number;
    necklineT: number;
    necklineWidth: number;
    chestT: number;
    chestWidth: number;
    hemT: number;
    hemWidth: number;
    horizontalOffset?: number;
  };
}

export interface GarmentFitAdjustments {
  shoulderScale: number;
  torsoScale: number;
  lengthScale: number;
  verticalOffset: number;
  horizontalOffset: number;
}

export const DEFAULT_GARMENT_FIT_ADJUSTMENTS: GarmentFitAdjustments = {
  shoulderScale: 1,
  torsoScale: 1,
  lengthScale: 1,
  verticalOffset: 0,
  horizontalOffset: 0,
};

export function adjustGarmentFitProfile(
  fitProfile: GarmentFitProfile,
  adjustments: GarmentFitAdjustments
): GarmentFitProfile {
  const { shoulderScale, torsoScale, lengthScale, verticalOffset, horizontalOffset } = adjustments;
  if (
    ![shoulderScale, torsoScale, lengthScale, verticalOffset, horizontalOffset].every(Number.isFinite) ||
    shoulderScale < 0.8 || shoulderScale > 1.2 ||
    torsoScale < 0.8 || torsoScale > 1.25 ||
    lengthScale < 0.8 || lengthScale > 1.12 ||
    verticalOffset < -0.06 || verticalOffset > 0.06 ||
    horizontalOffset < -0.06 || horizontalOffset > 0.06
  ) {
    throw new Error("The manual garment-fit adjustments are outside their supported range.");
  }

  return {
    source: fitProfile.source,
    target: {
      ...fitProfile.target,
      shoulderWidth: fitProfile.target.shoulderWidth * shoulderScale,
      necklineWidth: fitProfile.target.necklineWidth * shoulderScale,
      necklineT: fitProfile.target.necklineT * lengthScale + verticalOffset,
      chestWidth: fitProfile.target.chestWidth * torsoScale,
      chestT: fitProfile.target.chestT * lengthScale + verticalOffset,
      hemWidth: fitProfile.target.hemWidth * torsoScale,
      hemT: fitProfile.target.hemT * lengthScale + verticalOffset,
      ...(horizontalOffset === 0 ? {} : { horizontalOffset }),
    },
  };
}

function profile(
  source: GarmentFitProfile["source"],
  target: GarmentFitProfile["target"]
): GarmentFitProfile {
  return { source, target };
}

// Source points are fractions of the visible alpha bounds, not the PNG
// canvas. Each profile follows the actual neckline, shoulder construction,
// chest and hem in that product's isolated garment image.
export const GARMENT_FIT_PROFILES: Record<string, GarmentFitProfile> = {
  CT001: profile(
    { shoulderY: 0.04, shoulderInset: 0.1, necklineY: 0.43, necklineInset: 0.25, chestY: 0.61, chestInset: 0.03, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 1.02, necklineT: 0.22, necklineWidth: 0.56, chestT: 0.36, chestWidth: 1.08, hemT: 0.68, hemWidth: 1.02 }
  ),
  CT002: profile(
    { shoulderY: 0.23, shoulderInset: 0.27, necklineY: 0.16, necklineInset: 0.4, chestY: 0.56, chestInset: 0.24, hemY: 0.93, hemInset: 0.25 },
    { shoulderWidth: 0.94, necklineT: 0.03, necklineWidth: 0.48, chestT: 0.35, chestWidth: 1.02, hemT: 0.8, hemWidth: 0.98 }
  ),
  CT003: profile(
    { shoulderY: 0.1, shoulderInset: 0.28, necklineY: 0.27, necklineInset: 0.35, chestY: 0.56, chestInset: 0.08, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.84, necklineT: 0.08, necklineWidth: 0.42, chestT: 0.34, chestWidth: 0.91, hemT: 0.8, hemWidth: 0.86 }
  ),
  CT004: profile(
    { shoulderY: 0.2, shoulderInset: 0.28, necklineY: 0.16, necklineInset: 0.39, chestY: 0.55, chestInset: 0.22, hemY: 0.92, hemInset: 0.2 },
    { shoulderWidth: 1.02, necklineT: 0.03, necklineWidth: 0.48, chestT: 0.34, chestWidth: 1.06, hemT: 0.8, hemWidth: 1.04 }
  ),
  CT005: profile(
    { shoulderY: 0.05, shoulderInset: 0.13, necklineY: 0.4, necklineInset: 0.29, chestY: 0.6, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.92, necklineT: 0.14, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.96, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT006: profile(
    { shoulderY: 0.02, shoulderInset: 0.12, necklineY: 0.44, necklineInset: 0.28, chestY: 0.61, chestInset: 0.04, hemY: 0.93, hemInset: 0.11 },
    { shoulderWidth: 0.9, necklineT: 0.16, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.96, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT007: profile(
    { shoulderY: 0.24, shoulderInset: 0.08, necklineY: 0.29, necklineInset: 0.27, chestY: 0.56, chestInset: 0.22, hemY: 0.78, hemInset: 0.3 },
    { shoulderWidth: 1, necklineT: 0.1, necklineWidth: 0.6, chestT: 0.34, chestWidth: 0.98, hemT: 0.8, hemWidth: 0.92 }
  ),
  CT008: profile(
    { shoulderY: 0.17, shoulderInset: 0.29, necklineY: 0.16, necklineInset: 0.4, chestY: 0.54, chestInset: 0.2, hemY: 0.62, hemInset: 0.32 },
    { shoulderWidth: 0.96, necklineT: 0.03, necklineWidth: 0.48, chestT: 0.35, chestWidth: 0.96, hemT: 0.81, hemWidth: 0.92 }
  ),
  CT009: profile(
    { shoulderY: 0.18, shoulderInset: 0.08, necklineY: 0.44, necklineInset: 0.28, chestY: 0.61, chestInset: 0.04, hemY: 0.94, hemInset: 0.11 },
    { shoulderWidth: 0.9, necklineT: 0.16, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.96, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT010: profile(
    { shoulderY: 0.05, shoulderInset: 0.13, necklineY: 0.32, necklineInset: 0.27, chestY: 0.59, chestInset: 0.04, hemY: 0.93, hemInset: 0.12 },
    { shoulderWidth: 0.9, necklineT: 0.1, necklineWidth: 0.52, chestT: 0.35, chestWidth: 0.94, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT011: profile(
    { shoulderY: 0.04, shoulderInset: 0.13, necklineY: 0.41, necklineInset: 0.28, chestY: 0.61, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.92, necklineT: 0.15, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.98, hemT: 0.8, hemWidth: 0.92 }
  ),
  CT012: profile(
    { shoulderY: 0.08, shoulderInset: 0.3, necklineY: 0.28, necklineInset: 0.34, chestY: 0.57, chestInset: 0.08, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.84, necklineT: 0.08, necklineWidth: 0.44, chestT: 0.34, chestWidth: 0.91, hemT: 0.8, hemWidth: 0.87 }
  ),
  CT013: profile(
    { shoulderY: 0.03, shoulderInset: 0.12, necklineY: 0.4, necklineInset: 0.27, chestY: 0.6, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.91, necklineT: 0.14, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.97, hemT: 0.8, hemWidth: 0.91 }
  ),
  CT014: profile(
    { shoulderY: 0.06, shoulderInset: 0.14, necklineY: 0.37, necklineInset: 0.29, chestY: 0.6, chestInset: 0.05, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.91, necklineT: 0.13, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.95, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT015: profile(
    { shoulderY: 0.1, shoulderInset: 0.19, necklineY: 0.12, necklineInset: 0.37, chestY: 0.55, chestInset: 0.1, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.9, necklineT: 0.02, necklineWidth: 0.48, chestT: 0.35, chestWidth: 0.92, hemT: 0.8, hemWidth: 0.88 }
  ),
  CT016: profile(
    { shoulderY: 0.02, shoulderInset: 0.13, necklineY: 0.42, necklineInset: 0.29, chestY: 0.59, chestInset: 0.05, hemY: 0.78, hemInset: 0.12 },
    { shoulderWidth: 0.92, necklineT: 0.15, necklineWidth: 0.54, chestT: 0.35, chestWidth: 0.98, hemT: 0.77, hemWidth: 0.92 }
  ),
  CT017: profile(
    { shoulderY: 0.12, shoulderInset: 0.13, necklineY: 0.5, necklineInset: 0.32, chestY: 0.61, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.91, necklineT: 0.16, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.96, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT018: profile(
    { shoulderY: 0.05, shoulderInset: 0.13, necklineY: 0.46, necklineInset: 0.28, chestY: 0.6, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.91, necklineT: 0.14, necklineWidth: 0.54, chestT: 0.36, chestWidth: 0.96, hemT: 0.8, hemWidth: 0.9 }
  ),
  CT019: profile(
    { shoulderY: 0.02, shoulderInset: 0.12, necklineY: 0.42, necklineInset: 0.28, chestY: 0.6, chestInset: 0.04, hemY: 0.93, hemInset: 0.11 },
    { shoulderWidth: 0.9, necklineT: 0.15, necklineWidth: 0.53, chestT: 0.36, chestWidth: 0.95, hemT: 0.8, hemWidth: 0.89 }
  ),
  CT020: profile(
    { shoulderY: 0.04, shoulderInset: 0.13, necklineY: 0.39, necklineInset: 0.28, chestY: 0.59, chestInset: 0.04, hemY: 0.94, hemInset: 0.12 },
    { shoulderWidth: 0.91, necklineT: 0.11, necklineWidth: 0.53, chestT: 0.35, chestWidth: 0.95, hemT: 0.8, hemWidth: 0.9 }
  ),
};

export function getGarmentFitProfile(productId: string | undefined): GarmentFitProfile | null {
  return productId ? GARMENT_FIT_PROFILES[productId] ?? null : null;
}
