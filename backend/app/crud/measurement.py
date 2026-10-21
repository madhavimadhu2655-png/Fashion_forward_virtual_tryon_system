from typing import Optional

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.measurement import BodyMeasurement
from app.schemas.measurement import MeasurementIn


def create_measurement(
    db: Session,
    user_id: str,
    payload: MeasurementIn,
) -> BodyMeasurement:
    if payload.idempotency_key:
        existing = (
            db.query(BodyMeasurement)
            .filter(
                BodyMeasurement.user_id == user_id,
                BodyMeasurement.idempotency_key == payload.idempotency_key,
            )
            .first()
        )
        if existing is not None:
            return existing

    measurement = BodyMeasurement(
        user_id=user_id,
        shoulder_width=payload.shoulder_width,
        hip_width=payload.hip_width,
        torso_length=payload.torso_length,
        chest_estimate=payload.chest_estimate,
        waist_estimate=payload.waist_estimate,
        user_height=payload.user_height,
        measurement_unit=payload.measurement_unit,
        measurement_method=payload.measurement_method,
        orientation=payload.orientation,
        confidence=payload.confidence,
        idempotency_key=payload.idempotency_key,
    )
    try:
        db.add(measurement)
        db.commit()
        db.refresh(measurement)
        return measurement
    except IntegrityError:
        db.rollback()
        if payload.idempotency_key:
            existing = (
                db.query(BodyMeasurement)
                .filter(
                    BodyMeasurement.user_id == user_id,
                    BodyMeasurement.idempotency_key == payload.idempotency_key,
                )
                .first()
            )
            if existing is not None:
                return existing
        raise
    except SQLAlchemyError:
        db.rollback()
        raise


def list_measurements_for_user(db: Session, user_id: str) -> list[BodyMeasurement]:
    return (
        db.query(BodyMeasurement)
        .filter(BodyMeasurement.user_id == user_id)
        .order_by(BodyMeasurement.created_at.desc())
        .all()
    )


def get_measurement_for_user(db: Session, measurement_id: str, user_id: str) -> Optional[BodyMeasurement]:
    """Returns None if the measurement doesn't exist OR belongs to a
    different user — callers can't distinguish those two cases, which is
    the point: it never confirms another user's data exists."""
    return (
        db.query(BodyMeasurement)
        .filter(BodyMeasurement.id == measurement_id, BodyMeasurement.user_id == user_id)
        .first()
    )
