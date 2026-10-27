from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.models.detection import VerificationResult
from app.models.exam_session import ExamSession
from app.schemas.session import ExamSessionCreate, ExamSessionOut, ExamSessionSummary, ExamSessionUpdate
from app.services.report_service import compute_summary

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _summarize(db: DbSession, session: ExamSession) -> ExamSessionSummary:
    results = db.query(VerificationResult).filter(VerificationResult.session_id == session.id).all()
    summary = compute_summary(session, results) if results else {
        "exam_name": session.exam_name,
        "room": session.room,
        "exam_date": session.exam_date.isoformat(),
        "total_seats": session.seat_count,
        "occupied": 0,
        "empty": 0,
        "correct": 0,
        "wrong_seat": 0,
        "unassigned": 0,
        "needs_review": 0,
        "accuracy_pct": 0.0,
    }
    return ExamSessionSummary(
        id=session.id,
        exam_name=session.exam_name,
        room=session.room,
        exam_date=session.exam_date,
        status=session.status,
        seat_count=session.seat_count,
        is_demo=session.is_demo,
        classroom_layout_id=session.classroom_layout_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        total_seats=summary["total_seats"],
        occupied=summary["occupied"],
        empty=summary["empty"],
        correct=summary["correct"],
        wrong_seat=summary["wrong_seat"],
        unassigned=summary["unassigned"],
        needs_review=summary["needs_review"],
        accuracy_pct=summary["accuracy_pct"],
    )


@router.post("", response_model=ExamSessionOut)
def create_session(payload: ExamSessionCreate, db: DbSession = Depends(get_db)):
    session = ExamSession(exam_name=payload.exam_name, room=payload.room, exam_date=payload.exam_date)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=list[ExamSessionSummary])
def list_sessions(db: DbSession = Depends(get_db)):
    sessions = db.query(ExamSession).order_by(ExamSession.created_at.desc()).all()
    return [_summarize(db, s) for s in sessions]


@router.get("/{session_id}", response_model=ExamSessionSummary)
def get_session(session_id: int, db: DbSession = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    return _summarize(db, session)


@router.patch("/{session_id}", response_model=ExamSessionOut)
def update_session(session_id: int, payload: ExamSessionUpdate, db: DbSession = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: DbSession = Depends(get_db)):
    """Deletes the session and all associated data (spec section 22: deletion functionality)."""
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    db.delete(session)
    db.commit()
    return None
