from __future__ import annotations

from pydantic import BaseModel


class AppSettingsOut(BaseModel):
    detection_backend: str
    person_detection_confidence_threshold: float
    seat_match_max_distance_norm: float
    confidence_review_threshold: float
    confidence_high_threshold: float
    identity_match_threshold: float
    auto_delete_evidence: bool
    retention_days: int


class AppSettingsUpdate(BaseModel):
    person_detection_confidence_threshold: float | None = None
    seat_match_max_distance_norm: float | None = None
    confidence_review_threshold: float | None = None
    confidence_high_threshold: float | None = None
    identity_match_threshold: float | None = None
    auto_delete_evidence: bool | None = None
    retention_days: int | None = None
