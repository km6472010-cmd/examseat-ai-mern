from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.models.enums import SessionStatus


class ExamSessionCreate(BaseModel):
    exam_name: str
    room: str
    exam_date: dt.date


class ExamSessionUpdate(BaseModel):
    exam_name: str | None = None
    room: str | None = None
    exam_date: dt.date | None = None
    status: SessionStatus | None = None
    classroom_layout_id: int | None = None


class ExamSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exam_name: str
    room: str
    exam_date: dt.date
    status: SessionStatus
    seat_count: int
    is_demo: bool
    classroom_layout_id: int | None
    created_at: dt.datetime
    updated_at: dt.datetime


class ExamSessionSummary(ExamSessionOut):
    total_seats: int = 0
    occupied: int = 0
    empty: int = 0
    correct: int = 0
    wrong_seat: int = 0
    unassigned: int = 0
    needs_review: int = 0
    accuracy_pct: float = 0.0
