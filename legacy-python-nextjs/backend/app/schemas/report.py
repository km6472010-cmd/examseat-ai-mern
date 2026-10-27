from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.models.enums import ReportFormat


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    format: ReportFormat
    file_path: str
    generated_at: dt.datetime


class ReportSummary(BaseModel):
    exam_name: str
    room: str
    exam_date: dt.date
    total_seats: int
    occupied: int
    empty: int
    correct: int
    wrong_seat: int
    unassigned: int
    needs_review: int
    accuracy_pct: float
