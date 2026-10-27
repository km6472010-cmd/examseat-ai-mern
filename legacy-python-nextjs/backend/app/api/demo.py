from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.schemas.session import ExamSessionOut
from app.services.demo_service import generate_demo_bundle

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/run", response_model=ExamSessionOut)
def run_demo(db: DbSession = Depends(get_db)):
    """Spec section 24: one-click Run Demo, no configuration required."""
    session = generate_demo_bundle(db)
    return session
