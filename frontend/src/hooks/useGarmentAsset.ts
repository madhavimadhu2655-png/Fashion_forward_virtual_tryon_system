import { useEffect, useState } from "react";
import { fetchGarmentAssets } from "../services/api";
import type { GarmentAssetInfo } from "../types/garment";

export type GarmentAssetLoadState = "idle" | "loading" | "loaded" | "error";

interface UseGarmentAssetResult {
  asset: GarmentAssetInfo | null;
  state: GarmentAssetLoadState;
  errorMessage: string | null;
  revision: number;
  retry: () => void;
}

interface GarmentAssetRequest {
  key: string;
  asset: GarmentAssetInfo | null;
  state: GarmentAssetLoadState;
  errorMessage: string | null;
}

/**
 * Fetches garment-asset metadata for a product/color and tracks loading
 * state. This is the ONLY place that knows the garment-assets API shape —
 * components just consume the result, so garment asset paths are never
 * hardcoded inline in a page or camera component.
 */
export function useGarmentAsset(productId: string | null, color: string | null | undefined): UseGarmentAssetResult {
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([productId, color ?? null]);
  const [request, setRequest] = useState<GarmentAssetRequest>({
    key: requestKey,
    asset: null,
    state: productId ? "loading" : "idle",
    errorMessage: null,
  });

  useEffect(() => {
    if (!productId) {
      setRequest({ key: requestKey, asset: null, state: "idle", errorMessage: null });
      return;
    }

    let cancelled = false;
    setRequest({ key: requestKey, asset: null, state: "loading", errorMessage: null });

    fetchGarmentAssets(productId, color ?? undefined)
      .then((data) => {
        if (cancelled) return;
        setRequest({ key: requestKey, asset: data, state: "loaded", errorMessage: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setRequest({
          key: requestKey,
          asset: null,
          state: "error",
          errorMessage: err instanceof Error ? err.message : "Couldn't load garment asset info.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [productId, color, requestKey, revision]);

  const requestMatchesCurrentSelection = request.key === requestKey;
  return {
    asset: requestMatchesCurrentSelection ? request.asset : null,
    state: requestMatchesCurrentSelection ? request.state : productId ? "loading" : "idle",
    errorMessage: requestMatchesCurrentSelection ? request.errorMessage : null,
    revision,
    retry: () => setRevision((value) => value + 1),
  };
}
