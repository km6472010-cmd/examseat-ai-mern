from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import EvidenceType, JobStatus


class ProcessingJob(Base):
    """Tracks one verification run (image or video) for progress + status."""

    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"))
    evidence_type: Mapped[EvidenceType] = mapped_column(Enum(EvidenceType))
    evidence_path: Mapped[str] = mapped_column(String(512))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED)

    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    frames_total: Mapped[int] = mapped_column(Integer, default=1)
    frames_processed: Mapped[int] = mapped_column(Integer, default=0)
    students_detected: Mapped[int] = mapped_column(Integer, default=0)
    seats_analyzed: Mapped[int] = mapped_column(Integer, default=0)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    session: Mapped["ExamSession"] = relationship(back_populates="processing_jobs")
