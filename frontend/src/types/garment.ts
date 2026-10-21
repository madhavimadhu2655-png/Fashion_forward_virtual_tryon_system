import type { ColorVariant } from "./product";

export interface GarmentAssetInfo {
  product_id: string;
  garment_type: string | null;
  fabric_type: string | null;
  colors: ColorVariant[];
  requested_color: string | null;
  fallback_used: boolean;
  asset_available: boolean;
  tryon_url: string | null;
  mask_url: string | null;
  /** Catalogue colour the served garment image actually shows, if known. */
  verified_color?: string | null;
  /** True when that colour equals the requested one (no recolouring needed). */
  exact_color_match?: boolean;
}
