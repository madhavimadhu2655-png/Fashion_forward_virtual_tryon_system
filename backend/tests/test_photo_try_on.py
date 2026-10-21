import io
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import photo_try_on as photo_try_on_api
from app.core.deps import get_current_user
from app.main import app


client = TestClient(app)


def _png_bytes(color=(30, 80, 120, 255), size=(512, 768)):
    image = Image.new("RGBA", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def authenticated_user():
    original = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="photo-tryon-test-user")
    photo_try_on_api._rate_limit_events.pop("photo-tryon-test-user", None)
    yield
    photo_try_on_api._rate_limit_events.pop("photo-tryon-test-user", None)
    if original is None:
        app.dependency_overrides.pop(get_current_user, None)
    else:
        app.dependency_overrides[get_current_user] = original


def _write_black_garment_asset(root):
    product_dir = root / "CT001"
    product_dir.mkdir(parents=True)
    (product_dir / "tryon-black.png").write_bytes(_png_bytes((0, 0, 0, 255)))
    return product_dir


def test_photo_tryon_catalog_reports_only_exact_color_assets(monkeypatch, tmp_path):
    monkeypatch.setattr(photo_try_on_api, "GARMENT_ASSETS_DIR", tmp_path)
    _write_black_garment_asset(tmp_path)

    response = client.get("/api/photo-try-on/catalog")

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 20
    ct001 = next(item for item in data["items"] if item["id"] == "CT001")
    availability = {item["color_name"]: item["image_available"] for item in ct001["colors"]}
    assert availability["Black"] is True
    assert availability["White"] is False
    assert availability["Pink"] is False


def test_generation_requires_authentication():
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("person.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )
    assert response.status_code == 401


def test_generation_rejects_oversized_form_before_parsing(authenticated_user):
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("large.png", b"x" * (8 * 1024 * 1024 + 1), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )
    assert response.status_code == 413


def test_generation_rejects_photo_with_too_few_pixels(authenticated_user):
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("small.png", _png_bytes(size=(128, 128)), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )
    assert response.status_code == 422
    assert "at least 256" in response.json()["detail"]


def test_generation_returns_image_without_persisting_source_or_result(
    monkeypatch, tmp_path, authenticated_user
):
    product_dir = _write_black_garment_asset(tmp_path)
    monkeypatch.setattr(photo_try_on_api, "GARMENT_ASSETS_DIR", tmp_path)
    monkeypatch.setattr(
        photo_try_on_api.settings,
        "photo_tryon_worker_url",
        "http://catvton:8001/api/generate",
    )
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "test-only-token")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", True)
    image_rows_before = client.get("/api/products/CT001").json()["images"]
    files_before = sorted(path.name for path in product_dir.iterdir())
    received = {}

    async def fake_inference(person_jpeg, garment_png):
        received["person"] = person_jpeg
        received["garment"] = garment_png
        return _png_bytes((10, 20, 30, 255))

    monkeypatch.setattr(photo_try_on_api, "_run_local_inference", fake_inference)
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("friend.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "no-store" in response.headers["cache-control"]
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert received["person"].startswith(b"\xff\xd8")
    assert received["garment"].startswith(b"\x89PNG\r\n\x1a\n")
    assert sorted(path.name for path in product_dir.iterdir()) == files_before
    assert client.get("/api/products/CT001").json()["images"] == image_rows_before
    assert not (product_dir / "friend.png").exists()
    assert not (product_dir / "result.png").exists()


def test_invalid_image_is_rejected_before_inference(monkeypatch, authenticated_user):
    called = False

    async def fake_inference(_person_jpeg, _garment_png):
        nonlocal called
        called = True
        return _png_bytes()

    monkeypatch.setattr(photo_try_on_api, "_run_local_inference", fake_inference)
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("not-an-image.jpg", b"not an image", "image/jpeg")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )

    assert response.status_code == 422
    assert "valid JPEG or PNG" in response.json()["detail"]
    assert called is False


