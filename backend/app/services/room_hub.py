"""Live connections and shared previews for fitting rooms.

Shared previews are generated try-on images a member EXPLICITLY chose to
share. They are:
  * validated as real PNG/JPEG images within size/dimension limits,
  * held only in this process's memory (never the database, disk or logs),
  * bounded (one per member, MAX_PREVIEW_BYTES each, MAX_TOTAL_BYTES total),
  * dropped when the sharer unshares, leaves, the room closes, the TTL
    passes, or the server restarts,
  * delivered only over authenticated room WebSockets — there is no URL.

Limitation: this hub is per-process. Run a single backend worker (the
default `uvicorn` command) or replace it with a shared broker.
"""

import asyncio
import base64
import binascii
import io
import time
from dataclasses import dataclass, field
from typing import Optional

from fastapi import WebSocket
from PIL import Image, UnidentifiedImageError

MAX_PREVIEW_BYTES = 3 * 1024 * 1024
MAX_PREVIEW_DIMENSION = 2048
MAX_TOTAL_BYTES = 96 * 1024 * 1024
PREVIEW_TTL_SECONDS = 30 * 60
ALLOWED_ENGINES = {"browser_fit", "catvton"}


class PreviewRejected(ValueError):
    pass


@dataclass
class SharedPreview:
    user_id: str
    product_id: str
    color_name: str
    engine: str
    media_type: str
    data: bytes
    recoloured: bool = False
    shared_at: float = field(default_factory=time.time)

    def public(self) -> dict:
        return {
            "user_id": self.user_id,
            "product_id": self.product_id,
            "color_name": self.color_name,
            "engine": self.engine,
            "recoloured": self.recoloured,
            "shared_at": self.shared_at,
            "image": f"data:{self.media_type};base64,{base64.b64encode(self.data).decode()}",
        }


def decode_preview_image(data_url: object) -> tuple[str, bytes]:
    """Validates a data: URL holding a PNG/JPEG and returns (media_type, bytes)."""
    if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
        raise PreviewRejected("Share a generated PNG or JPEG preview.")
    header, _, payload = data_url.partition(",")
    media_type = header[5:].split(";", 1)[0]
    if media_type not in {"image/png", "image/jpeg"} or ";base64" not in header:
        raise PreviewRejected("Share a generated PNG or JPEG preview.")
    if len(payload) > (MAX_PREVIEW_BYTES * 4) // 3 + 8:
        raise PreviewRejected("That preview is too large to share (maximum 3 MB).")
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise PreviewRejected("The preview image is corrupted.") from exc
    if len(raw) > MAX_PREVIEW_BYTES:
        raise PreviewRejected("That preview is too large to share (maximum 3 MB).")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            expected = "PNG" if media_type == "image/png" else "JPEG"
            if image.format != expected:
                raise PreviewRejected("The preview image type doesn't match its contents.")
            if image.width > MAX_PREVIEW_DIMENSION or image.height > MAX_PREVIEW_DIMENSION:
                raise PreviewRejected("The preview's dimensions are too large to share.")
            image.verify()
    except PreviewRejected:
        raise
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise PreviewRejected("The preview image could not be opened.") from exc
    return media_type, raw


class RoomHub:
    def __init__(self) -> None:
        self._connections: dict[str, dict[WebSocket, str]] = {}
        self._previews: dict[str, dict[str, SharedPreview]] = {}
        self._lock = asyncio.Lock()

    # ---- connections -------------------------------------------------
    async def connect(self, room_id: str, websocket: WebSocket, user_id: str) -> None:
        async with self._lock:
            self._connections.setdefault(room_id, {})[websocket] = user_id

    async def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(room_id)
            if sockets is not None:
                sockets.pop(websocket, None)
                if not sockets:
                    self._connections.pop(room_id, None)

    def online(self, room_id: str) -> set[str]:
        return set(self._connections.get(room_id, {}).values())

    async def broadcast(self, room_id: str, message: dict, *, only_user: Optional[str] = None) -> None:
        targets = [
            ws for ws, uid in list(self._connections.get(room_id, {}).items()) if only_user in (None, uid)
        ]
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:  # a dead socket is cleaned up by its own handler
                pass

    async def kick_user(self, room_id: str, user_id: str, code: int, reason: str) -> None:
        for ws, uid in list(self._connections.get(room_id, {}).items()):
            if uid == user_id:
                try:
                    await ws.close(code=code, reason=reason)
                except Exception:
                    pass

    async def close_room(self, room_id: str, code: int = 4410, reason: str = "Room closed") -> None:
        self.drop_room_previews(room_id)
        for ws in list(self._connections.get(room_id, {})):
            try:
                await ws.close(code=code, reason=reason)
            except Exception:
                pass
        async with self._lock:
            self._connections.pop(room_id, None)

    # ---- previews (memory only) ----------------------------------------
    def _purge_expired(self) -> None:
        cutoff = time.time() - PREVIEW_TTL_SECONDS
        for room_id in list(self._previews):
            room = self._previews[room_id]
            for uid in [uid for uid, p in room.items() if p.shared_at < cutoff]:
                room.pop(uid, None)
            if not room:
                self._previews.pop(room_id, None)

    def total_bytes(self) -> int:
        return sum(len(p.data) for room in self._previews.values() for p in room.values())

    def share_preview(self, room_id: str, preview: SharedPreview) -> None:
        self._purge_expired()
        replacing = self._previews.get(room_id, {}).get(preview.user_id)
        projected = self.total_bytes() - (len(replacing.data) if replacing else 0) + len(preview.data)
        if projected > MAX_TOTAL_BYTES:
            raise PreviewRejected("Preview sharing is temporarily busy. Try again in a few minutes.")
        self._previews.setdefault(room_id, {})[preview.user_id] = preview

    def remove_preview(self, room_id: str, user_id: str) -> bool:
        removed = self._previews.get(room_id, {}).pop(user_id, None) is not None
        if room_id in self._previews and not self._previews[room_id]:
            self._previews.pop(room_id, None)
        return removed

    def previews(self, room_id: str) -> list[dict]:
        self._purge_expired()
        return [p.public() for p in self._previews.get(room_id, {}).values()]

    def drop_room_previews(self, room_id: str) -> None:
        self._previews.pop(room_id, None)


hub = RoomHub()
