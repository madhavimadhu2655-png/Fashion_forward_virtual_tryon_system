import { createArmOcclusionMask } from "./armOcclusion";
import {
  getGarmentControlPointLayout,
  getGarmentGeometryControlPoints,
  inspectGarmentImage,
} from "./garmentImage";
import { getStillImageLandmarker, getStillImageSegmenter } from "./mediapipe";
import { analyzePose, type PoseLandmarkPoint } from "./poseAnalysis";
import {
  adjustGarmentFitProfile,
  DEFAULT_GARMENT_FIT_ADJUSTMENTS,
  getGarmentFitProfile,
  type GarmentFitAdjustments,
} from "./tps/garmentFitProfiles";
import { getGarmentGeometryProfile } from "./tps/garmentGeometry";
import {
  computeGarmentTpsContext,
  computeGarmentWarp,
  TPS_REGULARIZATION,
} from "./tps/garmentWarpPipeline";
import type { ImageDataLike } from "./tps/tpsWarp";
import { applyGain, canRecolour, cleanGarmentEdges, isPatternColor, lightingGain, medianLuminance } from "./garmentRefinement";

const MAX_PREVIEW_DIMENSION = 1600;
const ARM_MASK_THRESHOLD = 0.55;

export interface PhotoFitPreview {
  image: Blob;
  warning: string | null;
  /** True when the cutout was recoloured because no exact-colour reference exists. */
  tinted: boolean;
  /** Exposure gain applied to the garment to match the photo (1 = none). */
  lightingGain: number;
}

export interface PhotoFitOptions {
  /** The cutout already shows the selected colour — don't recolour it. */
  exactColor?: boolean;
  colorName?: string;
}

function loadImage(url: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A fitting image could not be loaded."));
    image.src = url;
  });
}

export function tintGarmentPixels(image: ImageDataLike, colorHex: string): ImageDataLike {
  const match = /^#([0-9a-f]{6})$/i.exec(colorHex);
  if (!match) throw new Error("The selected color has an invalid color value.");
  const color = Number.parseInt(match[1], 16);
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  const pixels = new Uint8ClampedArray(image.data);

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const luminance =
      (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
    const fabricShade = Math.min(1.2, Math.max(0.28, 0.32 + luminance * 0.88));
    const chroma = 0.45;
    pixels[index] = red * fabricShade + (pixels[index] - luminance * 255) * chroma;
    pixels[index + 1] = green * fabricShade + (pixels[index + 1] - luminance * 255) * chroma;
    pixels[index + 2] = blue * fabricShade + (pixels[index + 2] - luminance * 255) * chroma;
  }

  return { data: pixels, width: image.width, height: image.height };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The fitted preview could not be created."));
    }, "image/png");
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The fitting preview was cancelled.", "AbortError");
}

export async function createPhotoFitPreview(
  personUrl: string,
  garmentUrl: string,
  productId: string,
  colorHex: string,
  signal?: AbortSignal,
  adjustments: GarmentFitAdjustments = DEFAULT_GARMENT_FIT_ADJUSTMENTS,
  options: PhotoFitOptions = {},
): Promise<PhotoFitPreview> {
  const tinted = !options.exactColor;
  if (tinted && options.colorName && isPatternColor(options.colorName)) {
    throw new Error(
      `There is no garment reference for the ${options.colorName} print, and a print can't be recreated by tinting. Choose the colour shown on the product reference instead.`,
    );
  }
  throwIfAborted(signal);
  const [personImage, garmentImage] = await Promise.all([
    loadImage(personUrl),
    loadImage(garmentUrl, true),
  ]);
  throwIfAborted(signal);
  const personScale = Math.min(
    1,
    MAX_PREVIEW_DIMENSION / Math.max(personImage.naturalWidth, personImage.naturalHeight),
  );
  const frameWidth = Math.max(1, Math.round(personImage.naturalWidth * personScale));
  const frameHeight = Math.max(1, Math.round(personImage.naturalHeight * personScale));

  const poseDetector = await getStillImageLandmarker();
  const poseResult = poseDetector.detect(personImage);
  throwIfAborted(signal);
  const landmarks = (poseResult.landmarks?.[0] ?? []).map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    visibility: point.visibility,
  })) as PoseLandmarkPoint[];
  const quality = analyzePose(landmarks);
  if (!quality.pose_valid || quality.orientation !== "front") {
    throw new Error(
      quality.pose_valid
        ? "Use a front-facing photo with your shoulders and hips visible for a reliable fit."
        : `${quality.message} Choose a clear, front-facing photo with your shoulders and hips visible.`,
    );
  }

  const garmentCanvas = document.createElement("canvas");
  garmentCanvas.width = garmentImage.naturalWidth;
  garmentCanvas.height = garmentImage.naturalHeight;
  const garmentContext = garmentCanvas.getContext("2d", { willReadFrequently: true });
  if (!garmentContext) throw new Error("The garment fitting canvas could not be initialized.");
  garmentContext.drawImage(garmentImage, 0, 0);
  const garmentPixels = garmentContext.getImageData(
    0,
    0,
    garmentCanvas.width,
    garmentCanvas.height,
  );
  const cleaned = cleanGarmentEdges({
    data: garmentPixels.data,
    width: garmentPixels.width,
    height: garmentPixels.height,
  });
  if (tinted && !canRecolour(medianLuminance(cleaned), colorHex)) {
    throw new Error(
      `The only garment reference for this top is a very different shade, and ${options.colorName ?? "this colour"} can't be simulated faithfully by recolouring it. Choose the colour marked with a tick, or add an exact reference image for this colour.`,
    );
  }
  const recoloured = tinted ? tintGarmentPixels(cleaned, colorHex) : cleaned;
  const gain = lightingGain(sampleSceneLuminance(personImage));
  const garment = applyGain(recoloured, gain);
  const inspection = inspectGarmentImage(garment);
  if (!inspection.valid || !inspection.alphaBounds) {
    throw new Error(inspection.error ?? "The selected garment image is not a transparent cutout.");
  }

  const productFitProfile = getGarmentFitProfile(productId);
  const geometryProfile = getGarmentGeometryProfile(productId);
  if (!productFitProfile || !geometryProfile) {
    throw new Error("A fitting profile is not configured for the selected product.");
  }
  const fitProfile = adjustGarmentFitProfile(productFitProfile, adjustments);
  const controlPointLayout = getGarmentControlPointLayout(garment, fitProfile);
  const geometryPoints = getGarmentGeometryControlPoints(
    garment,
    fitProfile,
    geometryProfile,
    inspection.alphaBounds,
  );
  if (!controlPointLayout || !geometryPoints) {
    throw new Error("The selected garment could not be aligned to its fitting profile.");
  }

  throwIfAborted(signal);
  const fit = computeGarmentTpsContext(
    landmarks,
    quality,
    garment.width,
    garment.height,
    frameWidth,
    frameHeight,
    controlPointLayout,
    TPS_REGULARIZATION,
    fitProfile,
    inspection.alphaBounds,
    geometryPoints,
    geometryProfile,
  );
  if (!fit) {
    throw new Error("The photo does not contain enough visible body landmarks to fit this garment.");
  }

  const warped = computeGarmentWarp(fit, garment, inspection.alphaBounds);
  throwIfAborted(signal);
  const output = document.createElement("canvas");
  output.width = frameWidth;
  output.height = frameHeight;
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  if (!outputContext) throw new Error("The preview canvas could not be initialized.");
  outputContext.drawImage(personImage, 0, 0, frameWidth, frameHeight);

  const warpedCanvas = document.createElement("canvas");
  warpedCanvas.width = warped.warped.width;
  warpedCanvas.height = warped.warped.height;
  const warpedContext = warpedCanvas.getContext("2d");
  if (!warpedContext) throw new Error("The garment preview could not be rendered.");
  warpedContext.putImageData(
    new ImageData(
      new Uint8ClampedArray(warped.warped.data),
      warped.warped.width,
      warped.warped.height,
    ),
    0,
    0,
  );
  const box = warped.boundingBoxPx;
  outputContext.drawImage(
    warpedCanvas,
    box.minX,
    box.minY,
    box.maxX - box.minX,
    box.maxY - box.minY,
  );

  let warning: string | null = fit.warpWarning;
  let segmentationMask: Float32Array | null = null;
  let segmentationWidth = 0;
  let segmentationHeight = 0;
  try {
    const segmenter = await getStillImageSegmenter();
    const segmentationResult = segmenter.segment(personImage);
    const mask = segmentationResult.confidenceMasks?.[0];
    if (mask) {
      const maskPixels = mask.getAsFloat32Array();
      segmentationMask = new Float32Array(maskPixels);
      segmentationWidth = mask.width;
      segmentationHeight = mask.height;
    }
    segmentationResult.close?.();
  } catch {
    warning = "The fit is ready, but foreground arm layering was unavailable in this browser.";
  }

  if (segmentationMask) {
    const armMask = createArmOcclusionMask(
      segmentationMask,
      segmentationWidth,
      segmentationHeight,
      frameWidth,
      frameHeight,
      landmarks,
      geometryProfile.construction,
      ARM_MASK_THRESHOLD,
    );
    if (armMask) {
      const armLayer = document.createElement("canvas");
      armLayer.width = frameWidth;
      armLayer.height = frameHeight;
      const armContext = armLayer.getContext("2d");
      if (!armContext) throw new Error("The arm-layer preview could not be initialized.");
      armContext.drawImage(personImage, 0, 0, frameWidth, frameHeight);
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = frameWidth;
      alphaCanvas.height = frameHeight;
      const alphaContext = alphaCanvas.getContext("2d");
      if (!alphaContext) throw new Error("The arm mask could not be initialized.");
      const alphaPixels = alphaContext.createImageData(frameWidth, frameHeight);
      for (let index = 0; index < armMask.length; index++) {
        const pixel = index * 4;
        alphaPixels.data[pixel] = 255;
        alphaPixels.data[pixel + 1] = 255;
        alphaPixels.data[pixel + 2] = 255;
        alphaPixels.data[pixel + 3] = armMask[index];
      }
      alphaContext.putImageData(alphaPixels, 0, 0);
      armContext.globalCompositeOperation = "destination-in";
      armContext.drawImage(alphaCanvas, 0, 0);
      armContext.globalCompositeOperation = "source-over";
      outputContext.drawImage(armLayer, 0, 0);
    } else if (!warning) {
      warning = "The fit is ready, but arm layering could not be estimated for this pose.";
    }
  } else if (!warning) {
    warning = "The fit is ready, but foreground arm layering was unavailable in this browser.";
  }

  throwIfAborted(signal);
  const blob = await canvasBlob(output);
  return { image: blob, warning, tinted, lightingGain: gain };
}

function sampleSceneLuminance(image: HTMLImageElement): number {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0.55;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return medianLuminance({ data: pixels.data, width: pixels.width, height: pixels.height });
}
