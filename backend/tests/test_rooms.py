import base64
import io
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from starlette.websockets import WebSocketDisconnect

from app.api import rooms as rooms_api
from app.main import app
from app.models.fitting_room import FittingRoom
from app.services.room_hub import hub
from tests.conftest import TestSessionLocal
from tests.helpers import register

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_limits():
    rooms_api._join_attempts.clear()
    yield
    rooms_api._join_attempts.clear()


def _png_data_url(size=(64, 96)) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, (120, 40, 60)).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _create(headers, name="Saturday picks"):
    resp = client.post("/api/rooms", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _receive(ws, kind, limit=10):
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"no {kind} message")


def _connect(room_id, token):
    ws = client.websocket_connect(f"/api/rooms/{room_id}/ws")
    session = ws.__enter__()
    session.send_json({"type": "auth", "token": token})
    return ws, session


def test_create_and_join_with_invite_code():
    _, host, host_id = register(client, "Hana Host")
    _, guest, guest_id = register(client, "Gita Guest")
    room = _create(host)
    assert room["is_owner"] is True
    code = room["invite"]["code"]
    assert room["invite"]["join_path"] == f"/rooms/join#code={code}"  # fragment: never sent to servers

    # Not a member yet: indistinguishable from a missing room.
    assert client.get(f"/api/rooms/{room['id']}", headers=guest).status_code == 404
    assert client.post("/api/rooms/join", json={"code": code.lower()}, headers=guest).status_code == 200
    state = client.get(f"/api/rooms/{room['id']}", headers=guest).json()
    assert {m["user_id"] for m in state["members"]} == {host_id, guest_id}
    assert client.get(f"/api/rooms/{room['id']}/invite", headers=guest).status_code == 403


def test_invite_code_is_not_stored_and_rotation_invalidates_old_codes():
    _, host, _ = register(client)
    _, guest, _ = register(client)
    room = _create(host)
    old_code = room["invite"]["code"]
    db = TestSessionLocal()
    stored = db.get(FittingRoom, room["id"])
    assert old_code not in {str(getattr(stored, c.name)) for c in FittingRoom.__table__.columns}
    db.close()

    new_code = client.post(f"/api/rooms/{room['id']}/invite/rotate", headers=host).json()["code"]
    assert new_code != old_code
    assert client.post("/api/rooms/join", json={"code": old_code}, headers=guest).status_code == 404
    assert client.post("/api/rooms/join", json={"code": new_code}, headers=guest).status_code == 200


def test_forged_and_brute_force_codes_are_rejected_and_rate_limited():
    _, host, _ = register(client)
    _, attacker, _ = register(client)
    room = _create(host)
    short = room["invite"]["code"].split("-")[0]
    for attempt in range(rooms_api.JOIN_ATTEMPTS_PER_MINUTE):
        resp = client.post("/api/rooms/join", json={"code": f"{short}-AAAAAAAAA{attempt % 10}"}, headers=attacker)
        assert resp.status_code == 404
    assert client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=attacker).status_code == 429


def test_expired_room_rejects_join_and_access():
    _, host, _ = register(client)
    _, guest, _ = register(client)
    room = _create(host)
    db = TestSessionLocal()
    db.get(FittingRoom, room["id"]).expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    db.close()
    assert client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest).status_code == 410
    assert client.get(f"/api/rooms/{room['id']}", headers=host).status_code == 410


def test_room_capacity_is_enforced():
    _, host, _ = register(client)
    room = _create(host)
    for _ in range(5):
        _, guest, _ = register(client)
        assert client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest).status_code == 200
    _, late, _ = register(client)
    assert client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=late).status_code == 409


