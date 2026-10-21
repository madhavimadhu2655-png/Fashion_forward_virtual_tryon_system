import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Text,
    Numeric,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    description = Column(Text, default="")
    price = Column(Numeric(10, 2), nullable=False)
    discount_price = Column(Numeric(10, 2), nullable=True)
    fabric = Column(String, default="")
    fit_type = Column(String, default="")
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    stock = Column(Integer, default=0)
    is_trending = Column(Boolean, default=False)
    is_new = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    sizes = relationship("ProductSize", back_populates="product", cascade="all, delete-orphan")
    garment_asset = relationship(
        "GarmentAsset", back_populates="product", uselist=False, cascade="all, delete-orphan"
    )
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")


class ProductImage(Base):
    """Normal e-commerce photography — front/back/side/detail/thumbnail.
    Distinct from GarmentAsset, which holds the isolated try-on asset."""

    __tablename__ = "product_images"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    image_type = Column(String, nullable=False)  # front | back | side | detail | thumbnail
    image_url = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)

    product = relationship("Product", back_populates="images")


class ProductVariant(Base):
    """A color option for a product."""

    __tablename__ = "product_variants"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    color_name = Column(String, nullable=False)
    color_hex = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    stock = Column(Integer, default=0)
    price = Column(Numeric(10, 2), nullable=True)  # optional per-color price override

    product = relationship("Product", back_populates="variants")


class ProductSize(Base):
    """Garment measurements per size — used later for AI size recommendation."""

    __tablename__ = "product_sizes"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    size = Column(String, nullable=False)  # XS | S | M | L | XL
    shoulder_cm = Column(Float, nullable=True)
    chest_cm = Column(Float, nullable=True)
    waist_cm = Column(Float, nullable=True)
    length_cm = Column(Float, nullable=True)
    stock = Column(Integer, default=0)

    product = relationship("Product", back_populates="sizes")


class GarmentAsset(Base):
    """Try-on-specific asset — NOT the shopping photo.

    tryon_image / mask_image are placeholders in this milestone (same
    generated SVG as the product photos). Real isolated garment PNGs +
    masks + control points get supplied when the AI try-on pipeline is
    built; this table exists now so that milestone doesn't need a schema
    migration to add itself in.
    """

    __tablename__ = "garment_assets"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False, unique=True)
    tryon_image = Column(String, nullable=True)
    mask_image = Column(String, nullable=True)
    asset_width = Column(Integer, nullable=True)
    asset_height = Column(Integer, nullable=True)
    garment_type = Column(String, nullable=True)
    fabric_type = Column(String, nullable=True)
    control_points = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="garment_asset")


class Review(Base):
    """Minimal schema now; review submission UI/API comes later."""

    __tablename__ = "reviews"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    rating = Column(Float, nullable=False)
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="reviews")
