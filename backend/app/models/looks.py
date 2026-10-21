from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint

from app.models.product import Base, gen_uuid


class WishlistItem(Base):
    """A favourited product. Per user; product-level (colour lives on SavedLook)."""

    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SavedLook(Base):
    """Metadata for a look the user wants to revisit: which product, which
    colour, when, and an optional label.

    PRIVACY: there is intentionally no column for the uploaded photo or the
    generated image. Saving a look never stores image bytes or image URLs;
    users keep images by downloading them to their own device.
    """

    __tablename__ = "saved_looks"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    color_name = Column(String, nullable=False)
    label = Column(String(80), nullable=True)
    # Which engine produced the preview the user was looking at when saving
    # ("browser_fit" | "catvton" | None). Informational only.
    source = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
