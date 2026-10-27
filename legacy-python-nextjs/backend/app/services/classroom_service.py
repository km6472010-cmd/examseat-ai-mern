from __future__ import annotations

import json

import cv2
from sqlalchemy.orm import Session

from app.cv.seats import auto_detect_seat_regions
from app.models.seating import ClassroomLayout
from app.schemas.classroom import ClassroomLayoutCreate, SeatRegion


def create_classroom_layout(
    db: Session, payload: ClassroomLayoutCreate, reference_image_path: str | None
) -> ClassroomLayout:
    layout = ClassroomLayout(
        name=payload.name,
        room=payload.room,
        reference_image_path=reference_image_path,
        reference_width=payload.reference_width,
        reference_height=payload.reference_height,
        seats_json=json.dumps([s.model_dump() for s in payload.seats]),
        calibration_method=payload.calibration_method,
    )
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return layout


def update_classroom_layout(db: Session, layout: ClassroomLayout, payload: ClassroomLayoutCreate) -> ClassroomLayout:
    layout.name = payload.name
    layout.room = payload.room
    if payload.reference_width:
        layout.reference_width = payload.reference_width
    if payload.reference_height:
        layout.reference_height = payload.reference_height
    layout.seats_json = json.dumps([s.model_dump() for s in payload.seats])
    layout.calibration_method = payload.calibration_method
    db.commit()
    db.refresh(layout)
    return layout


def get_layout_seats(layout: ClassroomLayout) -> list[SeatRegion]:
    return [SeatRegion(**s) for s in json.loads(layout.seats_json)]


def auto_detect_seats_for_image(image_path: str, rows: int, columns: int) -> list[SeatRegion]:
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")
    return auto_detect_seat_regions(image, rows=rows, columns=columns)
