from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MeasurementIn(BaseModel):
    """
    Persist only valid front-pose snapshots. Geometric values are normalized
    image-space distances (not centimeters); chest and waist remain null
    because they cannot be inferred reliably from a single front image.
    """

    shoulder_width: Optional[float] = Field(default=None, gt=0, le=1)
    hip_width: Optional[float] = Field(default=None, gt=0, le=1)
    torso_length: Optional[float] = Field(default=None, gt=0, le=1)
    chest_estimate: Optional[float] = Field(default=None, ge=0, le=1)
    waist_estimate: Optional[float] = Field(default=None, ge=0, le=1)
    user_height: Optional[float] = Field(default=None, gt=0, le=250)  # cm, sane human range
    measurement_unit: Literal["normalized"] = "normalized"
    measurement_method: Literal["mediapipe_pose_2d"] = "mediapipe_pose_2d"
    orientation: Literal["front"] = "front"
    confidence: float = Field(ge=0.5, le=1)
    idempotency_key: Optional[str] = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _validate(self):
        if self.shoulder_width is None or self.hip_width is None or self.torso_length is None:
            raise ValueError("A valid pose must provide shoulder width, hip width, and torso length.")
        return self


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    shoulder_width: Optional[float] = None
    hip_width: Optional[float] = None
    torso_length: Optional[float] = None
    chest_estimate: Optional[float] = None
    waist_estimate: Optional[float] = None
    user_height: Optional[float] = None
    measurement_unit: str
    measurement_method: str
    orientation: Optional[str] = None
    confidence: Optional[float] = None
    created_at: datetime
