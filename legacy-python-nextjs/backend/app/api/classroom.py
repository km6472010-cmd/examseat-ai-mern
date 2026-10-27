from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.database.session import get_db
from app.models.seating import ClassroomLayout
from app.schemas.classroom import AutoDetectSeatsResult, ClassroomLayoutCreate, ClassroomLayoutOut
from app.services import classroom_service

router = APIRouter(prefix="/api/classroom", tags=["classroom"])


@router.post("/upload-image")
async def upload_classroom_image(file: UploadFile = File(...)):
    """Uploads a reference classroom photo for calibration; returns its stored path/dims."""
    upload_dir = Path(settings.UPLOADS_DIR) / "classroom"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    import cv2

    image = cv2.imread(str(dest))
    if image is None:
        raise HTTPException(status_code=422, detail="Uploaded file is not a readable image.")
    h, w = image.shape[:2]
    return {"path": str(dest), "width": w, "height": h}


@router.post("/auto-detect", response_model=AutoDetectSeatsResult)
async def auto_detect_seats(rows: int = Form(...), columns: int = Form(...), file: UploadFile = File(...)):
    """Best-effort grid-based seat suggestion (spec section 6/7) -- always meant to be corrected."""
    upload_dir = Path(settings.UPLOADS_DIR) / "classroom"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    seats = classroom_service.auto_detect_seats_for_image(str(dest), rows=rows, columns=columns)
    return AutoDetectSeatsResult(
        seats=seats,
        method="grid-estimate",
        confidence_note=(
            "Automatic seat detection from a single photo is unreliable (perspective, occlusion, "
            "arbitrary furniture). These seats were laid out as an evenly spaced grid -- please drag "
            "each seat to match the photo before saving."
        ),
    )


@router.post("/calibrate", response_model=ClassroomLayoutOut)
def calibrate_classroom(payload: ClassroomLayoutCreate, reference_image_path: str | None = None, db: DbSession = Depends(get_db)):
    layout = classroom_service.create_classroom_layout(db, payload, reference_image_path)
    return ClassroomLayoutOut(
        id=layout.id,
        name=layout.name,
        room=layout.room,
        reference_image_path=layout.reference_image_path,
        reference_width=layout.reference_width,
        reference_height=layout.reference_height,
        calibration_method=layout.calibration_method,
        seats=classroom_service.get_layout_seats(layout),
        created_at=layout.created_at,
        updated_at=layout.updated_at,
    )


@router.put("/calibrate/{layout_id}", response_model=ClassroomLayoutOut)
def update_calibration(layout_id: int, payload: ClassroomLayoutCreate, db: DbSession = Depends(get_db)):
    layout = db.get(ClassroomLayout, layout_id)
    if not layout:
        raise HTTPException(status_code=404, detail="Classroom layout not found")
    layout = classroom_service.update_classroom_layout(db, layout, payload)
    return ClassroomLayoutOut(
        id=layout.id,
        name=layout.name,
        room=layout.room,
        reference_image_path=layout.reference_image_path,
        reference_width=layout.reference_width,
        reference_height=layout.reference_height,
        calibration_method=layout.calibration_method,
        seats=classroom_service.get_layout_seats(layout),
        created_at=layout.created_at,
        updated_at=layout.updated_at,
    )


@router.get("/layouts", response_model=list[ClassroomLayoutOut])
def list_layouts(db: DbSession = Depends(get_db)):
    layouts = db.query(ClassroomLayout).order_by(ClassroomLayout.updated_at.desc()).all()
    return [
        ClassroomLayoutOut(
            id=l.id, name=l.name, room=l.room, reference_image_path=l.reference_image_path,
            reference_width=l.reference_width, reference_height=l.reference_height,
            calibration_method=l.calibration_method, seats=classroom_service.get_layout_seats(l),
            created_at=l.created_at, updated_at=l.updated_at,
        )
        for l in layouts
    ]


@router.get("/layouts/{layout_id}", response_model=ClassroomLayoutOut)
def get_layout(layout_id: int, db: DbSession = Depends(get_db)):
    layout = db.get(ClassroomLayout, layout_id)
    if not layout:
        raise HTTPException(status_code=404, detail="Classroom layout not found")
    return ClassroomLayoutOut(
        id=layout.id, name=layout.name, room=layout.room, reference_image_path=layout.reference_image_path,
        reference_width=layout.reference_width, reference_height=layout.reference_height,
        calibration_method=layout.calibration_method, seats=classroom_service.get_layout_seats(layout),
        created_at=layout.created_at, updated_at=layout.updated_at,
    )
