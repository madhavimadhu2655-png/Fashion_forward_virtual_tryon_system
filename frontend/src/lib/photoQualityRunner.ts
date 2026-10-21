import { getQualityLandmarker } from "./mediapipe";
import { assessPhotoQuality, imageStats, toGrayscale, type QualityReport } from "./photoQuality";
import type { PoseLandmarkPoint } from "./poseAnalysis";

const STATS_MAX_EDGE = 512;

/**
 * Runs the photo checks in this browser. The photo never leaves the
 * device: stats come from a downscaled canvas copy, and MediaPipe runs
 * locally (only its model files are fetched from the CDN).
 */
export async function checkPhotoQuality(photoUrl: string, signal?: AbortSignal): Promise<QualityReport> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo couldn't be read for quality checks."));
    img.src = photoUrl;
  });
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  const scale = Math.min(1, STATS_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Quality checks need canvas support in this browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const stats = imageStats(toGrayscale(pixels.data, canvas.width, canvas.height), canvas.width, canvas.height);
  canvas.width = canvas.height = 0; // release the copy

  let poses: PoseLandmarkPoint[][] | null = null;
  try {
    const detector = await getQualityLandmarker();
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const result = detector.detect(image);
    poses = (result.landmarks ?? []).map((points) =>
      points.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    poses = null; // reported honestly as "body check unavailable"
  }
  return assessPhotoQuality({ width: image.naturalWidth, height: image.naturalHeight, stats, poses });
}
