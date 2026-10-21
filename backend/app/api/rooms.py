"""Shop Together — collaborative fitting rooms.

REST manages rooms and invitations; one WebSocket per member carries live
updates. The WebSocket authenticates with the first message
({"type": "auth", "token": <access token>}) rather than a query string so
tokens don't end up in access logs, and every later action re-checks the
token's expiry and the sender's active membership before doing anything.
"""

import asyncio
import time
from collections import deque
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.deps import get_current_user
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User
from app.services import rooms as svc
from app.services.room_hub import ALLOWED_ENGINES, PreviewRejected, SharedPreview, decode_preview_image, hub

router = APIRouter(prefix="/api/rooms", tags=["fitting-rooms"])

PRIVATE_HEADERS = {"Cache-Control": "private, no-store"}
JOIN_ATTEMPTS_PER_MINUTE = 10
AUTH_TIMEOUT_SECONDS = 10
WS_MESSAGES_PER_10S = 25
WS_PREVIEWS_PER_MINUTE = 6

_join_attempts: dict[str, deque] = {}


def _private(response: Response) -> None:
    response.headers.update(PRIVATE_HEADERS)


def _raise(error: svc.RoomError):
    raise HTTPException(status_code=error.status_code, detail=error.detail)


def _rate_limit_join(user_id: str) -> None:
    now = time.monotonic()
    attempts = _join_attempts.setdefault(user_id, deque())
    while attempts and now - attempts[0] > 60:
        attempts.popleft()
    if len(attempts) >= JOIN_ATTEMPTS_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Too many join attempts. Wait a minute and try again.")
    attempts.append(now)
    if len(_join_attempts) > 10_000:
        for uid in [uid for uid, q in _join_attempts.items() if not q]:
            _join_attempts.pop(uid, None)


class RoomCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class RoomJoinIn(BaseModel):
    code: str = Field(min_length=6, max_length=64)


def _invite_out(room) -> dict:
    code = svc.invite_code(room)
    return {"code": code, "join_path": f"/rooms/join#code={code}", "expires_at": room.expires_at.isoformat()}