def test_generation_rejects_missing_exact_color_reference(monkeypatch, tmp_path, authenticated_user):
    monkeypatch.setattr(photo_try_on_api, "GARMENT_ASSETS_DIR", tmp_path)
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("person.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "White", "consent": "true"},
    )
    assert response.status_code == 422
    assert "No verified AI garment photo" in response.json()["detail"]
    assert list(tmp_path.iterdir()) == []


def test_generation_failure_does_not_leave_user_images(monkeypatch, tmp_path, authenticated_user):
    product_dir = _write_black_garment_asset(tmp_path)
    monkeypatch.setattr(photo_try_on_api, "GARMENT_ASSETS_DIR", tmp_path)
    monkeypatch.setattr(
        photo_try_on_api.settings,
        "photo_tryon_worker_url",
        "http://catvton:8001/api/generate",
    )
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "test-only-token")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", True)

    async def failed_inference(_person_jpeg, _garment_png):
        from fastapi import HTTPException

        raise HTTPException(status_code=504, detail="Local model timeout.")

    monkeypatch.setattr(photo_try_on_api, "_run_local_inference", failed_inference)
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("person.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )

    assert response.status_code == 504
    assert sorted(path.name for path in product_dir.iterdir()) == ["tryon-black.png"]
    assert not list(tmp_path.rglob("person*"))
    assert not list(tmp_path.rglob("result*"))


def test_worker_timeout_is_reported_without_persisting_images(
    monkeypatch, tmp_path, authenticated_user
):
    product_dir = _write_black_garment_asset(tmp_path)
    monkeypatch.setattr(photo_try_on_api, "GARMENT_ASSETS_DIR", tmp_path)
    monkeypatch.setattr(
        photo_try_on_api.settings,
        "photo_tryon_worker_url",
        "http://catvton:8001/api/generate",
    )
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "test-only-token")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", True)
    closed_uploads = []
    original_close = photo_try_on_api.UploadFile.close

    async def tracking_close(upload):
        await original_close(upload)
        closed_uploads.append(upload.file.closed)

    monkeypatch.setattr(photo_try_on_api.UploadFile, "close", tracking_close)

    class TimedOutClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, **_kwargs):
            import httpx

            raise httpx.ReadTimeout("test timeout", request=httpx.Request("POST", url))

    monkeypatch.setattr(
        photo_try_on_api.httpx,
        "AsyncClient",
        lambda **_kwargs: TimedOutClient(),
    )
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("person.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "true"},
    )

    assert response.status_code == 504
    assert closed_uploads == [True]
    assert sorted(path.name for path in product_dir.iterdir()) == ["tryon-black.png"]
    assert not list(tmp_path.rglob("person*"))
    assert not list(tmp_path.rglob("result*"))


def test_external_inference_host_is_never_used(monkeypatch, authenticated_user):
    monkeypatch.setattr(
        photo_try_on_api.settings,
        "photo_tryon_worker_url",
        "https://example.com/api/generate",
    )
    response = client.get("/api/photo-try-on/status")
    assert response.status_code == 200
    assert response.json()["available"] is False


def test_malformed_inference_url_reports_unavailable(monkeypatch):
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_url", "http://[invalid")

    response = client.get("/api/photo-try-on/status")

    assert response.status_code == 200
    assert response.json()["available"] is False


def test_user_must_confirm_photo_permission(authenticated_user):
    response = client.post(
        "/api/photo-try-on/generate",
        files={"photo": ("person.png", _png_bytes(), "image/png")},
        data={"product_id": "CT001", "color": "Black", "consent": "false"},
    )
    assert response.status_code == 422
    assert "permission" in response.json()["detail"]


def test_status_stays_disabled_without_local_worker(monkeypatch):
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_url", "")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_worker_token", "")
    monkeypatch.setattr(photo_try_on_api.settings, "photo_tryon_noncommercial_confirmed", False)
    response = client.get("/api/photo-try-on/status")
    assert response.status_code == 200
    assert response.json()["available"] is False
