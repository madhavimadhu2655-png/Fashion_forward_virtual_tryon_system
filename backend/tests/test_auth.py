"""
Auth tests. Shared in-memory DB + dependency override live in
conftest.py (see the note there for why that matters across files).

Run with: docker compose exec backend pytest
"""

import time

from fastapi.testclient import TestClient
from jose import jwt

from app.main import app
from app.crud.user import create_user
from app.core.config import settings
from app.models.user import User
from tests.conftest import TestSessionLocal

client = TestClient(app)


VALID_REGISTRATION = {
    "full_name": "Test User",
    "email": "test.user@example.com",
    "password": "supersecret123",
    "confirm_password": "supersecret123",
}


# ---------- Registration ----------

def test_register_valid():
    resp = client.post("/api/auth/register", json=VALID_REGISTRATION)
    assert resp.status_code == 201
    data = resp.json()
    assert data["user"]["email"] == "test.user@example.com"
    assert data["user"]["role"] == "customer"
    assert "access_token" in data
    assert "refresh_token" in data
    # password must never appear anywhere in the response
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]


def test_register_duplicate_email():
    client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "dupe@example.com"})
    resp = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "dupe@example.com"})
    assert resp.status_code == 409


def test_register_invalid_email():
    resp = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "not-an-email"})
    assert resp.status_code == 422


def test_register_weak_password():
    resp = client.post(
        "/api/auth/register",
        json={**VALID_REGISTRATION, "email": "weak@example.com", "password": "short", "confirm_password": "short"},
    )
    assert resp.status_code == 422


def test_register_password_mismatch():
    resp = client.post(
        "/api/auth/register",
        json={**VALID_REGISTRATION, "email": "mismatch@example.com", "confirm_password": "differentpassword"},
    )
    assert resp.status_code == 422


def test_register_cannot_set_role():
    # Even if a client sends a "role" field, it's ignored — schema has no such field.
    resp = client.post(
        "/api/auth/register",
        json={**VALID_REGISTRATION, "email": "roleattempt@example.com", "role": "admin"},
    )
    assert resp.status_code == 201
    assert resp.json()["user"]["role"] == "customer"


# ---------- Login ----------

def test_login_correct_credentials():
    client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "login@example.com"})
    resp = client.post("/api/auth/login", json={"email": "login@example.com", "password": "supersecret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password():
    client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "wrongpw@example.com"})
    resp = client.post("/api/auth/login", json={"email": "wrongpw@example.com", "password": "totallywrong"})
    assert resp.status_code == 401


def test_login_unknown_email():
    resp = client.post("/api/auth/login", json={"email": "doesnotexist@example.com", "password": "whatever123"})
    assert resp.status_code == 401


# ---------- JWT ----------

def test_me_with_valid_token():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "me@example.com"})
    token = reg.json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


def test_me_with_invalid_token():
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer garbage.not.a.token"})
    assert resp.status_code == 401


def test_me_with_expired_token():
    expired_payload = {
        "sub": "some-user-id",
        "role": "customer",
        "type": "access",
        "iat": int(time.time()) - 1000,
        "exp": int(time.time()) - 500,  # already expired
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401


def test_me_with_missing_token():
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_refresh_token_issues_new_access_token():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "refresh@example.com"})
    refresh_token = reg.json()["refresh_token"]
    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


# ---------- Authorization (role-based) ----------

def test_customer_cannot_access_admin_route():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "customer1@example.com"})
    token = reg.json()["access_token"]
    resp = client.get("/api/admin/ping", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_admin_can_access_admin_route():
    db = TestSessionLocal()
    admin = create_user(db, "Admin User", "admin1@example.com", "adminpassword123")
    admin.role = "admin"
    db.commit()
    db.close()

    login = client.post("/api/auth/login", json={"email": "admin1@example.com", "password": "adminpassword123"})
    token = login.json()["access_token"]
    resp = client.get("/api/admin/ping", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


# ---------- Security ----------

def test_password_is_hashed_not_plaintext():
    db = TestSessionLocal()
    user = db.query(User).filter(User.email == "test.user@example.com").first()
    assert user is not None
    assert user.password_hash != "supersecret123"
    assert user.password_hash.startswith("$2b$")  # bcrypt hash prefix
    db.close()


def test_password_hash_never_in_any_response():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "hashcheck@example.com"})
    assert "password_hash" not in str(reg.json())

    token = reg.json()["access_token"]
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert "password_hash" not in str(me_resp.json())


def test_new_user_is_active_by_default():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "active@example.com"})
    assert reg.json()["user"]["is_active"] is True


# ---------- Profile update ----------

def test_update_profile_name():
    reg = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "profileupdate@example.com"})
    token = reg.json()["access_token"]
    resp = client.patch(
        "/api/auth/me",
        json={"full_name": "New Name"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "New Name"


def test_update_profile_email_conflict():
    client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "taken@example.com"})
    reg2 = client.post("/api/auth/register", json={**VALID_REGISTRATION, "email": "wantstaken@example.com"})
    token = reg2.json()["access_token"]
    resp = client.patch(
        "/api/auth/me",
        json={"email": "taken@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409
