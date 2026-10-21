from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint

from app.models.product import Base, gen_uuid


class BodyMeasurement(Base):
    """
    Stores ONE pose-detection snapshot's geometric estimates for a user.

    IMPORTANT — these are NOT centimeters. shoulder_width / hip_width /
    torso_length are normalized image-space distances (0-1 range, relative
    to the camera frame) computed from MediaPipe landmark positions. There
    is no calibration step yet (no known reference object, no camera
    intrinsics, no verified height-to-pixel mapping) — that's explicitly
    future-milestone work. measurement_unit records which convention a row
    used, so a later migration can distinguish old normalized rows from
    future calibrated ones without guessing.

    chest_estimate / waist_estimate are nullable and, in this milestone,
    always null — circumference can't be reliably inferred from a single
    front-facing 2D width measurement, so rather than invent a formula and
    present a guess as data, the API returns null for these until a real
    approach (e.g. multi-angle capture, a trained estimator) exists.

    user_height is optional and user-entered — stored now as the
    foundation for calibration, not used to convert anything to cm yet.
    """

    __tablename__ = "body_measurements"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_body_measurements_user_idempotency"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    shoulder_width = Column(Float, nullable=True)
    hip_width = Column(Float, nullable=True)
    torso_length = Column(Float, nullable=True)
    chest_estimate = Column(Float, nullable=True)
    waist_estimate = Column(Float, nullable=True)
    user_height = Column(Float, nullable=True)  # cm, user-entered, optional

    measurement_unit = Column(String, nullable=False, default="normalized")
    measurement_method = Column(String, nullable=False, default="mediapipe_pose_2d")
    idempotency_key = Column(String, nullable=True)
    orientation = Column(String, nullable=True)  # "front" | "side" | "uncertain"
    confidence = Column(Float, nullable=True)  # 0-1, average landmark visibility

    created_at = Column(DateTime, default=datetime.utcnow)
