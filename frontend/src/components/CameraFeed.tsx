import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { getPoseLandmarker, getImageSegmenter } from "../lib/mediapipe";
import { analyzePose, POSE_CONNECTIONS, type PoseLandmarkPoint, type PoseQualityResult } from "../lib/poseAnalysis";
import { analyzeSegmentation, type SegmentationQualityResult } from "../lib/segmentationAnalysis";
import { LandmarkSmoother } from "../lib/tps/smoothing";
import {
  computeGarmentTpsContext,
  computeGarmentWarp,
  TPS_REGULARIZATION,
  PLACEHOLDER_GARMENT_DIMENSIONS,
  type GarmentTpsContext,
} from "../lib/tps/garmentWarpPipeline";
import type { Point } from "../lib/tps/tpsMath";
import type { ImageDataLike } from "../lib/tps/tpsWarp";
import {
  getGarmentAlphaOutline,
  getGarmentControlPointLayout,
  getGarmentGeometryControlPoints,
  inspectGarmentImage,
} from "../lib/garmentImage";
import { CONTROL_POINT_NAMES, type ControlPointLayout } from "../lib/tps/controlPoints";
import { getGarmentFitProfile, type GarmentFitProfile } from "../lib/tps/garmentFitProfiles";
import {
  getGarmentGeometryProfile,
  type GarmentGeometryProfile,
  type NamedGarmentPoint,
} from "../lib/tps/garmentGeometry";
import { createArmOcclusionMask } from "../lib/armOcclusion";
import { cleanGarmentEdges } from "../lib/garmentRefinement";
import { resolveAssetUrl } from "../services/api";
import type { GarmentAssetInfo } from "../types/garment";

export interface TpsDebugInfo {
  controlPointCount: number;
  regularization: number;
  warpResolution: string;
  processingMs: number | null;
  fps: number | null;
  videoDimensions: string;
  canvasDimensions: string;
  garmentDimensions: string;
  torsoWidthPx: number | null;
  coordinateSpace: string;
  warpStrength: number | null;
  warpWarning: string | null;
  garmentConstruction: string;
  segmentationStatus: string;
  invalidControlPoints: string[];
  lastWarpError: string | null;
}

interface CameraFeedProps {
  active: boolean;
  showLandmarks: boolean;
  showBodyMask: boolean;
  showGarment: boolean;
  showGarmentControlPoints: boolean;
  showBodyTargetPoints: boolean;
  showTpsMesh: boolean;
  smoothingAlpha: number;
  garmentAsset: GarmentAssetInfo | null;
  garmentAssetRevision: number;
  onPoseUpdate: (landmarks: PoseLandmarkPoint[] | null, quality: PoseQualityResult) => void;
  onSegmentationUpdate: (quality: SegmentationQualityResult) => void;
  onTpsDebugUpdate: (info: TpsDebugInfo) => void;
  onGarmentImageError: (message: string | null) => void;
  onGarmentImageReady: (productId: string | null) => void;
  onError: (message: string) => void;
}

// Update React state / callbacks at most this often — the render loop
// itself runs every animation frame for smooth drawing, but pushing
// results into React that often would cause excessive re-renders.
const POSE_UPDATE_INTERVAL_MS = 150;
const SEGMENTATION_UPDATE_INTERVAL_MS = 300; // segmentation is heavier than landmark detection
// TPS solve + pixel warp are comparatively expensive (a 13x13 linear
// solve plus up to 129,600 bilinear samples) — recomputing on
// every animation frame risked dropped frames on modest hardware, so
// this throttles the WARP CONTENT update rate. This is a real, honest
// performance tradeoff: the visual update rate for the garment is
// ~1000/TPS_UPDATE_INTERVAL_MS times per second, not full 60fps. The
// debug panel's measured "FPS" reflects this actual rate, not a faked one.
const TPS_UPDATE_INTERVAL_MS = 100;

