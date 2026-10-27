from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import SeatingSource


class Student(Base):
    """Authorized student roster entry, reusable across exam sessions.

    `reference_image_path` / `embedding` are only populated when the
    optional identity-matching module (Mode 2, see app/cv/identity.py) is
    explicitly enabled with authorized reference images -- never inferred.
    """

    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    reference_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # JSON-encoded embedding vector, only set when identity matching is enabled.
    embedding: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class SeatingPlan(Base):
    """One official seating arrangement (a version) belonging to a session."""

    __tablename__ = "seating_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"))
    source: Mapped[SeatingSource] = mapped_column(Enum(SeatingSource), default=SeatingSource.CSV)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    session: Mapped["ExamSession"] = relationship(back_populates="seating_plans")
    seats: Mapped[list["Seat"]] = relationship(back_populates="seating_plan", cascade="all, delete-orphan")


class Seat(Base):
    """A single official seat entry: id/position + (optional) assignment."""

    __tablename__ = "seats"

    id: Mapped[int] = mapped_column(primary_key=True)
    seating_plan_id: Mapped[int] = mapped_column(ForeignKey("seating_plans.id"))
    seat_id: Mapped[str] = mapped_column(String(32), index=True)  # e.g. "A01"
    row: Mapped[int] = mapped_column(Integer)
    column: Mapped[int] = mapped_column(Integer)
    is_usable: Mapped[bool] = mapped_column(Boolean, default=True)

    assigned_student_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_student_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    seating_plan: Mapped["SeatingPlan"] = relationship(back_populates="seats")


class ClassroomLayout(Base):
    """Reusable physical calibration: seat_id -> normalized bounding box.

    `seats_json` is a JSON list of
    {seat_id, row, column, x, y, w, h} in normalized [0,1] coordinates
    (relative to the reference image), so the layout can be reapplied to
    images/frames of any resolution (see spec section 7).
    """

    __tablename__ = "classroom_layouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    room: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reference_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reference_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seats_json: Mapped[str] = mapped_column(String, default="[]")
    calibration_method: Mapped[str] = mapped_column(String(32), default="manual")  # manual | auto
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )
