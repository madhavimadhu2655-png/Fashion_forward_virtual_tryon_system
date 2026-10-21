from typing import Optional

from pydantic import BaseModel

from app.schemas.product import ProductVariantOut


class GarmentAssetOut(BaseModel):
    """
    Response for GET /api/products/{id}/garment-assets — tells the
    frontend exactly what's usable right now, honestly. asset_available
    is False (and both URLs null) when the real files haven't been
    supplied yet; the frontend is expected to show a clear "not
    available" state rather than pretend an overlay exists.
    """

    product_id: str
    garment_type: Optional[str] = None
    fabric_type: Optional[str] = None
    colors: list[ProductVariantOut] = []
    requested_color: Optional[str] = None
    fallback_used: bool = False
    asset_available: bool
    tryon_url: Optional[str] = None
    mask_url: Optional[str] = None
    # Which catalogue colour the served garment image actually shows
    # (colour-specific file, or the visually verified generic cutout), and
    # whether that equals the requested colour. When False, any recolouring
    # done by the browser preview is an approximation and is labelled so.
    verified_color: Optional[str] = None
    exact_color_match: bool = False
