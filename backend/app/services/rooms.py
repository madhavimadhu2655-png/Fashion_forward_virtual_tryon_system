"""Domain rules for collaborative fitting rooms (no FastAPI here).

Security model
  * Every room operation requires an authenticated user who is an ACTIVE
    member (joined, not left) of an OPEN room (not closed, not expired).
    Non-members get the same "not found" as a missing room.
  * Invitation codes are `<SHORTCODE>-<MAC>`. The MAC is an HMAC-SHA256 of
    the room id and invite version under the server secret, so codes are
    never stored and rotating the invite invalidates all earlier codes.
  * Shared previews are not handled here; see services/room_hub.py.
"""

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.fitting_room import FittingRoom, RoomMember, RoomMessage, RoomVote
from app.models.product import Product
from app.models.user import User

SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SHORT_CODE_LENGTH = 6
MAC_LENGTH = 10
ROOM_TTL = timedelta(hours=24)
MAX_OPEN_ROOMS_PER_OWNER = 5
MAX_CHAT_LENGTH = 500
RECENT_MESSAGES = 60


class RoomError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def not_found() -> RoomError:
    return RoomError(404, "Fitting room not found.")


def clean_text(value: str, limit: int) -> str:
    return "".join(ch for ch in value if ch.isprintable() or ch == "\n").strip()[:limit]


def _mac(room_id: str, version: int) -> str:
    digest = hmac.new(
        settings.jwt_secret.encode(),
        f"fitting-room-invite:{room_id}:{version}".encode(),
        hashlib.sha256,
    ).digest()
    return base64.b32encode(digest).decode().rstrip("=")[:MAC_LENGTH]


def invite_code(room: FittingRoom) -> str:
    return f"{room.short_code}-{_mac(room.id, room.invite_version)}"


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum() or ch == "-")[:40]


def is_open(room: FittingRoom, now: Optional[datetime] = None) -> bool:
    now = now or datetime.utcnow()
    return room.closed_at is None and room.expires_at > now


def _new_short_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH))
        if db.query(FittingRoom.id).filter(FittingRoom.short_code == code).first() is None:
            return code
    raise RoomError(503, "Couldn't allocate a room code. Please try again.")


def create_room(db: Session, owner: User, name: str) -> FittingRoom:
    name = clean_text(name, 60)
    if not name:
        raise RoomError(422, "Give the fitting room a name.")
    now = datetime.utcnow()
    open_rooms = (
        db.query(FittingRoom)
        .filter(FittingRoom.owner_id == owner.id, FittingRoom.closed_at.is_(None), FittingRoom.expires_at > now)
        .count()
    )
    if open_rooms >= MAX_OPEN_ROOMS_PER_OWNER:
        raise RoomError(409, "You already have 5 open fitting rooms. Close one first.")
    room = FittingRoom(
        short_code=_new_short_code(db),
        name=name,
        owner_id=owner.id,
        invite_version=1,
        created_at=now,
        expires_at=now + ROOM_TTL,
    )
    db.add(room)
    db.flush()
    db.add(RoomMember(room_id=room.id, user_id=owner.id, joined_at=now))
    db.commit()
    db.refresh(room)
    return room


def active_member(db: Session, room_id: str, user_id: str) -> Optional[RoomMember]:
    return (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id, RoomMember.left_at.is_(None))
        .first()
    )


@dataclass
class Access:
    room: FittingRoom
    member: RoomMember


def require_access(db: Session, room_id: str, user_id: str, *, allow_closed: bool = False) -> Access:
    """The single gate every room action goes through."""
    room = db.get(FittingRoom, room_id)
    if room is None:
        raise not_found()
    member = active_member(db, room_id, user_id)
    if member is None:
        raise not_found()
    if not allow_closed and not is_open(room):
        raise RoomError(410, "This fitting room has closed or expired.")
    return Access(room=room, member=member)


def require_owner(db: Session, room_id: str, user_id: str) -> Access:
    access = require_access(db, room_id, user_id)
    if access.room.owner_id != user_id:
        raise RoomError(403, "Only the room's host can do that.")
    return access