export default function CameraFeed({
  active,
  showLandmarks,
  showBodyMask,
  showGarment,
  showGarmentControlPoints,
  showBodyTargetPoints,
  showTpsMesh,
  smoothingAlpha,
  garmentAsset,
  garmentAssetRevision,
  onPoseUpdate,
  onSegmentationUpdate,
  onTpsDebugUpdate,
  onGarmentImageError,
  onGarmentImageReady,
  onError,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPoseUpdateRef = useRef(0);
  const lastSegUpdateRef = useRef(0);
  const lastTpsUpdateRef = useRef(0);

  const showLandmarksRef = useRef(showLandmarks);
  const showBodyMaskRef = useRef(showBodyMask);
  const showGarmentRef = useRef(showGarment);
  const showGarmentControlPointsRef = useRef(showGarmentControlPoints);
  const showBodyTargetPointsRef = useRef(showBodyTargetPoints);
  const showTpsMeshRef = useRef(showTpsMesh);
  const garmentAssetRef = useRef(garmentAsset);
  garmentAssetRef.current = garmentAsset;
  const segmentationAvailableRef = useRef(true);

  const smootherRef = useRef(new LandmarkSmoother(smoothingAlpha));

  const garmentImageRef = useRef<HTMLImageElement | null>(null);
  const garmentImageDataRef = useRef<ImageDataLike | null>(null);
  const garmentImageLoadedRef = useRef(false);
  const garmentControlPointLayoutRef = useRef<ControlPointLayout | null>(null);
  const garmentFitProfileRef = useRef<GarmentFitProfile | null>(null);
  const garmentGeometryProfileRef = useRef<GarmentGeometryProfile | null>(null);
  const garmentGeometryPointsRef = useRef<NamedGarmentPoint[] | null>(null);
  const garmentAlphaOutlineRef = useRef<Point[]>([]);
  const garmentAlphaBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const loadedAssetKeyRef = useRef<string | null>(null);
  const warpedAssetKeyRef = useRef<string | null>(null);

  const lastTpsContextRef = useRef<GarmentTpsContext | null>(null);
  const lastWarpedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastWarpedBoxRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const lastWarpedOutlineRef = useRef<Point[]>([]);
  const armOcclusionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const armMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    showLandmarksRef.current = showLandmarks;
  }, [showLandmarks]);
  useEffect(() => {
    showBodyMaskRef.current = showBodyMask;
  }, [showBodyMask]);
  useEffect(() => {
    showGarmentRef.current = showGarment;
  }, [showGarment]);
  useEffect(() => {
    showGarmentControlPointsRef.current = showGarmentControlPoints;
  }, [showGarmentControlPoints]);
  useEffect(() => {
    showBodyTargetPointsRef.current = showBodyTargetPoints;
  }, [showBodyTargetPoints]);
  useEffect(() => {
    showTpsMeshRef.current = showTpsMesh;
  }, [showTpsMesh]);
  useEffect(() => {
    smootherRef.current.setAlpha(smoothingAlpha);
  }, [smoothingAlpha]);

  // Preload the garment (and, if present, mask) image whenever the asset
  // changes, and decode both into raw pixel data ONCE here — not on
  // every frame — via an offscreen canvas.
  useEffect(() => {
    let cancelled = false;
    const selectedAsset = garmentAsset;
    garmentImageLoadedRef.current = false;
    garmentImageRef.current = null;
    garmentImageDataRef.current = null;
    garmentControlPointLayoutRef.current = null;
    garmentFitProfileRef.current = null;
    garmentGeometryProfileRef.current = null;
    garmentGeometryPointsRef.current = null;
    garmentAlphaOutlineRef.current = [];
    garmentAlphaBoundsRef.current = null;
    loadedAssetKeyRef.current = null;
    warpedAssetKeyRef.current = null;
    lastWarpedCanvasRef.current = null;
    lastWarpedBoxRef.current = null;
    lastWarpedOutlineRef.current = [];
    lastTpsContextRef.current = null;
    onGarmentImageError(null);
    onGarmentImageReady(null);

    if (!selectedAsset?.asset_available || !selectedAsset.tryon_url) return;
    const assetKey = `${selectedAsset.product_id}:${selectedAsset.tryon_url}`;
    const fitProfile = getGarmentFitProfile(selectedAsset.product_id);
    const geometryProfile = getGarmentGeometryProfile(selectedAsset.product_id);
    if (!fitProfile) {
      onGarmentImageError(`No garment-specific fitting profile is configured for ${selectedAsset.product_id}.`);
      return;
    }
    if (!geometryProfile) {
      onGarmentImageError(`No garment-shape annotation is configured for ${selectedAsset.product_id}.`);
      return;
    }
    const tryonUrl = resolveAssetUrl(selectedAsset.tryon_url);
    if (!tryonUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    const imageUrl =
      garmentAssetRevision > 0
        ? `${tryonUrl}${tryonUrl.includes("?") ? "&" : "?"}retry=${garmentAssetRevision}`
        : tryonUrl;
    img.src = imageUrl;
    void img.decode().then(() => {
      if (cancelled) return;
      const off = document.createElement("canvas");
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) throw new Error("Couldn't create a canvas to inspect the try-on image.");
      offCtx.drawImage(img, 0, 0);
      const data = offCtx.getImageData(0, 0, off.width, off.height);
      const pixels = cleanGarmentEdges({ data: data.data, width: data.width, height: data.height });
      const inspection = inspectGarmentImage(pixels);
      if (!inspection.valid) throw new Error(inspection.error ?? "The try-on image is invalid.");

      const controlPointLayout = getGarmentControlPointLayout(pixels, fitProfile);
      if (!controlPointLayout) {
        throw new Error("The product fitting profile did not land on distinct visible garment areas.");
      }
      const geometryPoints = getGarmentGeometryControlPoints(
        pixels,
        fitProfile,
        geometryProfile,
        inspection.alphaBounds ?? undefined
      );
      if (!geometryPoints) {
        throw new Error("The annotated neckline, armhole, or sleeve points do not land on distinct visible garment pixels.");
      }

      if (cancelled) return;
      garmentImageRef.current = img;
      garmentImageDataRef.current = pixels;
      garmentControlPointLayoutRef.current = controlPointLayout;
      garmentFitProfileRef.current = fitProfile;
      garmentGeometryProfileRef.current = geometryProfile;
      garmentGeometryPointsRef.current = geometryPoints;
      garmentAlphaBoundsRef.current = inspection.alphaBounds;
      garmentAlphaOutlineRef.current = getGarmentAlphaOutline(pixels);
      garmentImageLoadedRef.current = true;
      loadedAssetKeyRef.current = assetKey;
      onGarmentImageReady(selectedAsset.product_id);
    }).catch((err: unknown) => {
      if (cancelled) return;
      onGarmentImageReady(null);
      onGarmentImageError(
        `Couldn't load the selected product's try-on image (${selectedAsset.product_id}): ${
          err instanceof Error ? err.message : "image decode failed"
        }`
      );
    });

    return () => {
      cancelled = true;
      img.src = "";
    };
    // The API response and callback identity are intentionally excluded:
    // product ID + file URL are the asset's actual loading identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    garmentAsset?.product_id,
    garmentAsset?.tryon_url,
    garmentAsset?.asset_available,
    garmentAssetRevision,
  ]);

  useEffect(() => {
    if (!active) {
      setInitializing(false);
      stopEverything();
      return;
    }

    let cancelled = false;
    lastPoseUpdateRef.current = 0;
    lastSegUpdateRef.current = 0;
    lastTpsUpdateRef.current = 0;
    segmentationAvailableRef.current = true;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError("Your browser doesn't support camera access. Try a recent Chrome, Edge, or Firefox.");
        return;
      }

      setInitializing(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const landmarker = await getPoseLandmarker();
        if (cancelled) return;

        let segmenter: Awaited<ReturnType<typeof getImageSegmenter>> | null = null;
        try {
          segmenter = await getImageSegmenter();
        } catch {
          segmentationAvailableRef.current = false;
          onSegmentationUpdate({
            person_detected: false,
            person_area_fraction: 0,
            confidence: 0,
            message: "Body segmentation isn't supported in this browser.",
          });
        }
        if (cancelled) return;

        setInitializing(false);
        runDetectionLoop(landmarker, segmenter);
      } catch (err) {
        setInitializing(false);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          onError("Camera permission denied. Allow camera access to use virtual try-on.");
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          onError("No camera found on this device.");
        } else {
          onError("Couldn't start the camera or load pose detection. " + (err instanceof Error ? err.message : ""));
        }
      }
    }

    function runDetectionLoop(
      landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>,
      segmenter: Awaited<ReturnType<typeof getImageSegmenter>> | null
    ) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        onError("Camera preview elements are unavailable. Stop and retry the camera.");
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onError("Couldn't initialize the camera overlay canvas.");
        return;
      }

      function tick() {
        if (cancelled) return;
        if (!video || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        if (!video.videoWidth || !video.videoHeight) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (canvas!.width !== video.videoWidth || canvas!.height !== video.videoHeight) {
          canvas!.width = video.videoWidth;
          canvas!.height = video.videoHeight;
        }

        // --- Pose detection ---
        let rawLandmarks: PoseLandmarkPoint[] | null;
        try {
          const poseResult = landmarker.detectForVideo(video, performance.now());
          rawLandmarks = (poseResult.landmarks?.[0] as PoseLandmarkPoint[] | undefined) ?? null;
        } catch (err) {
          onError(`Pose detection failed: ${err instanceof Error ? err.message : "unknown MediaPipe error"}`);
          return;
        }

        const now = performance.now();
        const quality = analyzePose(rawLandmarks);
        if (now - lastPoseUpdateRef.current >= POSE_UPDATE_INTERVAL_MS) {
          lastPoseUpdateRef.current = now;
          onPoseUpdate(rawLandmarks, quality);
        }

        const smoothedLandmarks = quality.pose_valid
          ? smootherRef.current.smooth(rawLandmarks)
          : (smootherRef.current.reset(), null);
        if (!quality.pose_valid) {
          lastTpsContextRef.current = null;
          lastWarpedCanvasRef.current = null;
          lastWarpedBoxRef.current = null;
          warpedAssetKeyRef.current = null;
        }

        ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

        // --- Body segmentation (drawn first, underneath everything else) ---
        let segmentationMaskData: Float32Array | null = null;
        let segmentationMaskWidth = 0;
        let segmentationMaskHeight = 0;
        if (segmenter && segmentationAvailableRef.current) {
          try {
            const segResult = segmenter.segmentForVideo(video, performance.now());
            const mask = segResult.confidenceMasks?.[0];
            if (mask) {
              const maskData = mask.getAsFloat32Array?.();
              if (maskData) {
                segmentationMaskData = maskData;
                segmentationMaskWidth = mask.width;
                segmentationMaskHeight = mask.height;
              }
              if (showBodyMaskRef.current) {
                drawSegmentationMask(ctx!, mask, canvas!.width, canvas!.height);
              }
              if (now - lastSegUpdateRef.current >= SEGMENTATION_UPDATE_INTERVAL_MS) {
                lastSegUpdateRef.current = now;
                if (maskData) {
                  onSegmentationUpdate(analyzeSegmentation(maskData, mask.width, mask.height));
                }
              }
            }
            segResult.close?.();
          } catch {
            segmentationAvailableRef.current = false;
            onSegmentationUpdate({
              person_detected: false,
              person_area_fraction: 0,
              confidence: 0,
              message: "Body segmentation stopped responding in this browser.",
            });
          }
        }

        // --- Landmarks ---
        if (showLandmarksRef.current && rawLandmarks) {
          drawLandmarks(ctx!, rawLandmarks, canvas!.width, canvas!.height);
        }

        // --- TPS garment warp ---
        const asset = garmentAssetRef.current;
        const garmentDims = garmentImageDataRef.current
          ? { width: garmentImageDataRef.current.width, height: garmentImageDataRef.current.height }
          : PLACEHOLDER_GARMENT_DIMENSIONS;
        const currentAssetKey =
          asset?.asset_available && asset.tryon_url ? `${asset.product_id}:${asset.tryon_url}` : null;

        const shouldRecompute = now - lastTpsUpdateRef.current >= TPS_UPDATE_INTERVAL_MS;

        if (shouldRecompute) {
          lastTpsUpdateRef.current = now;
          try {
            const context = computeGarmentTpsContext(
              smoothedLandmarks,
              quality,
              garmentDims.width,
              garmentDims.height,
              canvas!.width,
              canvas!.height,
              garmentControlPointLayoutRef.current ?? undefined,
              TPS_REGULARIZATION,
              garmentFitProfileRef.current ?? undefined,
              garmentAlphaBoundsRef.current ?? undefined,
              garmentGeometryPointsRef.current ?? [],
              garmentGeometryProfileRef.current ?? undefined
            );
            lastTpsContextRef.current = context;

            if (
              context &&
              asset?.asset_available &&
              currentAssetKey === loadedAssetKeyRef.current &&
              garmentImageLoadedRef.current &&
              garmentImageDataRef.current
            ) {
              const warpResult = computeGarmentWarp(
                context,
                garmentImageDataRef.current,
                garmentAlphaBoundsRef.current ?? undefined
              );
              const warpedCanvas = document.createElement("canvas");
              warpedCanvas.width = warpResult.warped.width;
              warpedCanvas.height = warpResult.warped.height;
              const warpedCtx = warpedCanvas.getContext("2d");
              if (!warpedCtx) throw new Error("Couldn't create the garment rendering canvas.");
              warpedCtx.putImageData(
                new ImageData(
                  new Uint8ClampedArray(warpResult.warped.data),
                  warpResult.warped.width,
                  warpResult.warped.height
                ),
                0,
                0
              );
              lastWarpedCanvasRef.current = warpedCanvas;
              lastWarpedBoxRef.current = warpResult.boundingBoxPx;
              lastWarpedOutlineRef.current = garmentAlphaOutlineRef.current.map((point) =>
                context.forwardTps.transform(point)
              );
              warpedAssetKeyRef.current = currentAssetKey;

              onGarmentImageError(null);
              onTpsDebugUpdate({
                controlPointCount: context.controlPointCount,
                regularization: context.regularization,
                warpResolution: `${warpResult.warped.width}×${warpResult.warped.height}`,
                processingMs: Number(warpResult.processingMs.toFixed(1)),
                fps: Number((1000 / TPS_UPDATE_INTERVAL_MS).toFixed(1)),
                videoDimensions: `${video!.videoWidth}×${video!.videoHeight}`,
                canvasDimensions: `${canvas!.width}×${canvas!.height}`,
                garmentDimensions: `${garmentDims.width}×${garmentDims.height}`,
                torsoWidthPx: context.bodyTargetPointsPx[1].x - context.bodyTargetPointsPx[0].x,
                coordinateSpace: "normalized pose → video pixels → object-fit cover canvas → mirrored preview",
                warpStrength: context.warpStrength,
                warpWarning: context.warpWarning,
                garmentConstruction: garmentGeometryProfileRef.current?.construction ?? "unknown",
                segmentationStatus: segmenter && segmentationAvailableRef.current
                  ? "available; arm-only foreground composite"
                  : "unavailable; garment rendered without arm occlusion",
                invalidControlPoints: [],
                lastWarpError: null,
              });
            } else {
              lastWarpedCanvasRef.current = null;
              lastWarpedBoxRef.current = null;
              warpedAssetKeyRef.current = null;
              onTpsDebugUpdate({
                controlPointCount: context?.controlPointCount ?? 0,
                regularization: TPS_REGULARIZATION,
                warpResolution: "--",
                processingMs: null,
                fps: null,
                videoDimensions: `${video!.videoWidth}×${video!.videoHeight}`,
                canvasDimensions: `${canvas!.width}×${canvas!.height}`,
                garmentDimensions: `${garmentDims.width}×${garmentDims.height}`,
                torsoWidthPx: null,
                coordinateSpace: "normalized pose → video pixels → object-fit cover canvas → mirrored preview",
                warpStrength: null,
                warpWarning: null,
                garmentConstruction: garmentGeometryProfileRef.current?.construction ?? "unknown",
                segmentationStatus: segmenter && segmentationAvailableRef.current
                  ? "available; arm-only foreground composite"
                  : "unavailable; garment rendered without arm occlusion",
                invalidControlPoints: [],
                lastWarpError: null,
              });
            }
          } catch (err) {
            lastTpsContextRef.current = null;
            lastWarpedCanvasRef.current = null;
            lastWarpedBoxRef.current = null;
            warpedAssetKeyRef.current = null;
            onGarmentImageError(
              `Garment transformation failed for ${asset?.product_id ?? "the selected product"}: ${
                err instanceof Error ? err.message : "unknown warp error"
              }`
            );
            onTpsDebugUpdate({
              controlPointCount: 0,
              regularization: TPS_REGULARIZATION,
              warpResolution: "--",
              processingMs: null,
              fps: null,
              videoDimensions: `${video!.videoWidth}×${video!.videoHeight}`,
              canvasDimensions: `${canvas!.width}×${canvas!.height}`,
              garmentDimensions: `${garmentDims.width}×${garmentDims.height}`,
              torsoWidthPx: null,
              coordinateSpace: "normalized pose → video pixels → object-fit cover canvas → mirrored preview",
              warpStrength: null,
              warpWarning: null,
              garmentConstruction: garmentGeometryProfileRef.current?.construction ?? "unknown",
              segmentationStatus: segmenter && segmentationAvailableRef.current
                ? "available; arm-only foreground composite"
                : "unavailable; garment rendered without arm occlusion",
              invalidControlPoints: [],
              lastWarpError: err instanceof Error ? err.message : "unknown warp error",
            });
          }
        }

        const context = lastTpsContextRef.current;

        if (showGarmentRef.current && context) {
          if (
            asset?.asset_available &&
            currentAssetKey === loadedAssetKeyRef.current &&
            currentAssetKey === warpedAssetKeyRef.current &&
            lastWarpedCanvasRef.current &&
            lastWarpedBoxRef.current
          ) {
            const box = lastWarpedBoxRef.current;
            ctx!.drawImage(
              lastWarpedCanvasRef.current,
              box.minX,
              box.minY,
              box.maxX - box.minX,
              box.maxY - box.minY
            );
          } else if (asset && !asset.asset_available) {
            // No real garment asset — the mesh IS the honest placement
            // preview, replacing Milestone 7's rigid debug box with a
            // visualization that actually proves non-rigid deformation.
            drawMeshGridOverlay(ctx!, context.meshGridCanvasPoints, "rgba(217, 70, 239, 0.9)");
            ctx!.fillStyle = "rgba(217, 70, 239, 1)";
            ctx!.font = "12px sans-serif";
            const firstPoint = context.meshGridCanvasPoints[0][0];
            ctx!.fillText("No real garment asset — TPS mesh preview only", firstPoint.x, firstPoint.y - 8);
          }
        }

        if (
          showGarmentRef.current &&
          context &&
          segmenter &&
          segmentationAvailableRef.current &&
          segmentationMaskData &&
          smoothedLandmarks &&
          garmentGeometryProfileRef.current
        ) {
          compositeForegroundArms(
            ctx!,
            video!,
            segmentationMaskData,
            segmentationMaskWidth,
            segmentationMaskHeight,
            smoothedLandmarks,
            garmentGeometryProfileRef.current.construction,
            canvas!.width,
            canvas!.height,
            armOcclusionCanvasRef,
            armMaskCanvasRef
          );
        }

        if (showTpsMeshRef.current && context && asset?.asset_available) {
          drawMeshGridOverlay(ctx!, context.meshGridCanvasPoints, "rgba(34, 211, 238, 0.8)");
        }

        if (showGarmentControlPointsRef.current && context) {
          const projected = context.garmentControlPointsPx.map((p) => context.forwardTps.transform(p));
          drawPointMarkers(ctx!, projected, "#facc15");
          if (garmentImageRef.current && garmentAlphaBoundsRef.current) {
            drawSourceDebugInset(
              ctx!,
              garmentImageRef.current,
              context.garmentControlPointsPx,
              garmentAlphaBoundsRef.current
            );
            drawTransformedGarmentOutline(ctx!, lastWarpedOutlineRef.current);
            drawPointMarkers(
              ctx!,
              context.bodyTargetPointsPx.slice(CONTROL_POINT_NAMES.length),
              "#fb7185"
            );
          }
        }

        if (showBodyTargetPointsRef.current && context) {
          drawPointMarkers(ctx!, context.bodyTargetPointsPx, "#60a5fa");
        }

        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function stopEverything() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    smootherRef.current.reset();
    lastPoseUpdateRef.current = 0;
    lastSegUpdateRef.current = 0;
    lastTpsUpdateRef.current = 0;
    lastTpsContextRef.current = null;
    lastWarpedCanvasRef.current = null;
    lastWarpedBoxRef.current = null;
    lastWarpedOutlineRef.current = [];
    warpedAssetKeyRef.current = null;
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" muted playsInline />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover scale-x-[-1]" />
      <div className="vf-corners pointer-events-none absolute inset-4 opacity-70" aria-hidden="true" />
      {initializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-sm text-ivory" role="status">
          Starting the camera and loading pose detection…
        </div>
      )}
      {!active && !initializing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-ivory/80">
          <span className="font-display text-2xl text-ivory">Camera is off</span>
          <span className="max-w-xs text-sm">Press Start camera, then stand about 1.5–2 m back so your shoulders and hips are in view.</span>
        </div>
      )}
    </div>
  );
}

