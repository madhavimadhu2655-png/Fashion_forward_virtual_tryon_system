"""Add measurement method and request idempotency.

Revision ID: 0004_measurement_retry
Revises: 0003_create_body_measurements
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_measurement_retry"
down_revision = "0003_create_body_measurements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "body_measurements",
        sa.Column("measurement_method", sa.String(), nullable=False, server_default="mediapipe_pose_2d"),
    )
    op.add_column("body_measurements", sa.Column("idempotency_key", sa.String(), nullable=True))
    op.create_unique_constraint(
        "uq_body_measurements_user_idempotency",
        "body_measurements",
        ["user_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_body_measurements_user_idempotency", "body_measurements", type_="unique")
    op.drop_column("body_measurements", "idempotency_key")
    op.drop_column("body_measurements", "measurement_method")
