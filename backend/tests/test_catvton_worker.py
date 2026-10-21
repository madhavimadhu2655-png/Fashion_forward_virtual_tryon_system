import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from ai_runtime import app as worker


client = TestClient(worker.app)


def _png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (512, 768), (40, 70, 100)).save(buffer, format="PNG")
    return buffer.getvalue()


class FakeRuntime:
    def generate(self, _person, _garment):
        return Image.new("RGB", (768, 1024), (120, 80, 60))


@pytest.fixture
def configured_worker(monkeypatch):
    monkeypatch.setenv("CATVTON_WORKER_TOKEN", "test-only-token")
    monkeypatch.setattr(worker, "runtime", FakeRuntime())


def test_worker_returns_ephemeral_preview(configured_worker, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    response = client.post(
        "/api/generate",
        headers={"Authorization": "Bearer test-only-token"},
        files={
            "person": ("person.jpg", _png_bytes(), "image/jpeg"),
            "garment": ("garment.png", _png_bytes(), "image/png"),
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "no-store" in response.headers["cache-control"]
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert list(Path(tmp_path).iterdir()) == []


def test_worker_rejects_invalid_image_without_writing(configured_worker, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    response = client.post(
        "/api/generate",
        headers={"Authorization": "Bearer test-only-token"},
        files={
            "person": ("person.jpg", b"not an image", "image/jpeg"),
            "garment": ("garment.png", _png_bytes(), "image/png"),
        },
    )
    assert response.status_code == 422
    assert list(Path(tmp_path).iterdir()) == []


def test_worker_requires_private_service_token(configured_worker):
    response = client.post(
        "/api/generate",
        files={
            "person": ("person.jpg", _png_bytes(), "image/jpeg"),
            "garment": ("garment.png", _png_bytes(), "image/png"),
        },
    )
    assert response.status_code == 401
