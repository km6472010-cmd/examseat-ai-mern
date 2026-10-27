from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SeatingSource


class SeatIn(BaseModel):
    seat_id: str
    row: int
    column: int
    student_id: str | None = None
    student_name: str | None = None
    is_usable: bool = True


class SeatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    seat_id: str
    row: int
    column: int
    is_usable: bool
    assigned_student_id: str | None
    assigned_student_name: str | None


class SeatingPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    source: SeatingSource
    is_active: bool
    raw_filename: str | None
    created_at: dt.datetime
    seats: list[SeatOut] = Field(default_factory=list)


class SeatingPlanManualCreate(BaseModel):
    """Used by the manual seating-plan editor (Option B)."""

    seats: list[SeatIn]


class CsvParseIssue(BaseModel):
    row_number: int
    message: str


class SeatingPlanUploadResult(BaseModel):
    seating_plan: SeatingPlanOut
    warnings: list[CsvParseIssue] = Field(default_factory=list)
    rows_parsed: int
    rows_skipped: int
