"""wishlist, saved looks (metadata only) and collaborative fitting rooms

Revision ID: 0005_looks_and_fitting_rooms
Revises: 0004_measurement_retry
Create Date: 2026-10-19

No table here has a column for uploaded photos or generated images.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_looks_and_fitting_rooms"
down_revision = "0004_measurement_retry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wishlist_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
    )
    op.create_index("ix_wishlist_items_user_id", "wishlist_items", ["user_id"])

    op.create_table(
        "saved_looks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("color_name", sa.String(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_saved_looks_user_id", "saved_looks", ["user_id"])

    op.create_table(
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
    )
    op.create_index("ix_fitting_rooms_short_code", "fitting_rooms", ["short_code"], unique=True)
    op.create_index("ix_fitting_rooms_owner_id", "fitting_rooms", ["owner_id"])

    op.create_table(
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
    )
    op.create_index("ix_room_members_room_id", "room_members", ["room_id"])
    op.create_index("ix_room_members_user_id", "room_members", ["user_id"])

    op.create_table(
        "room_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("room_id", sa.String(), sa.ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("target_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_room_messages_room_id", "room_messages", ["room_id"])
    op.create_index("ix_room_messages_created_at", "room_messages", ["created_at"])

    op.create_table(
        "room_votes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("room_id", sa.String(), sa.ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voter_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("room_id", "voter_id", name="uq_room_vote_voter"),
    )
    op.create_index("ix_room_votes_room_id", "room_votes", ["room_id"])


def downgrade() -> None:
    op.drop_index("ix_room_votes_room_id", table_name="room_votes")
    op.drop_table("room_votes")
    op.drop_index("ix_room_messages_created_at", table_name="room_messages")
    op.drop_index("ix_room_messages_room_id", table_name="room_messages")
    op.drop_table("room_messages")
    op.drop_index("ix_room_members_user_id", table_name="room_members")
    op.drop_index("ix_room_members_room_id", table_name="room_members")
    op.drop_table("room_members")
    op.drop_index("ix_fitting_rooms_owner_id", table_name="fitting_rooms")
    op.drop_index("ix_fitting_rooms_short_code", table_name="fitting_rooms")
    op.drop_table("fitting_rooms")
    op.drop_index("ix_saved_looks_user_id", table_name="saved_looks")
    op.drop_table("saved_looks")
    op.drop_index("ix_wishlist_items_user_id", table_name="wishlist_items")
    op.drop_table("wishlist_items")
