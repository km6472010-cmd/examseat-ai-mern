"""Shared enum types used across the ORM models and Pydantic schemas."""
from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    INVIGILATOR = "invigilator"
    VIEWER = "viewer"


class SeatingSource(str, enum.Enum):
    CSV = "csv"
    MANUAL = "manual"
    OCR = "ocr"
    DEMO = "demo"


class SessionStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class EvidenceType(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class VerificationStatus(str, enum.Enum):
    CORRECT = "CORRECT"
    EMPTY = "EMPTY"
    WRONG_SEAT = "WRONG_SEAT"
    UNASSIGNED = "UNASSIGNED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class ReviewDecision(str, enum.Enum):
    CONFIRM = "confirm"
    REJECT = "reject"
    MARK_EMPTY = "mark_empty"


class ReportFormat(str, enum.Enum):
    PDF = "pdf"
    CSV = "csv"
    JSON = "json"
