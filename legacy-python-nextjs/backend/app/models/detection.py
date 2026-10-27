from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import ReviewDecision, VerificationStatus


class Detection(Base):
    """A single raw person detection from the CV pipeline (one image/frame)."""

    __tablename__ = "detections"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("processing_jobs.id"))
    frame_number: Mapped[int] = mapped_column(Integer, default=0)  # 0 for still images
    track_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # video object-tracking id

    bbox_x1: Mapped[float] = mapped_column(Float)
    bbox_y1: Mapped[float] = mapped_column(Float)
    bbox_x2: Mapped[float] = mapped_column(Float)
    bbox_y2: Mapped[float] = mapped_column(Float)
    detection_confidence: Mapped[float] = mapped_column(Float)

    detected_identity_student_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    identity_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class SeatAssignment(Base):
    """Candidate/final spatial mapping of a Detection to a physical seat."""

    __tablename__ = "seat_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    detection_id: Mapped[int] = mapped_column(ForeignKey("detections.id"))
    seat_id: Mapped[str] = mapped_column(String(32))  # matches ClassroomLayout seat_id
    classroom_layout_id: Mapped[int] = mapped_column(ForeignKey("classroom_layouts.id"))

    distance_norm: Mapped[float] = mapped_column(Float)  # normalized euclidean distance
    iou: Mapped[float] = mapped_column(Float, default=0.0)
    containment: Mapped[float] = mapped_column(Float, default=0.0)  # fraction of student bbox inside seat region
    assignment_confidence: Mapped[float] = mapped_column(Float)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class VerificationResult(Base):
    """Final per-seat verification outcome for a session (one row per seat)."""

    __tablename__ = "verification_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"))
    job_id: Mapped[int | None] = mapped_column(ForeignKey("processing_jobs.id"), nullable=True)

    seat_id: Mapped[str] = mapped_column(String(32), index=True)
    assigned_student_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_student_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    detected_student_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detection_id: Mapped[int | None] = mapped_column(ForeignKey("detections.id"), nullable=True)

    status: Mapped[VerificationStatus] = mapped_column(Enum(VerificationStatus))

    detection_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    seat_match_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    identity_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    spatial_consistency: Mapped[float] = mapped_column(Float, default=0.0)
    overall_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    evidence_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    session: Mapped["ExamSession"] = relationship(back_populates="verification_results")
    human_review: Mapped["HumanReview"] = relationship(
        back_populates="verification_result", uselist=False, cascade="all, delete-orphan"
    )


class HumanReview(Base):
    """A manual invigilator decision recorded against one verification result."""

    __tablename__ = "human_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    verification_result_id: Mapped[int] = mapped_column(
        ForeignKey("verification_results.id"), unique=True
    )
    reviewer: Mapped[str] = mapped_column(String(255), default="invigilator")
    decision: Mapped[ReviewDecision] = mapped_column(Enum(ReviewDecision))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    verification_result: Mapped["VerificationResult"] = relationship(back_populates="human_review")
