import { createPhotoFitPreview } from "./photoFitting";
import { canRecolour, hexLuminance, isPatternColor } from "./garmentRefinement";
import { DEFAULT_GARMENT_FIT_ADJUSTMENTS, type GarmentFitAdjustments } from "./tps/garmentFitProfiles";
import { generatePhotoTryOn, type PhotoTryOnStatus } from "../services/api";

/**
 * Two honest ways to produce a try-on image from an uploaded photo:
 *  - "browser_fit": the product cutout warped to the detected pose on this
 *    device (thin-plate spline + arm layering). Geometric, not generative.
 *  - "catvton": the local CatVTON diffusion model on a private GPU worker,
 *    reached only through this app's backend. Needs an exact-colour garment
 *    reference and an available worker.
 * Neither ever falls back to the other or to a catalogue photo.
 */
export type EngineId = "browser_fit" | "catvton";

export const ENGINE_LABEL: Record<EngineId, string> = {
  browser_fit: "Browser fit preview",
  catvton: "AI generation (CatVTON)",
};

export const ENGINE_DESCRIPTION: Record<EngineId, string> = {
  browser_fit:
    "Warps the product cutout onto your detected pose, on this device. Fast and private, but geometric — it doesn't synthesise folds or lighting.",
  catvton:
    "A diffusion try-on model on a local GPU worker. More realistic fabric and lighting; slower, and only when the worker is running.",
};

export interface GenerationState {
  engine: EngineId;
  hasPhoto: boolean;
  qualityChecking: boolean;
  qualityBlocking: boolean;
  hasProduct: boolean;
  hasColor: boolean;
  colorName: string;
  consent: boolean;
  garmentLoading: boolean;
  garmentAvailable: boolean;
  exactColor: boolean;
  fitProfileAvailable: boolean;
  aiStatus: PhotoTryOnStatus | null;
  aiStatusError: boolean;
  generating: boolean;
  /** Selected colour's hex, and the colour the reference cutout actually shows (if known). */
  colorHex?: string | null;
  referenceColorName?: string | null;
  referenceColorHex?: string | null;
}

/** Every reason Generate is unavailable, in the order a user should fix them. */
export function generationBlockers(s: GenerationState): string[] {
  const reasons: string[] = [];
  if (!s.hasPhoto) reasons.push("Add a photo.");
  else if (s.qualityChecking) reasons.push("Checking your photo…");
  else if (s.qualityBlocking) reasons.push("Fix the photo problems listed above, or choose another photo.");
  if (!s.hasProduct) reasons.push("Choose a crop top.");
  else if (!s.hasColor) reasons.push("Choose a colour.");
  if (s.hasProduct && s.hasColor) {
    if (s.engine === "browser_fit") {
      if (s.garmentLoading) reasons.push("Loading the garment cutout…");
      else if (!s.garmentAvailable) reasons.push("This product has no garment cutout yet.");
      else if (!s.fitProfileAvailable) reasons.push("This product has no fitting profile yet.");
      else if (!s.exactColor && isPatternColor(s.colorName))
        reasons.push(`No garment reference exists for the ${s.colorName} print; it can't be approximated by tinting.`);
      else if (!s.exactColor && s.colorHex && s.referenceColorHex && s.referenceColorName) {
        const from = hexLuminance(s.referenceColorHex);
        if (from !== null && !canRecolour(from, s.colorHex))
          reasons.push(
            `The only garment reference is ${s.referenceColorName}; ${s.colorName} is too different to simulate faithfully. Choose ${s.referenceColorName}, or add a ${s.colorName} reference image.`,
          );
      }
    } else {
      if (!s.exactColor) reasons.push(`No exact ${s.colorName} garment reference is configured for AI generation.`);
      if (s.aiStatusError) reasons.push("Couldn't reach the backend to check the AI model.");
      else if (!s.aiStatus) reasons.push("Checking the AI model…");
      else if (!s.aiStatus.available) {
        const missing = s.aiStatus.checks?.filter((c) => !c.ok).map((c) => c.label) ?? [];
        reasons.push(missing.length ? `AI model unavailable: ${missing.join("; ")}.` : s.aiStatus.message);
      }
    }
  }
  if (s.hasPhoto && !s.consent) reasons.push("Confirm you have permission to use this photo.");
  if (s.generating) reasons.push("A preview is already being generated.");
  return reasons;
}

export interface TryOnRequest {
  engine: EngineId;
  photo: File;
  photoUrl: string;
  productId: string;
  colorName: string;
  colorHex: string;
  garmentUrl: string | null;
  exactColor: boolean;
  consent: boolean;
  adjustments?: GarmentFitAdjustments;
  signal: AbortSignal;
}

export interface TryOnOutput {
  blob: Blob;
  tinted: boolean;
  warning: string | null;
}

export async function runTryOn(request: TryOnRequest): Promise<TryOnOutput> {
  if (request.engine === "catvton") {
    if (!request.exactColor) throw new Error("No exact-colour garment reference is configured for this colour.");
    const blob = await generatePhotoTryOn(request.photo, request.productId, request.colorName, request.consent, request.signal);
    return { blob, tinted: false, warning: null };
  }
  if (!request.garmentUrl) throw new Error("This product has no garment cutout yet.");
  const result = await createPhotoFitPreview(
    request.photoUrl,
    request.garmentUrl,
    request.productId,
    request.colorHex,
    request.signal,
    request.adjustments ?? DEFAULT_GARMENT_FIT_ADJUSTMENTS,
    { exactColor: request.exactColor, colorName: request.colorName },
  );
  return { blob: result.image, tinted: result.tinted, warning: result.warning };
}
