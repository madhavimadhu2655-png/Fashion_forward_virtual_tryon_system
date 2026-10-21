import { FilesetResolver, PoseLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

// MediaPipe's WASM runtime and the pose model itself are fetched from
// Google's CDN at runtime, in the user's own browser — this is the
// standard, officially documented way to use Tasks Vision; there's no
// local model file to bundle. Cached as a module-level singleton so
// switching the camera on/off doesn't redownload/reinitialize it.
let landmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    })().catch((err) => {
      // Reset so a later retry attempts a fresh load instead of
      // permanently caching a failed promise.
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

// Body segmentation (Milestone 6) — MediaPipe's "selfie segmenter" model,
// same CDN-loading pattern as pose. This model does single-subject
// foreground/background segmentation; it does not report a person COUNT,
// so a "multiple people" check isn't implemented — the model itself
// doesn't give us that signal to check honestly.
let segmenterPromise: Promise<ImageSegmenter> | null = null;

export function getImageSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

let stillImageLandmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getStillImageLandmarker(): Promise<PoseLandmarker> {
  if (!stillImageLandmarkerPromise) {
    stillImageLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })().catch((err) => {
      stillImageLandmarkerPromise = null;
      throw err;
    });
  }
  return stillImageLandmarkerPromise;
}

let stillImageSegmenterPromise: Promise<ImageSegmenter> | null = null;

export function getStillImageSegmenter(): Promise<ImageSegmenter> {
  if (!stillImageSegmenterPromise) {
    stillImageSegmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((err) => {
      stillImageSegmenterPromise = null;
      throw err;
    });
  }
  return stillImageSegmenterPromise;
}

// Photo-quality checks need to know whether MORE than one person is in the
// photo, so this still-image detector allows up to three poses.
let qualityLandmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getQualityLandmarker(): Promise<PoseLandmarker> {
  if (!qualityLandmarkerPromise) {
    qualityLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 3,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
    })().catch((err) => {
      qualityLandmarkerPromise = null;
      throw err;
    });
  }
  return qualityLandmarkerPromise;
}
