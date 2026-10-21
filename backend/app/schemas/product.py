from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    image_type: str
    image_url: str
    sort_order: int


class ProductVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    color_name: str
    color_hex: str
    image_url: Optional[str] = None
    stock: int


class ProductSizeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    size: str
    shoulder_cm: Optional[float] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    length_cm: Optional[float] = None
    stock: int


class ProductListItemOut(BaseModel):
    """Shape used for /api/products (grid/card view) — lighter than the
    full detail response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    brand: str
    category: str
    price: float
    discount_price: Optional[float] = None
    fabric: str = ""
    fit_type: str = ""
    description: str = ""
    rating: float
    review_count: int
    is_trending: bool
    is_new: bool
    thumbnail_url: Optional[str] = None
    colors: list[ProductVariantOut] = []
    sizes: list[str] = []


class ProductDetailOut(BaseModel):
    """Full shape used for /api/products/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    brand: str
    category: str
    description: str
    price: float
    discount_price: Optional[float] = None
    fabric: str
    fit_type: str
    rating: float
    review_count: int
    stock: int
    is_trending: bool
    is_new: bool
    created_at: datetime
    updated_at: datetime
    images: list[ProductImageOut] = []
    variants: list[ProductVariantOut] = []
    sizes: list[ProductSizeOut] = []


class ProductListResponse(BaseModel):
    items: list[ProductListItemOut]
    total: int
    skip: int
    limit: int


class FilterOptionsOut(BaseModel):
    """Distinct values available in the catalogue right now — drives the
    Shop page filter sidebar instead of hardcoded frontend constants."""

    categories: list[str]
    colors: list[ProductVariantOut]
    fabrics: list[str]
    fits: list[str]
    min_price: float
    max_price: float
