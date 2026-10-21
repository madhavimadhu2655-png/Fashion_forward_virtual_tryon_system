import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CameraFeed, { type TpsDebugInfo } from "../components/CameraFeed";
import {
  estimateMeasurements,
  LANDMARK,
  type PoseLandmarkPoint,
  type PoseQualityResult,
} from "../lib/poseAnalysis";
import type { SegmentationQualityResult } from "../lib/segmentationAnalysis";
import { useGarmentAsset } from "../hooks/useGarmentAsset";
import { saveMeasurement, fetchMyMeasurements, fetchProduct, fetchProducts } from "../services/api";
import type { ProductDetail, ProductListItem } from "../types/product";
import type { MeasurementPayload, MeasurementRecord } from "../types/measurement";
import StudioHeader from "../components/studio/StudioHeader";
import GarmentPicker from "../components/studio/GarmentPicker";
import Icon from "../components/Icon";
import { Notice, Spinner } from "../components/ui";
import { useGarmentRefs } from "../hooks/useTryOnData";

interface LiveMeasurementSnapshot {
  values: ReturnType<typeof estimateMeasurements>;
  confidence: number;
  capturedAt: string;
}

const EMPTY_POSE_QUALITY: PoseQualityResult = {
  pose_valid: false,
  orientation: "uncertain",
  confidence: 0,
  message: "Start the camera to begin.",
  landmarksDetected: { shoulders: false, hips: false, wrists: false },
};

const EMPTY_SEG_QUALITY: SegmentationQualityResult = {
  person_detected: false,
  person_area_fraction: 0,
  confidence: 0,
  message: "Start the camera to begin.",
};

const EMPTY_TPS_DEBUG: TpsDebugInfo = {
  controlPointCount: 0,
  regularization: 0,
  warpResolution: "--",
  processingMs: null,
  fps: null,
  videoDimensions: "--",
  canvasDimensions: "--",
  garmentDimensions: "--",
  torsoWidthPx: null,
  coordinateSpace: "--",
  warpStrength: null,
  warpWarning: null,
  garmentConstruction: "--",
  segmentationStatus: "not started",
  invalidControlPoints: [],
  lastWarpError: null,
};