@router.post("", status_code=201, dependencies=[Depends(_private)])
async def create_room(payload: RoomCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        room = svc.create_room(db, user, payload.name)
    except svc.RoomError as error:
        _raise(error)
    return {**svc.room_summary(room, user.id), "invite": _invite_out(room)}


@router.get("", dependencies=[Depends(_private)])
def my_rooms(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [svc.room_summary(room, user.id) for room in svc.rooms_for_user(db, user.id)]


@router.post("/join", dependencies=[Depends(_private)])
async def join_room(request: Request, payload: RoomJoinIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _rate_limit_join(user.id)
    try:
        room = svc.join_room(db, user, payload.code)
    except svc.RoomError as error:
        _raise(error)
    await _broadcast_state(request.app, room.id)
    return svc.room_summary(room, user.id)


@router.get("/{room_id}", dependencies=[Depends(_private)])
def get_room(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        access = svc.require_access(db, room_id, user.id)
    except svc.RoomError as error:
        _raise(error)
    return svc.snapshot(db, access.room, user.id, hub.online(room_id))


@router.get("/{room_id}/invite", dependencies=[Depends(_private)])
def get_invite(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        access = svc.require_owner(db, room_id, user.id)
    except svc.RoomError as error:
        _raise(error)
    return _invite_out(access.room)


@router.post("/{room_id}/invite/rotate", dependencies=[Depends(_private)])
def rotate_invite(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        room = svc.rotate_invite(db, room_id, user.id)
    except svc.RoomError as error:
        _raise(error)
    return _invite_out(room)


@router.post("/{room_id}/leave", dependencies=[Depends(_private)])
async def leave_room(request: Request, room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        closed = svc.leave_room(db, room_id, user.id)
    except svc.RoomError as error:
        _raise(error)
    hub.remove_preview(room_id, user.id)
    if closed:
        await hub.close_room(room_id, reason="The host closed the room")
    else:
        await hub.broadcast(room_id, {"type": "preview_removed", "user_id": user.id})
        await hub.kick_user(room_id, user.id, 4403, "You left the room")
        await _broadcast_state(request.app, room_id)
    return {"left": True, "room_closed": closed}


@router.post("/{room_id}/close", dependencies=[Depends(_private)])
async def close_room(room_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        svc.close_room(db, room_id, user.id)
    except svc.RoomError as error:
        _raise(error)
    await hub.close_room(room_id, reason="The host closed the room")
    return {"closed": True}


# ---------------------------------------------------------------- WebSocket


def _db_call(app, fn, *args):
    """Runs fn(db, *args) in a short-lived session (honours get_db overrides)."""
    factory = app.dependency_overrides.get(get_db, get_db) if app is not None else get_db
    generator = factory()
    db = next(generator)
    try:
        return fn(db, *args)
    finally:
        generator.close()


def _snapshot_for(db: Session, room_id: str, viewer_id: str, online: set[str]) -> Optional[dict]:
    try:
        access = svc.require_access(db, room_id, viewer_id)
    except svc.RoomError:
        return None
    return svc.snapshot(db, access.room, viewer_id, online)


async def _broadcast_state(app, room_id: str) -> None:
    """Sends each connected member their own snapshot (their vote differs)."""
    online = hub.online(room_id)
    for viewer in online:
        state = await run_in_threadpool(_db_call, app, _snapshot_for, room_id, viewer, online)
        if state is not None:
            await hub.broadcast(room_id, {"type": "state", **state}, only_user=viewer)


def _authenticate(db: Session, token: object, room_id: str):
    if not isinstance(token, str):
        return None
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        return None
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        return None
    svc.require_access(db, room_id, user.id)  # raises RoomError
    return user.id, user.full_name, float(payload.get("exp", 0))


class _Throttle:
    def __init__(self, limit: int, window: float):
        self.limit, self.window, self.events = limit, window, deque()

    def allow(self) -> bool:
        now = time.monotonic()
        while self.events and now - self.events[0] > self.window:
            self.events.popleft()
        if len(self.events) >= self.limit:
            return False
        self.events.append(now)
        return True


@router.websocket("/{room_id}/ws")
async def room_socket(websocket: WebSocket, room_id: str):
    app = websocket.app
    await websocket.accept()
    try:
        first = await asyncio.wait_for(websocket.receive_json(), timeout=AUTH_TIMEOUT_SECONDS)
    except Exception:
        await websocket.close(code=4401, reason="Authentication required")
        return
    token = first.get("token") if isinstance(first, dict) and first.get("type") == "auth" else None
    try:
        identity = await run_in_threadpool(_db_call, app, _authenticate, token, room_id)
    except svc.RoomError as error:
        await websocket.close(code=4410 if error.status_code == 410 else 4404, reason=error.detail[:120])
        return
    if identity is None:
        await websocket.close(code=4401, reason="Your session has expired. Sign in again.")
        return
    user_id, user_name, token_exp = identity

    await hub.connect(room_id, websocket, user_id)
    messages = _Throttle(WS_MESSAGES_PER_10S, 10)
    previews = _Throttle(WS_PREVIEWS_PER_MINUTE, 60)
    try:
        state = await run_in_threadpool(_db_call, app, _snapshot_for, room_id, user_id, hub.online(room_id))
        await websocket.send_json({"type": "state", **(state or {}), "previews": hub.previews(room_id)})
        await _broadcast_state(app, room_id)

        while True:
            incoming = await websocket.receive_json()
            if time.time() >= token_exp:
                await websocket.close(code=4401, reason="Your session has expired. Sign in again.")
                break
            if not isinstance(incoming, dict):
                continue
            kind = incoming.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if not messages.allow():
                await websocket.send_json({"type": "error", "detail": "You're sending messages too quickly."})
                continue
            try:
                await _handle(app, websocket, room_id, user_id, user_name, kind, incoming, previews)
            except svc.RoomError as error:
                if error.status_code in (404, 410):
                    await websocket.close(code=4410 if error.status_code == 410 else 4404, reason=error.detail[:120])
                    break
                await websocket.send_json({"type": "error", "detail": error.detail})
            except PreviewRejected as error:
                await websocket.send_json({"type": "error", "detail": str(error)})
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        await hub.disconnect(room_id, websocket)
        await _broadcast_state(app, room_id)


async def _handle(app, websocket, room_id, user_id, user_name, kind, incoming, preview_throttle):
    if kind == "select":
        await run_in_threadpool(
            _db_call, app, svc.set_selection, room_id, user_id, incoming.get("product_id"), incoming.get("color_name")
        )
        # A shared preview belongs to a specific product/colour; a new pick
        # makes it stale, so it's withdrawn rather than mislabelled.
        if hub.remove_preview(room_id, user_id):
            await hub.broadcast(room_id, {"type": "preview_removed", "user_id": user_id})
        await _broadcast_state(app, room_id)
    elif kind == "chat":
        message = await run_in_threadpool(_db_call, app, svc.add_chat, room_id, user_id, incoming.get("body"))
        await hub.broadcast(room_id, {"type": "chat", "message": svc.message_out(message, {user_id: user_name})})
    elif kind == "heart":
        await run_in_threadpool(_db_call, app, svc.add_heart, room_id, user_id, incoming.get("target_user_id"))
        await hub.broadcast(
            room_id, {"type": "heart", "from_user_id": user_id, "target_user_id": incoming.get("target_user_id")}
        )
        await _broadcast_state(app, room_id)
    elif kind == "vote":
        target = incoming.get("target_user_id")
        await run_in_threadpool(_db_call, app, svc.cast_vote, room_id, user_id, target if target else None)
        await _broadcast_state(app, room_id)
    elif kind == "share_preview":
        if not preview_throttle.allow():
            raise PreviewRejected("You're sharing previews too quickly. Wait a moment.")
        engine = incoming.get("engine")
        if engine not in ALLOWED_ENGINES:
            raise PreviewRejected("Only generated try-on previews can be shared.")
        # Re-check membership AND that the preview matches the sender's
        # current pick, so a preview is never shown under the wrong product.
        state = await run_in_threadpool(_db_call, app, _snapshot_for, room_id, user_id, set())
        if state is None:
            raise svc.not_found()
        mine = next((m for m in state["members"] if m["user_id"] == user_id), None)
        selection = mine["selection"] if mine else None
        if (
            selection is None
            or selection["product_id"] != incoming.get("product_id")
            or selection["color_name"] != incoming.get("color_name")
        ):
            raise PreviewRejected("Select this product and colour in the room before sharing its preview.")
        media_type, data = decode_preview_image(incoming.get("image"))
        preview = SharedPreview(
            user_id=user_id,
            product_id=selection["product_id"],
            color_name=selection["color_name"],
            engine=engine,
            recoloured=engine == "browser_fit" and incoming.get("recoloured") is True,
            media_type=media_type,
            data=data,
        )
        hub.share_preview(room_id, preview)
        await hub.broadcast(room_id, {"type": "preview", "preview": preview.public()})
    elif kind == "unshare_preview":
        await run_in_threadpool(_db_call, app, svc.require_access, room_id, user_id)
        if hub.remove_preview(room_id, user_id):
            await hub.broadcast(room_id, {"type": "preview_removed", "user_id": user_id})
    else:
        await websocket.send_json({"type": "error", "detail": "Unknown action."})
