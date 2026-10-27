from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import ReportFormat


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"))
    format: Mapped[ReportFormat] = mapped_column(Enum(ReportFormat))
    file_path: Mapped[str] = mapped_column(String(512))
    generated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    session: Mapped["ExamSession"] = relationship(back_populates="reports")
