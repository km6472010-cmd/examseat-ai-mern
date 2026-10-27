from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.models.enums import EvidenceType, JobStatus


class ProcessingJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    evidence_type: EvidenceType
    status: JobStatus
    progress_percent: float
    frames_total: int
    frames_processed: int
    students_detected: int
    seats_analyzed: int
    error_message: str | None
    started_at: dt.datetime | None
    finished_at: dt.datetime | None
