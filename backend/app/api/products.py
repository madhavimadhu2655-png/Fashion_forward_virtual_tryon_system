from typing import Optional

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.crud import product as crud
from app.schemas.product import (
    ProductListResponse,
    ProductListItemOut,
    ProductDetailOut,
    FilterOptionsOut,
)
from app.schemas.garment import GarmentAssetOut
from pathlib import Path

from app.utils.garment_refs import generic_reference_color
from app.utils.slug import slugify

GARMENT_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "garment-assets")

router = APIRouter(prefix="/api/products", tags=["products"])


def _parse_csv(value: Optional[str]) -> Optional[list[str]]:
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()]


@router.get("", response_model=ProductListResponse)
def list_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    colors: Optional[str] = Query(None, description="Comma-separated color names"),
    sizes: Optional[str] = Query(None, description="Comma-separated sizes"),
    fabric: Optional[str] = None,
    fit: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    is_trending: Optional[bool] = None,
    is_new: Optional[bool] = None,
    sort: str = "popular",
    skip: int = 0,
    limit: int = 24,
    db: Session = Depends(get_db),
):
    try:
        items, total = crud.list_products(
            db,
            search=search,
            category=category,
            colors=_parse_csv(colors),
            sizes=_parse_csv(sizes),
            fabric=fabric,
            fit=fit,
            min_price=min_price,
            max_price=max_price,
            min_rating=min_rating,
            is_trending=is_trending,
            is_new=is_new,
            sort=sort,
            skip=skip,
            limit=limit,
        )
    except Exception as exc:  # database unavailable, bad query, etc.
        raise HTTPException(status_code=503, detail=f"Could not query products: {exc}")

    return {
        "items": [crud.to_list_item_dict(p) for p in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/search", response_model=ProductListResponse)
def search_products(q: str = "", db: Session = Depends(get_db)):
    items, total = crud.list_products(db, search=q, limit=50)
    return {
        "items": [crud.to_list_item_dict(p) for p in items],
        "total": total,
        "skip": 0,
        "limit": 50,
    }


@router.get("/filters", response_model=FilterOptionsOut)
def get_filter_options(db: Session = Depends(get_db)):
    return crud.get_filter_options(db)


@router.get("/{product_id}", response_model=ProductDetailOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/images")
def get_product_images(product_id: str, db: Session = Depends(get_db)):
    product = crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product.images


@router.get("/{product_id}/variants")
def get_product_variants(product_id: str, db: Session = Depends(get_db)):
    product = crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product.variants


@router.get("/{product_id}/sizes")
def get_product_sizes(product_id: str, db: Session = Depends(get_db)):
    product = crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product.sizes


@router.get("/{product_id}/garment-assets", response_model=GarmentAssetOut)
def get_garment_assets(product_id: str, color: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns what the virtual try-on pipeline can actually use right now.
    asset_available is honestly False when no real tryon.png exists on
    disk — this never fabricates a usable asset. If `color` is given and
    a color-specific file (tryon-<slug>.png) isn't present, this falls
    back to the generic tryon.png and reports fallback_used=True so the
    frontend can be transparent about it rather than silently swapping.
    """
    product = crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    def asset_path(filename: str) -> str:
        return os.path.join(GARMENT_ASSETS_DIR, product_id, filename)

    def asset_url(filename: str) -> str:
        return f"/static/garment-assets/{product_id}/{filename}"

    tryon_filename = "tryon.png"
    mask_filename = "mask.png"
    fallback_used = False

    if color:
        color_slug = slugify(color)
        color_tryon = f"tryon-{color_slug}.png"
        color_mask = f"mask-{color_slug}.png"
        if os.path.exists(asset_path(color_tryon)):
            tryon_filename = color_tryon
            mask_filename = color_mask if os.path.exists(asset_path(color_mask)) else mask_filename
        else:
            fallback_used = os.path.exists(asset_path("tryon.png"))

    tryon_exists = os.path.exists(asset_path(tryon_filename))
    color_specific = tryon_filename != "tryon.png"
    verified_color = (
        color
        if color_specific
        else generic_reference_color(Path(GARMENT_ASSETS_DIR), product_id) if tryon_exists else None
    )
    exact_color_match = bool(
        tryon_exists and color and verified_color and verified_color.casefold() == color.casefold()
    )
    mask_exists = os.path.exists(asset_path(mask_filename))

    garment_type = product.garment_asset.garment_type if product.garment_asset else product.category
    fabric_type = product.garment_asset.fabric_type if product.garment_asset else product.fabric

    return GarmentAssetOut(
        product_id=product_id,
        garment_type=garment_type,
        fabric_type=fabric_type,
        colors=product.variants,
        requested_color=color,
        fallback_used=fallback_used,
        asset_available=tryon_exists,
        tryon_url=asset_url(tryon_filename) if tryon_exists else None,
        mask_url=asset_url(mask_filename) if mask_exists else None,
        verified_color=verified_color,
        exact_color_match=exact_color_match,
    )
