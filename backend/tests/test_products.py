"""
Tests run against an in-memory SQLite database, not the real Postgres
instance — this keeps them fast and isolated. It genuinely exercises the
same SQLAlchemy models, CRUD functions, and FastAPI routes used in
production; only the database engine underneath differs.

Shared engine/dependency-override/product-seeding live in conftest.py.

Run with: docker compose exec backend pytest
"""

import os

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_list_products_returns_seeded_items():
    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 20
    assert len(data["items"]) <= data["limit"]


def test_get_product_by_id():
    resp = client.get("/api/products/CT001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "CT001"
    assert data["name"] == "Ribbed Square Neck Crop Top"
    # Image rows point at photos that actually exist on disk (matched by
    # view prefix, preferring the web-optimised copy), front first.
    assert len(data["images"]) >= 1
    assert data["images"][0]["image_type"] == "front"
    front_url = data["images"][0]["image_url"]
    assert front_url.startswith("/static/products/CT001/")
    static_root = os.path.join(os.path.dirname(__file__), "..", "app")
    assert os.path.isfile(os.path.join(static_root, *front_url.lstrip("/").split("/")))
    assert [img["image_type"] for img in data["images"]][:3] == ["front", "side", "back"]
    assert len(data["variants"]) >= 2
    assert len(data["sizes"]) >= 1


def test_get_product_invalid_id_returns_404():
    resp = client.get("/api/products/DOES-NOT-EXIST")
    assert resp.status_code == 404


def test_search_products():
    resp = client.get("/api/products/search", params={"q": "ribbed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert all("ribbed" in item["name"].lower() or "ribbed" in item["category"].lower() for item in data["items"])


def test_filter_by_category():
    resp = client.get("/api/products", params={"category": "Sports"})
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["category"] == "Sports" for item in data["items"])
    assert data["total"] == 2


def test_filter_by_price_range():
    resp = client.get("/api/products", params={"min_price": 1000, "max_price": 1300})
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        effective = item["discount_price"] or item["price"]
        assert 1000 <= effective <= 1300


def test_sort_price_low_to_high():
    resp = client.get("/api/products", params={"sort": "priceLow"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    prices = [item["discount_price"] or item["price"] for item in items]
    assert prices == sorted(prices)


def test_categories_endpoint():
    resp = client.get("/api/categories")
    assert resp.status_code == 200
    categories = resp.json()
    assert "Sports" in categories
    assert "Ribbed" in categories


def test_product_variants_endpoint():
    resp = client.get("/api/products/CT001/variants")
    assert resp.status_code == 200
    variants = resp.json()
    assert len(variants) >= 2


def test_product_sizes_endpoint():
    resp = client.get("/api/products/CT001/sizes")
    assert resp.status_code == 200
    sizes = resp.json()
    assert len(sizes) >= 1


def test_filters_metadata_endpoint():
    resp = client.get("/api/products/filters")
    assert resp.status_code == 200
    data = resp.json()
    assert "Sports" in data["categories"]
    assert data["max_price"] >= data["min_price"]