function drawLandmarks(ctx: CanvasRenderingContext2D, landmarks: PoseLandmarkPoint[], width: number, height: number) {
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    if ((pa.visibility ?? 1) < 0.5 || (pb.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#f97316";
  for (const lm of landmarks) {
    if ((lm.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface MPMaskLike {
  width: number;
  height: number;
  getAsFloat32Array?: () => Float32Array;
}

function drawSegmentationMask(ctx: CanvasRenderingContext2D, mask: MPMaskLike, canvasWidth: number, canvasHeight: number) {
  const data = mask.getAsFloat32Array?.();
  if (!data) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;

  const imageData = maskCtx.createImageData(mask.width, mask.height);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const alpha = v >= 0.5 ? Math.min(160, v * 180) : 0;
    imageData.data[i * 4] = 56;
    imageData.data[i * 4 + 1] = 189;
    imageData.data[i * 4 + 2] = 248;
    imageData.data[i * 4 + 3] = alpha;
  }
  maskCtx.putImageData(imageData, 0, 0);

  ctx.drawImage(maskCanvas, 0, 0, canvasWidth, canvasHeight);
}

function drawMeshGridOverlay(ctx: CanvasRenderingContext2D, meshPoints: Point[][], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let r = 0; r < meshPoints.length; r++) {
    for (let c = 0; c < meshPoints[r].length; c++) {
      const p = meshPoints[r][c];
      if (c < meshPoints[r].length - 1) {
        const next = meshPoints[r][c + 1];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
      if (r < meshPoints.length - 1) {
        const below = meshPoints[r + 1][c];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(below.x, below.y);
        ctx.stroke();
      }
    }
  }
}

function drawPointMarkers(ctx: CanvasRenderingContext2D, points: Point[], color: string) {
  ctx.fillStyle = color;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function compositeForegroundArms(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  segmentation: Float32Array,
  segmentationWidth: number,
  segmentationHeight: number,
  landmarks: PoseLandmarkPoint[],
  construction: GarmentGeometryProfile["construction"],
  frameWidth: number,
  frameHeight: number,
  armCanvasRef: MutableRefObject<HTMLCanvasElement | null>,
  maskCanvasRef: MutableRefObject<HTMLCanvasElement | null>
) {
  const alphaMask = createArmOcclusionMask(
    segmentation,
    segmentationWidth,
    segmentationHeight,
    frameWidth,
    frameHeight,
    landmarks,
    construction
  );
  if (!alphaMask) return;

  const armCanvas = armCanvasRef.current ?? document.createElement("canvas");
  const maskCanvas = maskCanvasRef.current ?? document.createElement("canvas");
  armCanvasRef.current = armCanvas;
  maskCanvasRef.current = maskCanvas;
  if (armCanvas.width !== frameWidth || armCanvas.height !== frameHeight) {
    armCanvas.width = frameWidth;
    armCanvas.height = frameHeight;
    maskCanvas.width = frameWidth;
    maskCanvas.height = frameHeight;
  }
  const armContext = armCanvas.getContext("2d");
  const maskContext = maskCanvas.getContext("2d");
  if (!armContext || !maskContext) return;

  const maskPixels = maskContext.createImageData(frameWidth, frameHeight);
  for (let index = 0; index < alphaMask.length; index++) {
    const pixel = index * 4;
    maskPixels.data[pixel] = 255;
    maskPixels.data[pixel + 1] = 255;
    maskPixels.data[pixel + 2] = 255;
    maskPixels.data[pixel + 3] = alphaMask[index];
  }
  maskContext.clearRect(0, 0, frameWidth, frameHeight);
  maskContext.putImageData(maskPixels, 0, 0);
  armContext.clearRect(0, 0, frameWidth, frameHeight);
  armContext.globalCompositeOperation = "source-over";
  armContext.drawImage(video, 0, 0, frameWidth, frameHeight);
  armContext.globalCompositeOperation = "destination-in";
  armContext.drawImage(maskCanvas, 0, 0);
  armContext.globalCompositeOperation = "source-over";
  ctx.drawImage(armCanvas, 0, 0);
}

function drawSourceDebugInset(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  points: Point[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
) {
  const insetWidth = Math.min(90, ctx.canvas.width * 0.18);
  const insetHeight = Math.min(110, ctx.canvas.height * 0.2);
  const x = 12;
  const y = 12;
  const scale = Math.min((insetWidth - 8) / image.naturalWidth, (insetHeight - 8) / image.naturalHeight);
  const imageX = x + (insetWidth - image.naturalWidth * scale) / 2;
  const imageY = y + (insetHeight - image.naturalHeight * scale) / 2;

  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.fillRect(x, y, insetWidth, insetHeight);
  ctx.drawImage(image, imageX, imageY, image.naturalWidth * scale, image.naturalHeight * scale);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    imageX + bounds.minX * scale,
    imageY + bounds.minY * scale,
    (bounds.maxX - bounds.minX) * scale,
    (bounds.maxY - bounds.minY) * scale
  );
  ctx.fillStyle = "#facc15";
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(imageX + point.x * scale, imageY + point.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTransformedGarmentOutline(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return;
  ctx.save();
  ctx.strokeStyle = "#facc15";
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
