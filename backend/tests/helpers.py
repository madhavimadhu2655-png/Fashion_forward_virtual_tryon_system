import uuid

from fastapi.testclient import TestClient


def register(client: TestClient, name: str = "Test Shopper") -> tuple[str, dict, str]:
    """Creates a fresh user. Returns (access_token, auth headers, user_id)."""
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post(
        "/api/auth/register",
        json={"full_name": name, "email": email, "password": "supersecret123", "confirm_password": "supersecret123"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    token = body["access_token"]
    return token, {"Authorization": f"Bearer {token}"}, body["user"]["id"]
