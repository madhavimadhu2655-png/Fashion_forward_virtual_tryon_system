import json

from fastapi.testclient import TestClient

from app.api import photo_try_on as photo_try_on_api
from app.main import app
from app.utils.garment_refs import exact_reference, load_color_manifest
from app.utils.product_images import find_product_gallery, find_product_image

client = TestClient(app)


def _touch(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")


def test_image_resolver_matches_irregular_filenames(tmp_path):
    _touch(tmp_path / "CT002" / "frontct002.png")
    _touch(tmp_path / "CT002" / "sidect002.png")
    _touch(tmp_path / "CT002" / "CT002_tryon.png")
    _touch(tmp_path / "CT003" / "fronct003.png")  # typo in the real catalogue
    _touch(tmp_path / "CT003" / "backct003.jpeg")

    assert find_product_image("CT002", "front", tmp_path) == "/static/products/CT002/frontct002.png"
    assert find_product_image("CT002", "back", tmp_path) is None
    assert find_product_image("CT003", "front", tmp_path) == "/static/products/CT003/fronct003.png"
    gallery = find_product_gallery("CT002", tmp_path)
    assert [view for view, _ in gallery] == ["front", "side"]
    # garment cutouts are never treated as shopping photos
    assert all("tryon" not in url for _, url in gallery)


def test_image_resolver_prefers_web_copy(tmp_path):
    _touch(tmp_path / "CT001" / "front.png")
    _touch(tmp_path / "CT001" / "web" / "front.jpg")
    assert find_product_image("CT001", "front", tmp_path) == "/static/products/CT001/web/front.jpg"


def test_every_seeded_product_front_photo_exists_on_disk():
    for item in client.get("/api/products", params={"limit": 100}).json()["items"]:
        assert item["thumbnail_url"], item["id"]
        detail = client.get(f"/api/products/{item['id']}").json()
        assert detail["images"][0]["image_type"] == "front"


def test_exact_reference_uses_verified_generic_cutout_only_for_its_colour(tmp_path):
    (tmp_path / "CT001").mkdir()
    (tmp_path / "CT001" / "tryon.png").write_bytes(b"png")
    (tmp_path / "colors.json").write_text(json.dumps({"_about": "x", "CT001": "Black"}))

    assert load_color_manifest(tmp_path) == {"CT001": "Black"}
    assert exact_reference(tmp_path, "CT001", "black") == tmp_path / "CT001" / "tryon.png"
    assert exact_reference(tmp_path, "CT001", "White") is None
    assert exact_reference(tmp_path, "CT001", "Pink") is None


def test_colour_specific_file_wins(tmp_path):
    (tmp_path / "CT001").mkdir()
    (tmp_path / "CT001" / "tryon.png").write_bytes(b"png")
    (tmp_path / "CT001" / "tryon-pink.png").write_bytes(b"png")
    (tmp_path / "colors.json").write_text(json.dumps({"CT001": "Black"}))
    assert exact_reference(tmp_path, "CT001", "Pink") == tmp_path / "CT001" / "tryon-pink.png"


def test_catalog_reports_exact_availability_from_real_manifest():
    data = client.get("/api/photo-try-on/catalog").json()
    ct001 = next(item for item in data["items"] if item["id"] == "CT001")
    availability = {c["color_name"]: c["image_available"] for c in ct001["colors"]}
    assert availability == {"Black": True, "White": False, "Pink": False}


def test_garment_assets_reports_verified_colour():
    black = client.get("/api/products/CT001/garment-assets", params={"color": "Black"}).json()
    assert black["verified_color"] == "Black"
    assert black["exact_color_match"] is True
    white = client.get("/api/products/CT001/garment-assets", params={"color": "White"}).json()
    assert white["asset_available"] is True  # live overlay may still use the cutout...
    assert white["exact_color_match"] is False  # ...but it is not the White garment


def test_status_lists_each_missing_prerequisite(monkeypatch):
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_url", "")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", False)
    data = client.get("/api/photo-try-on/status").json()
    assert data["available"] is False
    checks = {c["id"]: c["ok"] for c in data["checks"]}
    assert checks == {"worker_url": False, "worker_token": False, "license": False, "worker_ready": False}


def test_status_not_available_when_configured_but_worker_down(monkeypatch):
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_url", "http://127.0.0.1:8001/api/generate")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "t")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", True)
    photo_try_on_api._worker_health_cache.clear()

    async def down(_url):
        return False

    monkeypatch.setattr(photo_try_on_api, "_worker_ready", down)
    data = client.get("/api/photo-try-on/status").json()
    assert data["configured"] is True
    assert data["available"] is False
    assert {c["id"]: c["ok"] for c in data["checks"]}["worker_ready"] is False


def test_list_items_expose_real_attributes():
    item = client.get("/api/products", params={"limit": 1}).json()["items"][0]
    assert item["fabric"]
    assert item["fit_type"]
