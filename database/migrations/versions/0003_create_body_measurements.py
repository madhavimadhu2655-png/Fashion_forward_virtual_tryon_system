"""create body_measurements table

Revision ID: 0003_create_body_measurements
Revises: 0002_create_users
Create Date: 2026-08-13

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0003_create_body_measurements"
down_revision = "0002_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "body_measurements",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("shoulder_width", sa.Float(), nullable=True),
        sa.Column("hip_width", sa.Float(), nullable=True),
        sa.Column("torso_length", sa.Float(), nullable=True),
        sa.Column("chest_estimate", sa.Float(), nullable=True),
        sa.Column("waist_estimate", sa.Float(), nullable=True),
        sa.Column("user_height", sa.Float(), nullable=True),
        sa.Column("measurement_unit", sa.String(), nullable=False, server_default="normalized"),
        sa.Column("orientation", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_body_measurements_user_id", "body_measurements", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_body_measurements_user_id", table_name="body_measurements")
    op.drop_table("body_measurements")