def test_websocket_requires_auth_and_membership():
    host_token, host, _ = register(client)
    outsider_token, _, _ = register(client)
    room = _create(host)

    with client.websocket_connect(f"/api/rooms/{room['id']}/ws") as ws:
        ws.send_json({"type": "auth", "token": "not-a-token"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4401

    with client.websocket_connect(f"/api/rooms/{room['id']}/ws") as ws:
        ws.send_json({"type": "auth", "token": outsider_token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4404

    with client.websocket_connect(f"/api/rooms/{room['id']}/ws") as ws:
        ws.send_json({"type": "auth", "token": host_token})
        state = _receive(ws, "state")
        assert state["room"]["id"] == room["id"]
        assert state["previews"] == []


def test_live_selection_chat_heart_and_vote_sync():
    host_token, host, host_id = register(client, "Hana Host")
    guest_token, guest, guest_id = register(client, "Gita Guest")
    room = _create(host)
    client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest)

    host_cm, host_ws = _connect(room["id"], host_token)
    guest_cm, guest_ws = _connect(room["id"], guest_token)
    try:
        _receive(host_ws, "state")
        _receive(guest_ws, "state")

        guest_ws.send_json({"type": "select", "product_id": "CT003", "color_name": "emerald"})
        for _ in range(6):
            state = _receive(host_ws, "state")
            guest_member = next(m for m in state["members"] if m["user_id"] == guest_id)
            if guest_member["selection"]:
                break
        assert guest_member["selection"]["product_id"] == "CT003"
        assert guest_member["selection"]["color_name"] == "Emerald"

        guest_ws.send_json({"type": "select", "product_id": "CT003", "color_name": "Gold"})
        assert "colour" in _receive(guest_ws, "error")["detail"]

        host_ws.send_json({"type": "chat", "body": "Love the emerald!"})
        chat = _receive(guest_ws, "chat")
        assert chat["message"]["body"] == "Love the emerald!"
        assert chat["message"]["user_name"] == "Hana Host"

        host_ws.send_json({"type": "heart", "target_user_id": guest_id})
        assert _receive(guest_ws, "heart")["target_user_id"] == guest_id

        host_ws.send_json({"type": "vote", "target_user_id": host_id})
        assert "someone else" in _receive(host_ws, "error")["detail"]
        host_ws.send_json({"type": "vote", "target_user_id": guest_id})
        host_ws.send_json({"type": "vote", "target_user_id": guest_id})  # re-vote is an upsert
        for _ in range(8):
            state = _receive(host_ws, "state")
            if state["my_vote"] == guest_id:
                break
        assert next(m for m in state["members"] if m["user_id"] == guest_id)["votes"] == 1
    finally:
        guest_cm.__exit__(None, None, None)
        host_cm.__exit__(None, None, None)


def test_preview_sharing_is_explicit_validated_and_memory_only():
    host_token, host, host_id = register(client)
    guest_token, guest, _ = register(client)
    room = _create(host)
    client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest)

    host_cm, host_ws = _connect(room["id"], host_token)
    guest_cm, guest_ws = _connect(room["id"], guest_token)
    try:
        _receive(host_ws, "state")
        _receive(guest_ws, "state")
        image = _png_data_url()

        # Must have the matching product/colour selected first.
        host_ws.send_json({"type": "share_preview", "engine": "browser_fit", "product_id": "CT001", "color_name": "Black", "image": image})
        assert "Select this product" in _receive(host_ws, "error")["detail"]

        host_ws.send_json({"type": "select", "product_id": "CT001", "color_name": "Black"})
        host_ws.send_json({"type": "share_preview", "engine": "catalogue", "product_id": "CT001", "color_name": "Black", "image": image})
        assert "generated" in _receive(host_ws, "error")["detail"]
        host_ws.send_json({"type": "share_preview", "engine": "browser_fit", "product_id": "CT001", "color_name": "Black", "image": "data:image/png;base64,bm90IGFuIGltYWdl"})
        assert "opened" in _receive(host_ws, "error")["detail"]

        host_ws.send_json({"type": "share_preview", "engine": "browser_fit", "product_id": "CT001", "color_name": "Black", "image": image})
        shared = _receive(guest_ws, "preview")["preview"]
        assert shared["user_id"] == host_id and shared["color_name"] == "Black"
        assert len(hub.previews(room["id"])) == 1

        # No REST surface exposes previews; the snapshot holds no image data.
        assert "image" not in str(client.get(f"/api/rooms/{room['id']}", headers=guest).json())

        # Changing selection withdraws the now-stale preview.
        host_ws.send_json({"type": "select", "product_id": "CT001", "color_name": "Pink"})
        assert _receive(guest_ws, "preview_removed")["user_id"] == host_id
        assert hub.previews(room["id"]) == []
    finally:
        guest_cm.__exit__(None, None, None)
        host_cm.__exit__(None, None, None)


def test_leaving_and_closing_revoke_access():
    host_token, host, _ = register(client)
    guest_token, guest, _ = register(client)
    room = _create(host)
    client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest)

    assert client.post(f"/api/rooms/{room['id']}/leave", headers=guest).json() == {"left": True, "room_closed": False}
    assert client.get(f"/api/rooms/{room['id']}", headers=guest).status_code == 404
    assert client.post(f"/api/rooms/{room['id']}/close", headers=guest).status_code == 404

    assert client.post(f"/api/rooms/{room['id']}/close", headers=host).status_code == 200
    assert client.get(f"/api/rooms/{room['id']}", headers=host).status_code == 410
    assert client.post("/api/rooms/join", json={"code": room["invite"]["code"]}, headers=guest).status_code == 410
    with client.websocket_connect(f"/api/rooms/{room['id']}/ws") as ws:
        ws.send_json({"type": "auth", "token": host_token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4410
    assert hub.previews(room["id"]) == []


def test_rooms_list_only_shows_my_open_rooms():
    _, alice, _ = register(client)
    _, bob, _ = register(client)
    room = _create(alice, "Alice's room")
    assert [r["id"] for r in client.get("/api/rooms", headers=alice).json()] == [room["id"]]
    assert client.get("/api/rooms", headers=bob).json() == []
