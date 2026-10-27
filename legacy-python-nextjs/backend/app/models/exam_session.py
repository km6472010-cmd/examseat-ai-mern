from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import SessionStatus


class ExamSession(Base):
    """The top-level container for one examination's verification workflow."""

    __tablename__ = "exam_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_name: Mapped[str] = mapped_column(String(255))
    room: Mapped[str] = mapped_column(String(100))
    exam_date: Mapped[dt.date] = mapped_column(Date)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.DRAFT)
    seat_count: Mapped[int] = mapped_column(Integer, default=0)
    is_demo: Mapped[bool] = mapped_column(default=False)

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )

    created_by_user: Mapped["User"] = relationship(back_populates="exam_sessions")
    seating_plans: Mapped[list["SeatingPlan"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    classroom_layout_id: Mapped[int | None] = mapped_column(
        ForeignKey("classroom_layouts.id"), nullable=True
    )
    classroom_layout: Mapped["ClassroomLayout"] = relationship()
    processing_jobs: Mapped[list["ProcessingJob"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    verification_results: Mapped[list["VerificationResult"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