def join_room(db: Session, user: User, code: str) -> FittingRoom:
    code = normalize_code(code)
    short, _, mac = code.partition("-")
    invalid = RoomError(404, "That invitation is invalid or has been replaced. Ask the host for a new link.")
    if len(short) != SHORT_CODE_LENGTH or len(mac) != MAC_LENGTH:
        raise invalid
    room = db.query(FittingRoom).filter(FittingRoom.short_code == short).first()
    if room is None or not hmac.compare_digest(mac, _mac(room.id, room.invite_version)):
        raise invalid
    if not is_open(room):
        raise RoomError(410, "This invitation has expired because the fitting room closed.")

    existing = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == user.id).first()
    if existing is not None and existing.left_at is None:
        return room
    active_count = (
        db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.left_at.is_(None)).count()
    )
    if active_count >= room.max_members:
        raise RoomError(409, f"This fitting room is full ({room.max_members} people).")
    now = datetime.utcnow()
    if existing is not None:
        existing.left_at = None
        existing.joined_at = now
    else:
        db.add(RoomMember(room_id=room.id, user_id=user.id, joined_at=now))
    db.commit()
    return room


def leave_room(db: Session, room_id: str, user_id: str) -> bool:
    """Returns True if the room was closed (the host leaving closes it)."""
    access = require_access(db, room_id, user_id, allow_closed=True)
    now = datetime.utcnow()
    access.member.left_at = now
    db.query(RoomVote).filter(
        RoomVote.room_id == room_id,
        (RoomVote.voter_id == user_id) | (RoomVote.target_user_id == user_id),
    ).delete(synchronize_session=False)
    closed = access.room.owner_id == user_id and access.room.closed_at is None
    if closed:
        access.room.closed_at = now
    db.commit()
    return closed


def close_room(db: Session, room_id: str, user_id: str) -> None:
    access = require_owner(db, room_id, user_id)
    access.room.closed_at = datetime.utcnow()
    db.commit()


def rotate_invite(db: Session, room_id: str, user_id: str) -> FittingRoom:
    access = require_owner(db, room_id, user_id)
    access.room.invite_version += 1
    db.commit()
    return access.room


def set_selection(db: Session, room_id: str, user_id: str, product_id: str, color_name: str) -> RoomMember:
    access = require_access(db, room_id, user_id)
    product = db.get(Product, product_id) if isinstance(product_id, str) and len(product_id) <= 64 else None
    if product is None:
        raise RoomError(404, "That product isn't in the catalogue.")
    variant = next(
        (v for v in product.variants if isinstance(color_name, str) and v.color_name.casefold() == color_name.casefold()),
        None,
    )
    if variant is None:
        raise RoomError(422, "That colour isn't available for this product.")
    access.member.product_id = product.id
    access.member.color_name = variant.color_name
    access.member.selection_updated_at = datetime.utcnow()
    db.commit()
    return access.member


