from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.enums import SeatingSource
from app.models.seating import Seat, SeatingPlan
from app.services.csv_service import ParsedSeatRow


def create_seating_plan(
    db: Session,
    session_id: int,
    rows: list[ParsedSeatRow],
    source: SeatingSource,
    raw_filename: str | None = None,
) -> SeatingPlan:
    # Only one active seating plan per session at a time -- deactivate priors
    # so "official arrangement" always resolves unambiguously.
    db.execute(
        update(SeatingPlan).where(SeatingPlan.session_id == session_id).values(is_active=False)
    )

    plan = SeatingPlan(session_id=session_id, source=source, is_active=True, raw_filename=raw_filename)
    db.add(plan)
    db.flush()

    for r in rows:
        db.add(
            Seat(
                seating_plan_id=plan.id,
                seat_id=r.seat_id,
                row=r.row,
                column=r.column,
                assigned_student_id=r.student_id,
                assigned_student_name=r.student_name,
                is_usable=True,
            )
        )

    from app.models.exam_session import ExamSession

    exam_session = db.get(ExamSession, session_id)
    if exam_session:
        exam_session.seat_count = len(rows)

    db.commit()
    db.refresh(plan)
    return plan


def get_active_seating_plan(db: Session, session_id: int) -> SeatingPlan | None:
    return (
        db.query(SeatingPlan)
        .filter(SeatingPlan.session_id == session_id, SeatingPlan.is_active == True)  # noqa: E712
        .order_by(SeatingPlan.created_at.desc())
        .first()
    )
