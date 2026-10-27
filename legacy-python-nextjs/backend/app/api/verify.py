from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.database.session import SessionLocal, get_db
from app.models.enums import EvidenceType, JobStatus, SessionStatus
from app.models.exam_session import ExamSession
from app.models.job import ProcessingJob
from app.models.seating import ClassroomLayout, Seat
from app.schemas.detection import VerificationResultOut
from app.schemas.job import ProcessingJobOut
from app.services import classroom_service, seating_service
from app.services.verification_service import run_image_verification, run_video_verification

router = APIRouter(prefix="/api/verify", tags=["verify"])


def _prereqs(db: DbSession, session_id: int) -> tuple[ExamSession, ClassroomLayout, list, list[Seat]]:
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    if not session.classroom_layout_id:
        raise HTTPException(
            status_code=422, detail="This session has no calibrated classroom layout yet. Calibrate a classroom first."
        )
    layout = db.get(ClassroomLayout, session.classroom_layout_id)
    if not layout:
        raise HTTPException(status_code=422, detail="Classroom layout not found.")
    plan = seating_service.get_active_seating_plan(db, session_id)
    if not plan:
        raise HTTPException(status_code=422, detail="No official seating arrangement uploaded for this session yet.")
    layout_seats = classroom_service.get_layout_seats(layout)
    return session, layout, layout_seats, plan.seats


@router.post("/image", response_model=list[VerificationResultOut])
async def verify_image(session_id: int, file: UploadFile = File(...), db: DbSession = Depends(get_db)):
    session, layout, layout_seats, official_seats = _prereqs(db, session_id)

    upload_dir = Path(settings.UPLOADS_DIR) / "evidence"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    session.status = SessionStatus.PROCESSING
    db.commit()

    job = ProcessingJob(session_id=session_id, evidence_type=EvidenceType.IMAGE, evidence_path=str(dest))
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        results = run_image_verification(db, job, str(dest), layout, layout_seats, official_seats)
    except Exception as exc:
        session.status = SessionStatus.READY
        db.commit()
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}")

    session.status = SessionStatus.COMPLETED
    db.commit()
    return results


def _run_video_job_in_background(job_id: int, video_path: str, layout_id: int, session_id: int):
    db = SessionLocal()
    try:
        job = db.get(ProcessingJob, job_id)
        layout = db.get(ClassroomLayout, layout_id)
        layout_seats = classroom_service.get_layout_seats(layout)
        plan = seating_service.get_active_seating_plan(db, session_id)
        run_video_verification(db, job, video_path, layout, layout_seats, plan.seats)
        session = db.get(ExamSession, session_id)
        session.status = SessionStatus.COMPLETED
        db.commit()
    except Exception:
        session = db.get(ExamSession, session_id)
        if session:
            session.status = SessionStatus.READY
            db.commit()
    finally:
        db.close()


@router.post("/video", response_model=ProcessingJobOut)
async def verify_video(
    session_id: int, background_tasks: BackgroundTasks, file: UploadFile = File(...), db: DbSession = Depends(get_db)
):
    session, layout, layout_seats, official_seats = _prereqs(db, session_id)

    upload_dir = Path(settings.UPLOADS_DIR) / "evidence"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    session.status = SessionStatus.PROCESSING
    db.commit()

    job = ProcessingJob(session_id=session_id, evidence_type=EvidenceType.VIDEO, evidence_path=str(dest))
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_video_job_in_background, job.id, str(dest), layout.id, session_id)
    return job
