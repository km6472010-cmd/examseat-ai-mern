from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.database.session import get_db
from app.models.job import ProcessingJob
from app.schemas.job import ProcessingJobOut

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=ProcessingJobOut)
def get_job(job_id: int, db: DbSession = Depends(get_db)):
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found")
    return job


@router.get("/session/{session_id}", response_model=list[ProcessingJobOut])
def list_jobs_for_session(session_id: int, db: DbSession = Depends(get_db)):
    return (
        db.query(ProcessingJob)
        .filter(ProcessingJob.session_id == session_id)
        .order_by(ProcessingJob.created_at.desc())
        .all()
    )