export default function TryOn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProductId = searchParams.get("product");

  const [catalog, setCatalog] = useState<ProductListItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId);
  const [, setProduct] = useState<ProductDetail | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const {
    asset: garmentAsset,
    state: garmentAssetState,
    errorMessage: garmentAssetError,
    revision: garmentAssetRevision,
    retry: retryGarmentAsset,
  } = useGarmentAsset(selectedProductId, selectedColor);

  const garmentRefs = useGarmentRefs();
  const [cameraActive, setCameraActive] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showBodyMask, setShowBodyMask] = useState(false);
  const [showGarment, setShowGarment] = useState(true);
  const [showGarmentControlPoints, setShowGarmentControlPoints] = useState(false);
  const [showBodyTargetPoints, setShowBodyTargetPoints] = useState(false);
  const [showTpsMesh, setShowTpsMesh] = useState(false);
  const [smoothingAlpha, setSmoothingAlpha] = useState(0.7);

  const [quality, setQuality] = useState<PoseQualityResult>(EMPTY_POSE_QUALITY);
  const [segQuality, setSegQuality] = useState<SegmentationQualityResult>(EMPTY_SEG_QUALITY);
  const [tpsDebug, setTpsDebug] = useState<TpsDebugInfo>(EMPTY_TPS_DEBUG);
  const [landmarks, setLandmarks] = useState<PoseLandmarkPoint[] | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [garmentImageError, setGarmentImageError] = useState<string | null>(null);
  const [loadedGarmentProductId, setLoadedGarmentProductId] = useState<string | null>(null);
  const [userHeight, setUserHeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveMeasurementSnapshot | null>(null);
  const latestLiveSnapshotRef = useRef<LiveMeasurementSnapshot | null>(null);
  const pendingSaveRef = useRef<MeasurementPayload | null>(null);
  const saveInFlightRef = useRef(false);
  const [latestSavedMeasurement, setLatestSavedMeasurement] = useState<MeasurementRecord | null>(null);
  const [savedMeasurementLoading, setSavedMeasurementLoading] = useState(true);
  const [savedMeasurementError, setSavedMeasurementError] = useState<string | null>(null);
  const [savedMeasurementRefresh, setSavedMeasurementRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProducts({ limit: 60 })
      .then((res) => {
        if (!cancelled) {
          setCatalog(res.items);
          setCatalogError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : "Couldn't load the product catalogue.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMyMeasurements()
      .then((records) => {
        if (!cancelled) {
          setLatestSavedMeasurement(records[0] ?? null);
          setSavedMeasurementError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSavedMeasurementError(
            err instanceof Error ? err.message : "Couldn't load your saved measurements."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSavedMeasurementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [savedMeasurementRefresh]);

  useEffect(() => {
    setSelectedProductId(searchParams.get("product"));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setProductError(null);
    if (!selectedProductId) {
      setProduct(null);
      setSelectedColor(null);
      return () => {
        cancelled = true;
      };
    }
    setProduct(null);
    setSelectedColor(null);
    fetchProduct(selectedProductId)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setSelectedColor(p.variants[0]?.color_name ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setProduct(null);
        setProductError(err instanceof Error ? err.message : "Couldn't load this product.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  useEffect(() => {
    setGarmentImageError(null);
  }, [selectedProductId, selectedColor]);

  const formatLandmark = (index: number) => {
    const point = landmarks?.[index];
    return point
      ? `${point.x.toFixed(3)}, ${point.y.toFixed(3)} (${Math.round((point.visibility ?? 0) * 100)}%)`
      : "--";
  };

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setSearchParams({ product: productId }, { replace: true });
  }

  function handleStart() {
    setCameraError(null);
    setGarmentImageError(null);
    setQuality(EMPTY_POSE_QUALITY);
    setSegQuality(EMPTY_SEG_QUALITY);
    setTpsDebug(EMPTY_TPS_DEBUG);
    setCameraActive(true);
  }

  function handleStop() {
    setCameraActive(false);
    setQuality(EMPTY_POSE_QUALITY);
    setSegQuality(EMPTY_SEG_QUALITY);
    setTpsDebug(EMPTY_TPS_DEBUG);
    setLandmarks(null);
  }

  function handleCameraError(message: string) {
    setCameraError(message);
    setCameraActive(false);
    setQuality(EMPTY_POSE_QUALITY);
    setSegQuality(EMPTY_SEG_QUALITY);
    setTpsDebug(EMPTY_TPS_DEBUG);
    setLandmarks(null);
  }

  async function handleSave() {
    if (saveInFlightRef.current) return;
    setSaveMessage(null);
    let snapshot = pendingSaveRef.current;
    if (!snapshot) {
      const latest = latestLiveSnapshotRef.current;
      if (!latest || latest.confidence < 0.5) {
        setSaveMessage("A valid, front-facing measurement is required. Stand in frame with your shoulders and hips visible.");
        return;
      }
      const height = userHeight.trim() ? Number(userHeight) : null;
      if (height !== null && (!Number.isFinite(height) || height <= 0 || height > 250)) {
        setSaveMessage("Enter a valid height between 1 and 250 cm, or leave it blank.");
        return;
      }
      snapshot = {
        shoulder_width: latest.values.shoulder_width,
        hip_width: latest.values.hip_width,
        torso_length: latest.values.torso_length,
        chest_estimate: null,
        waist_estimate: null,
        user_height: height,
        measurement_unit: "normalized",
        measurement_method: "mediapipe_pose_2d",
        orientation: "front",
        confidence: latest.confidence,
        idempotency_key: crypto.randomUUID(),
      } satisfies MeasurementPayload;
    }
    if (!snapshot) {
      setSaveMessage("A valid, front-facing measurement is required. Stand in frame with your shoulders and hips visible.");
      return;
    }
    pendingSaveRef.current = snapshot;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const saved = await saveMeasurement(snapshot);
      setLatestSavedMeasurement(saved);
      setSavedMeasurementError(null);
      setSaveMessage(`Measurement saved at ${new Date(saved.created_at).toLocaleString()}.`);
      pendingSaveRef.current = null;
    } catch (err) {
      setSaveMessage(
        `${err instanceof Error ? err.message : "Couldn't save measurement."} Your captured values are retained; retry to submit the same snapshot.`
      );
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  const missingAssetMessage =
    garmentAsset && !garmentAsset.asset_available
      ? garmentAsset.requested_color
        ? "Try-on asset unavailable for this color."
        : "Virtual Try-On is not available for this product yet."
      : null;

  const statusTone = !cameraActive ? "neutral" : quality.pose_valid ? "good" : "adjust";

  return (
    <div className="page pb-16 pt-10 lg:pt-14">
      <StudioHeader
        title="Live camera try-on"
        lede="Stand back, face the camera and watch the top follow your shoulders and torso in real time. Everything runs in your browser."
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 space-y-4">
          <div className="relative overflow-hidden rounded-card bg-ink shadow-lift">
            <CameraFeed
              active={cameraActive}
              showLandmarks={showLandmarks}
              showBodyMask={showBodyMask}
              showGarment={showGarment}
              showGarmentControlPoints={showGarmentControlPoints}
              showBodyTargetPoints={showBodyTargetPoints}
              showTpsMesh={showTpsMesh}
              smoothingAlpha={smoothingAlpha}
              garmentAsset={garmentAsset}
              garmentAssetRevision={garmentAssetRevision}
              onPoseUpdate={(lm, q) => {
                setLandmarks(lm);
                setQuality(q);
                const current = estimateMeasurements(lm, q);
                if (
                  q.pose_valid &&
                  q.orientation === "front" &&
                  q.confidence >= 0.5 &&
                  current.shoulder_width !== null &&
                  current.hip_width !== null &&
                  current.torso_length !== null
                ) {
                  const snapshot = {
                    values: current,
                    confidence: q.confidence,
                    capturedAt: new Date().toISOString(),
                  };
                  latestLiveSnapshotRef.current = snapshot;
                  setLiveSnapshot(snapshot);
                }
              }}
              onSegmentationUpdate={setSegQuality}
              onTpsDebugUpdate={setTpsDebug}
              onGarmentImageError={setGarmentImageError}
              onGarmentImageReady={setLoadedGarmentProductId}
              onError={handleCameraError}
            />
            {cameraActive && (
              <div
                className={`pointer-events-none absolute left-3 top-3 flex max-w-[80%] items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-soft backdrop-blur ${
                  statusTone === "good" ? "bg-sage/90 text-ivory" : "bg-porcelain/90 text-ink"
                }`}
                role="status"
              >
                <Icon name={statusTone === "good" ? "check" : "frame"} size={14} />
                {quality.message}
              </div>
            )}
          </div>

          {cameraError && (
            <Notice tone="error" live title="Camera unavailable">
              {cameraError} Allow camera access in your browser settings, close other apps using the camera, then try again.
            </Notice>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!cameraActive ? (
              <button onClick={handleStart} className="btn btn-accent btn-lg">
                <Icon name="camera" size={18} /> Start camera
              </button>
            ) : (
              <button onClick={handleStop} className="btn btn-ghost btn-lg">
                Stop camera
              </button>
            )}
            <p className="flex items-center gap-2 text-xs text-stone">
              <Icon name="shield" size={14} className="text-wine" />
              Video is processed on this device and never uploaded or recorded.
            </p>
          </div>

          {import.meta.env.DEV && (
            <details className="card p-4 text-xs text-stone">
              <summary className="cursor-pointer font-semibold text-ink">Developer overlays</summary>
              <div className="mt-3 flex flex-wrap gap-3">
                {[
                  ["Landmarks", showLandmarks, setShowLandmarks],
                  ["Body mask", showBodyMask, setShowBodyMask],
                  ["Garment", showGarment, setShowGarment],
                  ["Source points + bounds", showGarmentControlPoints, setShowGarmentControlPoints],
                  ["Body target points", showBodyTargetPoints, setShowBodyTargetPoints],
                  ["TPS mesh", showTpsMesh, setShowTpsMesh],
                ].map(([label, value, setter]) => (
                  <label key={label as string} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={value as boolean} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} />
                    {label as string}
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2">
                Landmark smoothing
                <input type="range" min={0.1} max={0.9} step={0.05} value={smoothingAlpha} onChange={(e) => setSmoothingAlpha(Number(e.target.value))} className="w-32" />
                <span className="font-mono">{smoothingAlpha.toFixed(2)}</span>
              </label>
              <dl className="mt-4 grid gap-1 font-mono sm:grid-cols-2">
                <p>Product: {selectedProductId ?? "none"}</p>
                <p>Asset: {garmentAsset ? (garmentAsset.asset_available ? "AVAILABLE" : "MISSING") : "N/A"}</p>
                <p>Pose: {quality.orientation.toUpperCase()} ({quality.confidence.toFixed(3)})</p>
                <p>Shoulders: {formatLandmark(LANDMARK.LEFT_SHOULDER)} | {formatLandmark(LANDMARK.RIGHT_SHOULDER)}</p>
                <p>Hips: {formatLandmark(LANDMARK.LEFT_HIP)} | {formatLandmark(LANDMARK.RIGHT_HIP)}</p>
                <p>Segmentation: {segQuality.person_detected ? "person" : "none"} · {Math.round(segQuality.person_area_fraction * 100)}% · {tpsDebug.segmentationStatus}</p>
                <p>Control points: {tpsDebug.controlPointCount} · construction {tpsDebug.garmentConstruction}</p>
                <p>Invalid points: {tpsDebug.invalidControlPoints.join(", ") || "none"}</p>
                <p>Regularization: {tpsDebug.regularization} · warp {tpsDebug.warpResolution}</p>
                <p>Video / canvas: {tpsDebug.videoDimensions} / {tpsDebug.canvasDimensions}</p>
                <p>Garment image: {tpsDebug.garmentDimensions}</p>
                <p>Shoulder span: {tpsDebug.torsoWidthPx?.toFixed(1) ?? "--"} px · {tpsDebug.coordinateSpace}</p>
                <p>Warp strength: {tpsDebug.warpStrength !== null ? `${Math.round(tpsDebug.warpStrength * 100)}%` : "--"}</p>
                <p>Processing: {tpsDebug.processingMs ?? "--"} ms · {tpsDebug.fps ?? "--"} fps (warp update rate)</p>
                {tpsDebug.warpWarning && <p className="text-amber">{tpsDebug.warpWarning}</p>}
                {tpsDebug.lastWarpError && <p className="text-danger">Warp error: {tpsDebug.lastWarpError}</p>}
              </dl>
            </details>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <GarmentPicker
            heading="Choose a crop top"
            products={catalog}
            loading={catalog.length === 0 && !catalogError}
            productId={selectedProductId}
            colorName={selectedColor}
            onChange={(productId, color) => {
              if (productId !== selectedProductId) selectProduct(productId);
              else setSelectedColor(color);
            }}
            isExact={garmentRefs.isExact}
          />
          {catalogError && <Notice tone="error">{catalogError}</Notice>}
          {productError && <Notice tone="error">{productError}</Notice>}
          {garmentAssetState === "loading" && <Spinner label="Checking the garment cutout…" className="text-sm text-stone" />}
          {garmentAssetState === "error" && (
            <Notice tone="error" action={<button className="btn btn-ghost btn-sm" onClick={retryGarmentAsset}>Retry</button>}>
              {garmentAssetError ?? "Couldn't check try-on asset availability."}
            </Notice>
          )}
          {missingAssetMessage && <Notice tone="warning">{missingAssetMessage}</Notice>}
          {garmentImageError && (
            <Notice tone="error" action={<button className="btn btn-ghost btn-sm" onClick={retryGarmentAsset}>Retry</button>}>
              {garmentImageError}
            </Notice>
          )}
          {garmentAsset?.asset_available && !garmentAsset.exact_color_match && selectedColor && (
            <Notice tone="info">
              The live overlay uses the product's {garmentAsset.verified_color ?? "reference"} cutout; {selectedColor} isn't recoloured
              in real time. Use photo try-on for a recoloured preview.
            </Notice>
          )}
          {garmentAsset?.asset_available && loadedGarmentProductId === selectedProductId && (
            <p className="flex items-center gap-2 text-xs text-sage">
              <Icon name="check" size={14} /> Garment cutout loaded and transparency verified.
            </p>
          )}

          <section className="card p-5">
            <h2 className="font-display text-xl">Body detection</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-control bg-canvas/70 p-3">
                <dt className="text-xs text-stone">Pose</dt>
                <dd className="mt-0.5 font-medium capitalize">{quality.orientation}</dd>
              </div>
              <div className="rounded-control bg-canvas/70 p-3">
                <dt className="text-xs text-stone">Confidence</dt>
                <dd className="mt-0.5 font-medium tabular">{Math.round(quality.confidence * 100)}%</dd>
              </div>
            </dl>
            <p className={`mt-3 text-sm ${quality.pose_valid ? "text-sage" : "text-stone"}`}>{quality.message}</p>
          </section>

          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5">
              <span>
                <span className="block font-display text-xl">Body proportions</span>
                <span className="text-xs text-stone">Relative frame units — not centimetres</span>
              </span>
              <Icon name="chevronDown" size={18} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 px-5 pb-5 text-sm">
              <dl className="space-y-1.5 tabular">
                <div className="flex justify-between">
                  <dt className="text-stone">Shoulder width</dt>
                  <dd>{liveSnapshot?.values.shoulder_width ?? "--"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone">Torso length</dt>
                  <dd>{liveSnapshot?.values.torso_length ?? "--"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone">Hip width</dt>
                  <dd>{liveSnapshot?.values.hip_width ?? "--"}</dd>
                </div>
              </dl>
              <p className="text-xs leading-5 text-stone">
                {quality.pose_valid
                  ? `Current pose confidence: ${Math.round(quality.confidence * 100)}%.`
                  : liveSnapshot
                    ? `Showing the last valid capture (${new Date(liveSnapshot.capturedAt).toLocaleTimeString()}).`
                    : quality.message}{" "}
                These are uncalibrated 2D ratios and can't tell you your size.
              </p>
              <div>
                <label className="label" htmlFor="user-height">
                  Height in cm (optional, stored for future calibration)
                </label>
                <input id="user-height" type="number" value={userHeight} onChange={(e) => setUserHeight(e.target.value)} placeholder="e.g. 165" className="field" />
              </div>
              <button onClick={handleSave} disabled={!liveSnapshot || saving} className="btn btn-primary w-full">
                {saving ? "Saving…" : "Save proportions"}
              </button>
              {saveMessage && (
                <p role="status" className={`text-xs ${saveMessage.includes("saved at") ? "text-sage" : "text-danger"}`}>
                  {saveMessage}
                </p>
              )}
              <div className="border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-stone">Last saved</p>
                {savedMeasurementLoading ? (
                  <p className="mt-2 text-xs text-stone">Loading…</p>
                ) : savedMeasurementError ? (
                  <div className="mt-2">
                    <p role="alert" className="text-xs text-danger">
                      {savedMeasurementError}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-wine underline"
                      onClick={() => {
                        setSavedMeasurementLoading(true);
                        setSavedMeasurementRefresh((refresh) => refresh + 1);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : latestSavedMeasurement ? (
                  <p className="mt-2 text-xs leading-5 text-ink-soft tabular">
                    {new Date(latestSavedMeasurement.created_at).toLocaleString()} · shoulders {latestSavedMeasurement.shoulder_width ?? "--"} · torso{" "}
                    {latestSavedMeasurement.torso_length ?? "--"} · hips {latestSavedMeasurement.hip_width ?? "--"} ({latestSavedMeasurement.measurement_unit}, confidence{" "}
                    {latestSavedMeasurement.confidence !== null ? `${Math.round(latestSavedMeasurement.confidence * 100)}%` : "--"})
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-stone">Nothing saved yet.</p>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
