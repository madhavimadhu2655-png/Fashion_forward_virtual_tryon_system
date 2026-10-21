export interface SegmentationQualityResult {
  person_detected: boolean;
  person_area_fraction: number;
  confidence: number;
  message: string;
}

const FOREGROUND_THRESHOLD = 0.5;
const MIN_PERSON_FRACTION = 0.04; // below this, treat as "no one detected" / too far
const MAX_PERSON_FRACTION = 0.9; // above this, likely too close / filling the frame

/**
 * Takes a raw per-pixel confidence mask (values 0-1, one per pixel, person
 * likelihood) and produces a real, computed quality assessment — never an
 * invented confidence number. Every value here is derived directly from
 * the mask data passed in.
 */
export function analyzeSegmentation(
  maskData: Float32Array | null,
  width: number,
  height: number
): SegmentationQualityResult {
  const empty: SegmentationQualityResult = {
    person_detected: false,
    person_area_fraction: 0,
    confidence: 0,
    message: "Segmentation not available.",
  };

  if (!maskData || maskData.length === 0 || width === 0 || height === 0) return empty;

  let personPixels = 0;
  let confidenceSum = 0;

  for (let i = 0; i < maskData.length; i++) {
    const v = maskData[i];
    if (v >= FOREGROUND_THRESHOLD) {
      personPixels++;
      confidenceSum += v;
    }
  }

  const totalPixels = width * height;
  const personFraction = personPixels / totalPixels;
  const meanConfidence = personPixels > 0 ? confidenceSum / personPixels : 0;

  if (personFraction < MIN_PERSON_FRACTION) {
    return {
      person_detected: false,
      person_area_fraction: Number(personFraction.toFixed(4)),
      confidence: 0,
      message: "Step into the camera frame.",
    };
  }

  if (personFraction > MAX_PERSON_FRACTION) {
    return {
      person_detected: true,
      person_area_fraction: Number(personFraction.toFixed(4)),
      confidence: Number(meanConfidence.toFixed(4)),
      message: "Move slightly farther from the camera.",
    };
  }

  return {
    person_detected: true,
    person_area_fraction: Number(personFraction.toFixed(4)),
    confidence: Number(meanConfidence.toFixed(4)),
    message: "Body detected.",
  };
}
