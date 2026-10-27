from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.models.detection import HumanReview, VerificationResult
from app.models.enums import ReviewDecision, VerificationStatus
from app.schemas.detection import ReviewCreate, ReviewOut, VerificationResultOut

router = APIRouter(prefix="/api", tags=["human-review"])

_DECISION_TO_STATUS = {
    ReviewDecision.CONFIRM: None,  # keeps the AI's own status, just marks it human-confirmed
    ReviewDecision.REJECT: VerificationStatus.NEEDS_REVIEW,
    ReviewDecision.MARK_EMPTY: VerificationStatus.EMPTY,
}


@router.get("/reviews/{session_id}", response_model=list[VerificationResultOut])
def list_review_queue(session_id: int, db: DbSession = Depends(get_db)):
    """Every NEEDS_REVIEW case for this session that has not yet been reviewed (spec section 12)."""
    reviewed_ids = {
        r.verification_result_id
        for r in db.query(HumanReview)
        .join(VerificationResult)
        .filter(VerificationResult.session_id == session_id)
        .all()
    }
    results = (
        db.query(VerificationResult)
        .filter(
            VerificationResult.session_id == session_id,
            VerificationResult.status == VerificationStatus.NEEDS_REVIEW,
        )
        .order_by(VerificationResult.overall_confidence.asc())
        .all()
    )
    return [r for r in results if r.id not in reviewed_ids]


@router.post("/reviews/{verification_result_id}/confirm", response_model=ReviewOut)
def confirm_review(verification_result_id: int, payload: ReviewCreate, db: DbSession = Depends(get_db)):
    return _record_review(db, verification_result_id, ReviewDecision.CONFIRM, payload)


@router.post("/reviews/{verification_result_id}/reject", response_model=ReviewOut)
def reject_review(verification_result_id: int, payload: ReviewCreate, db: DbSession = Depends(get_db)):
    return _record_review(db, verification_result_id, ReviewDecision.REJECT, payload)


@router.post("/reviews/{verification_result_id}/mark-empty", response_model=ReviewOut)
def mark_empty_review(verification_result_id: int, payload: ReviewCreate, db: DbSession = Depends(get_db)):
    return _record_review(db, verification_result_id, ReviewDecision.MARK_EMPTY, payload)


def _record_review(
    db: DbSession, verification_result_id: int, decision: ReviewDecision, payload: ReviewCreate
) -> HumanReview:
    vr = db.get(VerificationResult, verification_result_id)
    if not vr:
        raise HTTPException(status_code=404, detail="Verification result not found")

    existing = db.query(HumanReview).filter(HumanReview.verification_result_id == verification_result_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="This case has already been reviewed.")

    review = HumanReview(
        verification_result_id=verification_result_id,
        reviewer=payload.reviewer,
        decision=decision,
        notes=payload.notes,
    )
    db.add(review)

    new_status = _DECISION_TO_STATUS[decision]
    if new_status is not None:
        vr.status = new_status
        vr.explanation = (vr.explanation or "") + f" [Human review: {decision.value}]"
    else:
        vr.explanation = (vr.explanation or "") + " [Human-confirmed]"

    db.commit()
    db.refresh(review)
    return review
