from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.models.detection import VerificationResult
from app.schemas.detection import VerificationResultOut

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{session_id}", response_model=list[VerificationResultOut])
def get_results(session_id: int, db: DbSession = Depends(get_db)):
    """Latest verification result per seat for this session (spec section 20)."""
    results = (
        db.query(VerificationResult)
        .filter(VerificationResult.session_id == session_id)
        .order_by(VerificationResult.seat_id, VerificationResult.created_at.desc())
        .all()
    )
    latest_by_seat: dict[str, VerificationResult] = {}
    for r in results:
        if r.seat_id not in latest_by_seat:
            latest_by_seat[r.seat_id] = r
    return sorted(latest_by_seat.values(), key=lambda r: r.seat_id)
