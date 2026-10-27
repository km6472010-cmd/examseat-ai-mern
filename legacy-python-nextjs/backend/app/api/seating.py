from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.cv.ocr import extract_seating_table
from app.database.session import get_db
from app.models.enums import SeatingSource
from app.models.exam_session import ExamSession
from app.schemas.seating import (
    CsvParseIssue,
    SeatingPlanManualCreate,
    SeatingPlanOut,
    SeatingPlanUploadResult,
)
from app.services import seating_service
from app.services.csv_service import CsvValidationError, ParsedSeatRow, parse_seating_csv

router = APIRouter(prefix="/api/seating", tags=["seating"])


def _get_session_or_404(db: DbSession, session_id: int) -> ExamSession:
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    return session


@router.post("/upload", response_model=SeatingPlanUploadResult)
async def upload_seating_csv(
    session_id: int = Form(...), file: UploadFile = File(...), db: DbSession = Depends(get_db)
):
    """Option A: CSV upload (spec section 5)."""
    _get_session_or_404(db, session_id)
    content = await file.read()
    try:
        parsed = parse_seating_csv(content)
    except CsvValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    plan = seating_service.create_seating_plan(
        db, session_id, parsed.rows, SeatingSource.CSV, raw_filename=file.filename
    )
    return SeatingPlanUploadResult(
        seating_plan=plan,
        warnings=[CsvParseIssue(**w) for w in parsed.warnings],
        rows_parsed=parsed.rows_parsed,
        rows_skipped=parsed.rows_skipped,
    )


@router.post("/manual", response_model=SeatingPlanOut)
def save_manual_seating(
    session_id: int, payload: SeatingPlanManualCreate, db: DbSession = Depends(get_db)
):
    """Option B: manual seating-plan editor (spec section 5)."""
    _get_session_or_404(db, session_id)
    if not payload.seats:
        raise HTTPException(status_code=422, detail="At least one seat is required.")
    rows = [
        ParsedSeatRow(
            seat_id=s.seat_id, row=s.row, column=s.column, student_id=s.student_id, student_name=s.student_name
        )
        for s in payload.seats
    ]
    plan = seating_service.create_seating_plan(db, session_id, rows, SeatingSource.MANUAL)
    return plan


@router.post("/ocr/extract")
async def ocr_extract_seating(file: UploadFile = File(...)):
    """Option C: upload seating-plan image and extract a structured table via OCR.

    Returns the raw extracted rows for the frontend to render as an
    editable table -- nothing is saved until the user confirms via
    /api/seating/ocr/confirm (spec: "display extracted data and allow
    the user to correct it before verification").
    """
    upload_dir = Path(settings.UPLOADS_DIR) / "ocr"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    result = extract_seating_table(str(dest))
    return {
        "rows": [r.__dict__ for r in result.rows],
        "warnings": result.warnings,
        "raw_text": result.raw_text,
    }


@router.post("/ocr/confirm", response_model=SeatingPlanOut)
def ocr_confirm_seating(
    session_id: int, payload: SeatingPlanManualCreate, db: DbSession = Depends(get_db)
):
    _get_session_or_404(db, session_id)
    rows = [
        ParsedSeatRow(
            seat_id=s.seat_id, row=s.row, column=s.column, student_id=s.student_id, student_name=s.student_name
        )
        for s in payload.seats
    ]
    plan = seating_service.create_seating_plan(db, session_id, rows, SeatingSource.OCR)
    return plan


@router.get("/{session_id}", response_model=SeatingPlanOut)
def get_seating_plan(session_id: int, db: DbSession = Depends(get_db)):
    plan = seating_service.get_active_seating_plan(db, session_id)
    if not plan:
        raise HTTPException(status_code=404, detail="No seating plan uploaded for this session yet.")
    return plan
