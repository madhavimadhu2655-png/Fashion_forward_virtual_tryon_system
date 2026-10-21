"""Add optional verified size-chart metadata.

Revision ID: 0007_verified_size_charts
Revises: 0005_looks_and_fitting_rooms

This revision also restores the migration graph for existing databases that
were stamped with this revision before its source file was lost.
"""
from alembic import op
import sqlalchemy as sa


revision = "0007_verified_size_charts"
down_revision = "0005_looks_and_fitting_rooms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("products")}
    if "size_chart_source" not in columns:
        op.add_column("products", sa.Column("size_chart_source", sa.String(), nullable=True))
    if "size_chart_verified_at" not in columns:
        op.add_column("products", sa.Column("size_chart_verified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("products")}
    if "size_chart_verified_at" in columns:
        op.drop_column("products", "size_chart_verified_at")
    if "size_chart_source" in columns:
        op.drop_column("products", "size_chart_source")
