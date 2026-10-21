from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.product import Base, gen_uuid


class FittingRoom(Base):
    """A private, invite-only collaborative fitting room.

    Invitation codes are NOT stored. A code is `<short_code>-<hmac>` where
    the HMAC is derived from the server secret, the room id and
    `invite_version`; rotating the invite bumps the version and instantly
    invalidates every previously shared code.

    Shared AI previews are never written here — they are relayed to current
    members over the WebSocket and held only in bounded process memory.
    """

    __tablename__ = "fitting_rooms"

    id = Column(String, primary_key=True, default=gen_uuid)
    short_code = Column(String(8), nullable=False, unique=True, index=True)
    name = Column(String(60), nullable=False)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invite_version = Column(Integer, nullable=False, default=1)
    max_members = Column(Integer, nullable=False, default=6)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    closed_at = Column(DateTime, nullable=True)

    members = relationship("RoomMember", back_populates="room", cascade="all, delete-orphan")


class RoomMember(Base):
    __tablename__ = "room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_member"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    room_id = Column(String, ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    left_at = Column(DateTime, nullable=True)
    # Each participant's own current pick. Independent per member, so two
    # people choosing at the same time never overwrite each other.
    product_id = Column(String, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    color_name = Column(String, nullable=True)
    selection_updated_at = Column(DateTime, nullable=True)

    room = relationship("FittingRoom", back_populates="members")


class RoomMessage(Base):
    """Chat text and heart reactions. Text only — no images."""

    __tablename__ = "room_messages"

    id = Column(String, primary_key=True, default=gen_uuid)
    room_id = Column(String, ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(16), nullable=False)  # "chat" | "heart"
    body = Column(Text, nullable=True)
    # For hearts: whose look was reacted to.
    target_user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class RoomVote(Base):
    """One vote per voter per room for their favourite participant's look.
    The unique constraint makes concurrent re-votes an upsert, not a double count."""

    __tablename__ = "room_votes"
    __table_args__ = (UniqueConstraint("room_id", "voter_id", name="uq_room_vote_voter"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    room_id = Column(String, ForeignKey("fitting_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    voter_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
