from fastapi.testclient import TestClient

from app.main import app
from app.models.looks import SavedLook
from tests.helpers import register

client = TestClient(app)


def test_wishlist_requires_auth():
    assert client.get("/api/wishlist").status_code == 401
    assert client.put("/api/wishlist/CT001").status_code == 401


def test_wishlist_add_remove_is_idempotent_and_private():
    _, alice, _ = register(client, "Alice")
    _, bob, _ = register(client, "Bob")
    assert client.put("/api/wishlist/CT001", headers=alice).json()["product_ids"] == ["CT001"]
    assert client.put("/api/wishlist/CT001", headers=alice).json()["product_ids"] == ["CT001"]
    resp = client.get("/api/wishlist", headers=bob)
    assert resp.json()["product_ids"] == []
    assert "no-store" in resp.headers["cache-control"]
    assert client.delete("/api/wishlist/CT001", headers=alice).json()["product_ids"] == []
    assert client.delete("/api/wishlist/CT001", headers=alice).status_code == 200


def test_wishlist_rejects_unknown_product_and_merge_ignores_it():
    _, user, _ = register(client)
    assert client.put("/api/wishlist/NOPE", headers=user).status_code == 404
    merged = client.post("/api/wishlist/merge", json={"product_ids": ["CT002", "NOPE", "CT003"]}, headers=user)
    assert sorted(merged.json()["product_ids"]) == ["CT002", "CT003"]


def test_saved_look_crud_metadata_only():
    _, user, _ = register(client)
    created = client.post(
        "/api/saved-looks",
        json={"product_id": "CT001", "color_name": "black", "label": "  Brunch\x00 look  ", "source": "browser_fit"},
        headers=user,
    )
    assert created.status_code == 201
    look = created.json()
    assert look["color_name"] == "Black"  # canonical catalogue spelling
    assert look["label"] == "Brunch look"  # control characters stripped
    assert look["product_name"] == "Ribbed Square Neck Crop Top"
    assert not any("image" in key and key != "product_thumbnail_url" for key in look)
    # No image column exists on the model at all.
    assert not any("image" in column.name or "photo" in column.name for column in SavedLook.__table__.columns)

    renamed = client.patch(f"/api/saved-looks/{look['id']}", json={"label": "Weekend"}, headers=user)
    assert renamed.json()["label"] == "Weekend"
    assert [item["id"] for item in client.get("/api/saved-looks", headers=user).json()] == [look["id"]]
    assert client.delete(f"/api/saved-looks/{look['id']}", headers=user).status_code == 204
    assert client.get("/api/saved-looks", headers=user).json() == []


def test_saved_look_validates_product_colour():
    _, user, _ = register(client)
    assert client.post("/api/saved-looks", json={"product_id": "CT001", "color_name": "Gold"}, headers=user).status_code == 422
    assert client.post("/api/saved-looks", json={"product_id": "NOPE", "color_name": "Black"}, headers=user).status_code == 404


def test_saved_looks_cross_user_access_is_denied():
    _, alice, _ = register(client, "Alice")
    _, bob, _ = register(client, "Bob")
    look = client.post("/api/saved-looks", json={"product_id": "CT002", "color_name": "Grey"}, headers=alice).json()

    assert client.get("/api/saved-looks", headers=bob).json() == []
    assert client.patch(f"/api/saved-looks/{look['id']}", json={"label": "mine"}, headers=bob).status_code == 404
    assert client.delete(f"/api/saved-looks/{look['id']}", headers=bob).status_code == 404
    assert client.get("/api/saved-looks", headers=alice).json()[0]["label"] is None
