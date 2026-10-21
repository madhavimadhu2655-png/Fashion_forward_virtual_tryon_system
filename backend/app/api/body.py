import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.deps import get_current_user
from app.crud import measurement as crud
from app.schemas.measurement import MeasurementIn, MeasurementOut
from app.models.user import User

router = APIRouter(prefix="/api/body", tags=["body-measurements"])
logger = logging.getLogger(__name__)


@router.post("/measurements", response_model=MeasurementOut, status_code=status.HTTP_201_CREATED)
def save_measurement(
    payload: MeasurementIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return crud.create_measurement(db, current_user.id, payload)
    except SQLAlchemyError as exc:
        logger.exception("Failed to persist body measurement for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Couldn't save the measurement. Please retry.",
        ) from exc


@router.get("/measurements", response_model=list[MeasurementOut])
def list_my_measurements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Always scoped to current_user.id — there is no code path here that
    # accepts a different user_id, so there's nothing to authorize against.
    return crud.list_measurements_for_user(db, current_user.id)


@router.get("/measurements/{measurement_id}", response_model=MeasurementOut)
def get_my_measurement(
    measurement_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    measurement = crud.get_measurement_for_user(db, measurement_id, current_user.id)
    if measurement is None:
        # Same 404 whether the id doesn't exist or belongs to someone
        # else — doesn't confirm another user's measurement exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Measurement not found")
    return measurement
