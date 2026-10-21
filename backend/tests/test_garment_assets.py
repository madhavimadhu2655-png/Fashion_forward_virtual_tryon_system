"""
Garment-asset endpoint tests. Shared in-memory DB + dependency override
live in conftest.py; product data comes from the seed_products fixture
in test_products.py (autouse, module-scoped, runs once for the session).

These tests also touch the real asset directory. They preserve existing
product files and only remove test files they created themselves.

Run with: docker compose exec backend pytest
"""

import os
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.api import products as products_api
from app.main import app

client = TestClient(app)

GARMENT_ASSETS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "app", "static", "garment-assets"
)


def _asset_path(product_id: str, filename: str) -> str:
    return os.path.join(GARMENT_ASSETS_DIR, product_id, filename)


@contextmanager
def _asset_file(path: str, test_data: bytes):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    created = not os.path.exists(path)
    if created:
        with open(path, "wb") as f:
            f.write(test_data)
    try:
        yield
    finally:
        if created and os.path.exists(path):
            os.remove(path)


def test_garment_assets_reports_real_product_asset():
    resp = client.get("/api/products/CT001/garment-assets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asset_available"] is True
    assert data["tryon_url"] == "/static/garment-assets/CT001/tryon.png"
    assert data["garment_type"] == "Ribbed"
    assert len(data["colors"]) >= 1


def test_all_product_assets_have_the_expected_png_path():
    for product_number in range(1, 21):
        product_id = f"CT{product_number:03d}"
        response = client.get(f"/api/products/{product_id}/garment-assets")
        assert response.status_code == 200
        data = response.json()
        assert data["product_id"] == product_id
        assert data["asset_available"] is True
        assert data["tryon_url"] == f"/static/garment-assets/{product_id}/tryon.png"
        with open(_asset_path(product_id, "tryon.png"), "rb") as asset:
            assert asset.read(8) == b"\x89PNG\r\n\x1a\n"


def test_garment_assets_reports_missing_file_honestly(monkeypatch, tmp_path):
    monkeypatch.setattr(products_api, "GARMENT_ASSETS_DIR", str(tmp_path))
    response = client.get("/api/products/CT001/garment-assets")
    assert response.status_code == 200
    assert response.json()["asset_available"] is False
    assert response.json()["tryon_url"] is None


def test_garment_assets_nonexistent_product_404():
    resp = client.get("/api/products/DOES-NOT-EXIST/garment-assets")
    assert resp.status_code == 404


def test_garment_assets_available_when_real_file_present():
    tryon_path = _asset_path("CT002", "tryon.png")
    with _asset_file(tryon_path, b"test-png-bytes"):
        resp = client.get("/api/products/CT002/garment-assets")
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_available"] is True
        assert data["tryon_url"] == "/static/garment-assets/CT002/tryon.png"


def test_garment_assets_color_specific_file_used_when_present():
    tryon_path = _asset_path("CT003", "tryon-emerald.png")
    with _asset_file(tryon_path, b"test-png-bytes"):
        resp = client.get("/api/products/CT003/garment-assets", params={"color": "Emerald"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_available"] is True
        assert data["tryon_url"] == "/static/garment-assets/CT003/tryon-emerald.png"
        assert data["fallback_used"] is False


def test_garment_assets_falls_back_to_generic_when_color_specific_missing():
    generic_path = _asset_path("CT004", "tryon.png")
    with _asset_file(generic_path, b"test-png-bytes"):
        # CT004 has no tryon-white.png, only the generic one above.
        resp = client.get("/api/products/CT004/garment-assets", params={"color": "White"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_available"] is True
        assert data["tryon_url"] == "/static/garment-assets/CT004/tryon.png"
        assert data["fallback_used"] is True


def test_garment_assets_mask_optional_not_required_for_availability():
    """A tryon.png with no mask.png should still report available — the
    mask isn't used until TPS warping in a later milestone."""
    tryon_path = _asset_path("CT005", "tryon.png")
    with _asset_file(tryon_path, b"test-png-bytes"):
        resp = client.get("/api/products/CT005/garment-assets")
        data = resp.json()
        assert data["asset_available"] is True
        assert data["mask_url"] is None
