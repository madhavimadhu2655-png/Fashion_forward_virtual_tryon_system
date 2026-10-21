from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def clean_label(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = "".join(ch for ch in value if ch.isprintable()).strip()
    return cleaned[:80] or None


class WishlistOut(BaseModel):
    product_ids: list[str]


class WishlistMergeIn(BaseModel):
    product_ids: list[str] = Field(default_factory=list, max_length=100)


class SavedLookIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=64)
    color_name: str = Field(min_length=1, max_length=64)
    label: Optional[str] = Field(default=None, max_length=200)
    source: Optional[Literal["browser_fit", "catvton", "live_camera"]] = None

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: Optional[str]) -> Optional[str]:
        return clean_label(value)


class SavedLookUpdateIn(BaseModel):
    label: Optional[str] = Field(default=None, max_length=200)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: Optional[str]) -> Optional[str]:
        return clean_label(value)


class SavedLookOut(BaseModel):
    """Metadata only — there is no image field by design."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    color_name: str
    label: Optional[str] = None
    source: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    product_name: Optional[str] = None
    product_price: Optional[float] = None
    product_thumbnail_url: Optional[str] = None
    color_hex: Optional[str] = None
