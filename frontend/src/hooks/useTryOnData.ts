import { useEffect, useState } from "react";
import { fetchPhotoTryOnCatalog, fetchPhotoTryOnStatus, type PhotoTryOnProduct, type PhotoTryOnStatus } from "../services/api";
import { getGarmentFitProfile } from "../lib/tps/garmentFitProfiles";
import { getGarmentGeometryProfile } from "../lib/tps/garmentGeometry";
import { useGarmentAsset } from "./useGarmentAsset";

/** Which product colours have an exact garment reference (from the backend). */
export function useGarmentRefs() {
  const [refs, setRefs] = useState<PhotoTryOnProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPhotoTryOnCatalog()
      .then((data) => !cancelled && setRefs(data.items))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load garment references."));
    return () => {
      cancelled = true;
    };
  }, []);
  const isExact = (productId: string, colorName: string) =>
    refs.find((p) => p.id === productId)?.colors.find((c) => c.color_name === colorName)?.image_available ?? false;
  return { refs, error, isExact };
}

/** CatVTON readiness, re-checked every 30 s while mounted (no photo is sent). */
export function useAiStatus(enabled = true) {
  const [status, setStatus] = useState<PhotoTryOnStatus | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPhotoTryOnStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    const timer = window.setTimeout(() => setTick((n) => n + 1), 30_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, tick]);
  return { status, error, recheck: () => setTick((n) => n + 1) };
}

/** Everything the browser fit needs for one product/colour. */
export function useFitAsset(productId: string | null, colorName: string | null) {
  const { asset, state, errorMessage, retry } = useGarmentAsset(productId, colorName);
  return {
    loading: state === "loading",
    error: errorMessage,
    retry,
    available: Boolean(asset?.asset_available && asset.tryon_url),
    tryonUrl: asset?.tryon_url ?? null,
    exactColor: Boolean(asset?.exact_color_match),
    verifiedColor: asset?.verified_color ?? null,
    fitProfileAvailable: Boolean(productId && getGarmentFitProfile(productId) && getGarmentGeometryProfile(productId)),
  };
}
