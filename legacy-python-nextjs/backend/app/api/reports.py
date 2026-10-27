from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.models.detection import VerificationResult
from app.models.enums import ReportFormat
from app.models.exam_session import ExamSession
from app.models.report import Report
from app.schemas.report import ReportSummary
from app.services.report_service import compute_summary, generate_csv_report, generate_json_report, generate_pdf_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

_MEDIA_TYPES = {
    ReportFormat.PDF: "application/pdf",
    ReportFormat.CSV: "text/csv",
    ReportFormat.JSON: "application/json",
}
_GENERATORS = {
    ReportFormat.PDF: generate_pdf_report,
    ReportFormat.CSV: generate_csv_report,
    ReportFormat.JSON: generate_json_report,
}


@router.get("/{session_id}/summary", response_model=ReportSummary)
def get_report_summary(session_id: int, db: DbSession = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    results = db.query(VerificationResult).filter(VerificationResult.session_id == session_id).all()
    return compute_summary(session, results)


@router.get("/{session_id}")
def download_report(session_id: int, format: ReportFormat = ReportFormat.PDF, db: DbSession = Depends(get_db)):
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    results = db.query(VerificationResult).filter(VerificationResult.session_id == session_id).all()
    if not results:
        raise HTTPException(status_code=422, detail="No verification results to report yet -- run a verification first.")

    generator = _GENERATORS[format]
    path = generator(session, results)

    db.add(Report(session_id=session_id, format=format, file_path=str(path)))
    db.commit()

    return FileResponse(path=str(path), media_type=_MEDIA_TYPES[format], filename=path.name)
