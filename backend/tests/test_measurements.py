"""
Body measurement tests. Shared in-memory DB + dependency override live
in conftest.py.

Run with: docker compose exec backend pytest
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register(email: str) -> str:
    resp = client.post(
        "/api/auth/register",
        json={
            "full_name": "Measurement Tester",
            "email": email,
            "password": "supersecret123",
            "confirm_password": "supersecret123",
        },
    )
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


VALID_MEASUREMENT = {
    "shoulder_width": 0.32,
    "hip_width": 0.28,
    "torso_length": 0.41,
    "chest_estimate": None,
    "waist_estimate": None,
    "user_height": None,
    "measurement_unit": "normalized",
    "measurement_method": "mediapipe_pose_2d",
    "orientation": "front",
    "confidence": 0.91,
    "idempotency_key": "test-snapshot-001",
}


def test_authenticated_user_can_save_measurement():
    token = _register("measure1@example.com")
    resp = client.post(
        "/api/body/measurements",
        json=VALID_MEASUREMENT,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["shoulder_width"] == 0.32
    assert data["chest_estimate"] is None  # never invented
    assert data["measurement_unit"] == "normalized"
    assert data["measurement_method"] == "mediapipe_pose_2d"
    assert data["created_at"]


def test_unauthenticated_user_cannot_save_measurement():
    resp = client.post("/api/body/measurements", json=VALID_MEASUREMENT)
    assert resp.status_code == 401


def test_user_can_retrieve_own_measurements():
    token = _register("measure2@example.com")
    client.post(
        "/api/body/measurements", json=VALID_MEASUREMENT, headers={"Authorization": f"Bearer {token}"}
    )
    resp = client.get("/api/body/measurements", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_user_cannot_retrieve_another_users_measurement():
    token_a = _register("usera@example.com")
    token_b = _register("userb@example.com")

    save_resp = client.post(
        "/api/body/measurements", json=VALID_MEASUREMENT, headers={"Authorization": f"Bearer {token_a}"}
    )
    measurement_id = save_resp.json()["id"]

    # User B tries to fetch User A's specific measurement by id.
    resp = client.get(
        f"/api/body/measurements/{measurement_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 404  # not 403 — doesn't confirm it exists

    # And User B's own list never contains it.
    list_resp = client.get("/api/body/measurements", headers={"Authorization": f"Bearer {token_b}"})
    ids = [m["id"] for m in list_resp.json()]
    assert measurement_id not in ids


def test_owner_can_retrieve_specific_measurement():
    token = _register("owner@example.com")
    save_resp = client.post(
        "/api/body/measurements", json=VALID_MEASUREMENT, headers={"Authorization": f"Bearer {token}"}
    )
    measurement_id = save_resp.json()["id"]
    resp = client.get(f"/api/body/measurements/{measurement_id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["id"] == measurement_id


def test_all_fields_null_is_rejected():
    """Invalid poses must not be persisted as successful measurement sessions."""
    token = _register("nullcase@example.com")
    resp = client.post(
        "/api/body/measurements",
        json={
            "shoulder_width": None,
            "hip_width": None,
            "torso_length": None,
            "chest_estimate": None,
            "waist_estimate": None,
            "user_height": None,
            "measurement_unit": "normalized",
            "measurement_method": "mediapipe_pose_2d",
            "orientation": "front",
            "confidence": None,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_invalid_measurement_value_rejected_out_of_range():
    token = _register("badvalue@example.com")
    resp = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "shoulder_width": 5.0},  # way outside 0-1 normalized range
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_invalid_confidence_rejected():
    token = _register("badconf@example.com")
    resp = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "confidence": 1.5},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_invalid_orientation_rejected():
    token = _register("badorientation@example.com")
    resp = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "orientation": "upside-down"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_unreasonable_user_height_rejected():
    token = _register("badheight@example.com")
    resp = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "user_height": 900},  # not a human height
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


def test_repeated_idempotency_key_returns_existing_snapshot():
    token = _register("idempotent@example.com")
    first = client.post(
        "/api/body/measurements",
        json=VALID_MEASUREMENT,
        headers=_auth(token),
    )
    second = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "shoulder_width": 0.33},
        headers=_auth(token),
    )
    history = client.get("/api/body/measurements", headers=_auth(token))

    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["shoulder_width"] == 0.32
    assert sum(row["id"] == first.json()["id"] for row in history.json()) == 1


def test_invalid_measurement_unit_and_low_confidence_rejected():
    token = _register("measurement-validation@example.com")
    wrong_unit = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "measurement_unit": "cm"},
        headers=_auth(token),
    )
    low_confidence = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "confidence": 0.49},
        headers=_auth(token),
    )

    assert wrong_unit.status_code == 422
    assert low_confidence.status_code == 422


def test_zero_or_missing_required_measurement_is_rejected():
    token = _register("incomplete-measurement@example.com")
    zero_value = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "shoulder_width": 0},
        headers=_auth(token),
    )
    missing_value = client.post(
        "/api/body/measurements",
        json={key: value for key, value in VALID_MEASUREMENT.items() if key != "torso_length"},
        headers=_auth(token),
    )

    assert zero_value.status_code == 422
    assert missing_value.status_code == 422


def test_database_failure_is_rolled_back_and_returns_error(monkeypatch):
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Session

    from app.models.measurement import BodyMeasurement

    token = _register("measurement-failure@example.com")
    original_commit = Session.commit

    def fail_measurement_commit(self):
        if any(isinstance(item, BodyMeasurement) for item in self.new):
            raise OperationalError("insert measurement", {}, RuntimeError("database unavailable"))
        return original_commit(self)

    monkeypatch.setattr(Session, "commit", fail_measurement_commit)
    response = client.post(
        "/api/body/measurements",
        json={**VALID_MEASUREMENT, "idempotency_key": "will-fail"},
        headers=_auth(token),
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Couldn't save the measurement. Please retry."
    history = client.get("/api/body/measurements", headers=_auth(token))
    assert all(row["idempotency_key"] != "will-fail" for row in history.json())
