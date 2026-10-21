"""Restore tables missing from databases stamped past migration 0005.

Revision ID: 0008_restore_collaborative_rooms
Revises: 0007_verified_size_charts

The 0005 migration already creates these tables on a fresh install. This
forward-only repair makes upgrades safe for databases whose migration stamp
was advanced without applying the 0005 schema.
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_restore_collaborative_rooms"
down_revision = "0007_verified_size_charts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    def create_if_missing(name: str, *columns_and_constraints) -> bool:
        if name in existing:
            return False
        op.create_table(name, *columns_and_constraints)
        existing.add(name)
        return True

    if create_if_missing(
        "wishlist_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "product_id", name="uq_wishlist_items_user_product"),
    ):
        op.create_index("ix_wishlist_items_user_id", "wishlist_items", ["user_id"])

    if create_if_missing(
        "saved_looks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("color_name", sa.String(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ):
        op.create_index("ix_saved_looks_user_id", "saved_looks", ["user_id"])

    if create_if_missing(
        "fitting_rooms",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("short_code", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invite_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_members", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
    ):
        op.create_index("ix_fitting_rooms_short_code", "fitting_rooms", ["short_code"], unique=True)
        op.create_index("ix_fitting_rooms_owner_id", "fitting_rooms", ["owner_id"])

    if create_if_missing(
        "room_members",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("room_id", sa.String(), sa.ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=True),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("color_name", sa.String(), nullable=True),
        sa.Column("selection_updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_member"),
    ):
        op.create_index("ix_room_members_room_id", "room_members", ["room_id"])
        op.create_index("ix_room_members_user_id", "room_members", ["user_id"])

    if create_if_missing(
        "room_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("room_id", sa.String(), sa.ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("target_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    ):
        op.create_index("ix_room_messages_room_id", "room_messages", ["room_id"])
        op.create_index("ix_room_messages_created_at", "room_messages", ["created_at"])

    if create_if_missing(
        "room_votes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("room_id", sa.String(), sa.ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voter_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("room_id", "voter_id", name="uq_room_vote_voter"),
    ):
        op.create_index("ix_room_votes_room_id", "room_votes", ["room_id"])

    if "wishlist_entries" in existing and "wishlist_items" in existing:
        bind.execute(
            sa.text(
                "INSERT INTO wishlist_items (id, user_id, product_id, created_at) "
                "SELECT id, user_id, product_id, COALESCE(created_at, CURRENT_TIMESTAMP) "
                "FROM wishlist_entries ON CONFLICT DO NOTHING"
            )
        )


def downgrade() -> None:
    # This migration is a repair for databases already stamped at 0007.
    # Retain the repaired tables and any data they contain on downgrade.
    pass
