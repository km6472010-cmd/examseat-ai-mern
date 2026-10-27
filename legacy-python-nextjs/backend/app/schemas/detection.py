from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.models.enums import VerificationStatus
from app.schemas.common import BoundingBox


class DetectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    frame_number: int
    track_id: int | None
    bounding_box: BoundingBox
    detection_confidence: float
    detected_identity_student_id: str | None
    identity_confidence: float | None


class VerificationResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    job_id: int | None
    seat_id: str
    assigned_student_id: str | None
    assigned_student_name: str | None
    detected_student_id: str | None
    status: VerificationStatus

    detection_confidence: float
    seat_match_confidence: float
    identity_confidence: float
    spatial_consistency: float
    overall_confidence: float

    evidence_image_path: str | None
    explanation: str | None
    created_at: dt.datetime


class ReviewCreate(BaseModel):
    decision: str  # "confirm" | "reject" | "mark_empty"
    reviewer: str = "invigilator"
    notes: str | None = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verification_result_id: int
    reviewer: str
    decision: str
    notes: str | None
    decided_at: dt.datetime