def add_chat(db: Session, room_id: str, user_id: str, body: str) -> RoomMessage:
    require_access(db, room_id, user_id)
    text = clean_text(body if isinstance(body, str) else "", MAX_CHAT_LENGTH)
    if not text:
        raise RoomError(422, "Messages can't be empty.")
    message = RoomMessage(room_id=room_id, user_id=user_id, kind="chat", body=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def add_heart(db: Session, room_id: str, user_id: str, target_user_id: str) -> RoomMessage:
    require_access(db, room_id, user_id)
    if not isinstance(target_user_id, str) or active_member(db, room_id, target_user_id) is None:
        raise RoomError(422, "You can only react to someone in this room.")
    message = RoomMessage(room_id=room_id, user_id=user_id, kind="heart", target_user_id=target_user_id)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def cast_vote(db: Session, room_id: str, user_id: str, target_user_id: Optional[str]) -> None:
    """Upsert (or clear, with None) this voter's single vote."""
    require_access(db, room_id, user_id)
    vote = db.query(RoomVote).filter(RoomVote.room_id == room_id, RoomVote.voter_id == user_id).first()
    if target_user_id is None:
        if vote is not None:
            db.delete(vote)
            db.commit()
        return
    if target_user_id == user_id:
        raise RoomError(422, "Vote for someone else's look.")
    if not isinstance(target_user_id, str) or active_member(db, room_id, target_user_id) is None:
        raise RoomError(422, "You can only vote for someone in this room.")
    if vote is None:
        db.add(RoomVote(room_id=room_id, voter_id=user_id, target_user_id=target_user_id))
    else:
        vote.target_user_id = target_user_id
    db.commit()


def _avatar_hue(user_id: str) -> int:
    return int(hashlib.sha256(user_id.encode()).hexdigest()[:4], 16) % 360


def _selection(db: Session, member: RoomMember) -> Optional[dict]:
    if not member.product_id:
        return None
    product = db.get(Product, member.product_id)
    if product is None:
        return None
    variant = next((v for v in product.variants if v.color_name == member.color_name), None)
    front = next((img for img in sorted(product.images, key=lambda i: i.sort_order)), None)
    price = product.discount_price if product.discount_price is not None else product.price
    return {
        "product_id": product.id,
        "product_name": product.name,
        "color_name": member.color_name,
        "color_hex": variant.color_hex if variant else None,
        "price": float(price),
        "thumbnail_url": front.image_url if front else None,
        "updated_at": member.selection_updated_at.isoformat() if member.selection_updated_at else None,
    }


def message_out(message: RoomMessage, names: dict[str, str]) -> dict:
    return {
        "id": message.id,
        "kind": message.kind,
        "user_id": message.user_id,
        "user_name": names.get(message.user_id, "Former member"),
        "body": message.body,
        "target_user_id": message.target_user_id,
        "created_at": message.created_at.isoformat(),
    }


def room_summary(room: FittingRoom, viewer_id: str) -> dict:
    return {
        "id": room.id,
        "name": room.name,
        "owner_id": room.owner_id,
        "is_owner": room.owner_id == viewer_id,
        "created_at": room.created_at.isoformat(),
        "expires_at": room.expires_at.isoformat(),
        "closed": not is_open(room),
        "max_members": room.max_members,
    }


def snapshot(db: Session, room: FittingRoom, viewer_id: str, online: set[str]) -> dict:
    members = (
        db.query(RoomMember, User)
        .join(User, User.id == RoomMember.user_id)
        .filter(RoomMember.room_id == room.id, RoomMember.left_at.is_(None))
        .order_by(RoomMember.joined_at.asc())
        .all()
    )
    all_names = {
        uid: name
        for uid, name in db.query(User.id, User.full_name)
        .join(RoomMember, RoomMember.user_id == User.id)
        .filter(RoomMember.room_id == room.id)
        .all()
    }
    hearts: dict[str, int] = {}
    for (target,) in (
        db.query(RoomMessage.target_user_id)
        .filter(RoomMessage.room_id == room.id, RoomMessage.kind == "heart")
        .all()
    ):
        if target:
            hearts[target] = hearts.get(target, 0) + 1
    votes = db.query(RoomVote).filter(RoomVote.room_id == room.id).all()
    tally: dict[str, int] = {}
    for vote in votes:
        tally[vote.target_user_id] = tally.get(vote.target_user_id, 0) + 1
    my_vote = next((v.target_user_id for v in votes if v.voter_id == viewer_id), None)
    messages = (
        db.query(RoomMessage)
        .filter(RoomMessage.room_id == room.id, RoomMessage.kind == "chat")
        .order_by(RoomMessage.created_at.desc())
        .limit(RECENT_MESSAGES)
        .all()
    )
    return {
        "room": room_summary(room, viewer_id),
        "me": viewer_id,
        "members": [
            {
                "user_id": user.id,
                "full_name": user.full_name,
                "initials": "".join(part[0] for part in user.full_name.split()[:2]).upper() or "?",
                "avatar_hue": _avatar_hue(user.id),
                "is_owner": user.id == room.owner_id,
                "online": user.id in online,
                "joined_at": member.joined_at.isoformat(),
                "selection": _selection(db, member),
                "hearts": hearts.get(user.id, 0),
                "votes": tally.get(user.id, 0),
            }
            for member, user in members
        ],
        "my_vote": my_vote,
        "messages": [message_out(m, all_names) for m in reversed(messages)],
    }


def rooms_for_user(db: Session, user_id: str) -> list[FittingRoom]:
    now = datetime.utcnow()
    return (
        db.query(FittingRoom)
        .join(RoomMember, RoomMember.room_id == FittingRoom.id)
        .filter(
            RoomMember.user_id == user_id,
            RoomMember.left_at.is_(None),
            FittingRoom.closed_at.is_(None),
            FittingRoom.expires_at > now,
        )
        .order_by(FittingRoom.created_at.desc())
        .all()
    )
