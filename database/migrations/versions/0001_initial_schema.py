"""create products, images, variants, sizes, garment_assets, reviews

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-07

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("brand", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("discount_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("fabric", sa.String(), server_default=""),
        sa.Column("fit_type", sa.String(), server_default=""),
        sa.Column("rating", sa.Float(), server_default="0"),
        sa.Column("review_count", sa.Integer(), server_default="0"),
        sa.Column("stock", sa.Integer(), server_default="0"),
        sa.Column("is_trending", sa.Boolean(), server_default=sa.false()),
        sa.Column("is_new", sa.Boolean(), server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_products_category", "products", ["category"])

    op.create_table(
        "product_images",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("image_type", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
    )

    op.create_table(
        "product_variants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("color_name", sa.String(), nullable=False),
        sa.Column("color_hex", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("stock", sa.Integer(), server_default="0"),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
    )

    op.create_table(
        "product_sizes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("size", sa.String(), nullable=False),
        sa.Column("shoulder_cm", sa.Float(), nullable=True),
        sa.Column("chest_cm", sa.Float(), nullable=True),
        sa.Column("waist_cm", sa.Float(), nullable=True),
        sa.Column("length_cm", sa.Float(), nullable=True),
        sa.Column("stock", sa.Integer(), server_default="0"),
    )

    op.create_table(
        "garment_assets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id"), nullable=False, unique=True),
        sa.Column("tryon_image", sa.String(), nullable=True),
        sa.Column("mask_image", sa.String(), nullable=True),
        sa.Column("asset_width", sa.Integer(), nullable=True),
        sa.Column("asset_height", sa.Integer(), nullable=True),
        sa.Column("garment_type", sa.String(), nullable=True),
        sa.Column("fabric_type", sa.String(), nullable=True),
        sa.Column("control_points", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("comment", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("reviews")
    op.drop_table("garment_assets")
    op.drop_table("product_sizes")
    op.drop_table("product_variants")
    op.drop_table("product_images")
    op.drop_index("ix_products_category", table_name="products")
    op.drop_table("products")
