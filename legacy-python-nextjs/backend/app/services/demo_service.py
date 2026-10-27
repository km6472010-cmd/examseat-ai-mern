"""
Demo Mode (spec section 24).

Generates a synthetic classroom photo and a matching official seating
arrangement, then runs the actual comparison/confidence engine
(app/verification/engine.classify_seat -- the same function every real
verification run uses) against a deterministic, hand-designed set of
per-seat evidence values that exercise every status the pipeline can
produce (CORRECT via both Mode 1 "identity unverified" and Mode 2
"identity matched", EMPTY, EMPTY-with-conflict, WRONG_SEAT, UNASSIGNED,
NEEDS_REVIEW).

Honesty note (spec section 27, "do not fake the AI"): the *decision
logic* here is 100% real -- every row below is classified by the same
verification engine a live camera run uses, and you can see its math in
app/verification/engine.py. What's synthetic is the *evidence feeding
into it* (detection/seat-match/identity confidence numbers, and the
cartoon classroom photo) -- a HOG people-detector cannot reliably see
drawn stick figures, so scripting realistic evidence values is what lets
Demo Mode show every status without requiring a real photo or a trained
model first. Every session, seat, and result created by this endpoint is
flagged `is_demo=True` and the frontend must visibly label it as
synthetic data, never presented as a real verification outcome.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.cv.overlay import render_annotated_image
from app.cv.seats import norm_to_pixel
from app.models.detection import VerificationResult
from app.models.enums import EvidenceType, JobStatus, SeatingSource, SessionStatus
from app.models.exam_session import ExamSession
from app.models.job import ProcessingJob
from app.schemas.classroom import SeatRegion
from app.services import classroom_service, seating_service
from app.services.csv_service import ParsedSeatRow
from app.verification.engine import SeatVerificationInput, VerificationConfig, classify_seat

ROWS, COLS = 4, 5
ROW_LETTERS = ["A", "B", "C", "D"]

# (seat_id, assigned_student_id | None, case)
DEMO_CASES: list[tuple[str, str | None, str]] = [
    ("A01", "STU001", "correct_identity"),
    ("A02", "STU002", "correct_identity"),
    ("A03", "STU003", "correct_unverified"),
    ("A04", "STU004", "correct_unverified"),
    ("A05", "STU005", "correct_unverified"),
    ("B01", "STU006", "empty"),
    ("B02", "STU007", "empty_conflict"),
    ("B03", "STU008", "correct_unverified"),
    ("B04", "STU009", "correct_unverified"),
    ("B05", "STU010", "correct_unverified"),
    ("C01", "STU011", "wrong_seat"),
    ("C02", "STU012", "wrong_seat"),
    ("C03", None, "unassigned"),
    ("C04", "STU013", "needs_review"),
    ("C05", "STU014", "needs_review"),
    ("D01", "STU015", "correct_unverified"),
    ("D02", "STU016", "correct_unverified"),
    ("D03", "STU017", "correct_unverified"),
    ("D04", "STU018", "correct_unverified"),
    ("D05", "STU019", "correct_unverified"),
]

STUDENT_NAMES = {f"STU{n:03d}": f"Student {n}" for n in range(1, 21)}


def _build_seat_regions() -> list[SeatRegion]:
    margin = 0.05
    cell_w = (1 - 2 * margin) / COLS
    cell_h = (1 - 2 * margin) / ROWS
    regions = []
    for r, letter in enumerate(ROW_LETTERS):
        for c in range(COLS):
            seat_id = f"{letter}{c + 1:02d}"
            regions.append(
                SeatRegion(
                    seat_id=seat_id,
                    row=r + 1,
                    column=c + 1,
                    x=round(margin + cell_w * (c + 0.5), 4),
                    y=round(margin + cell_h * (r + 0.5), 4),
                    w=round(cell_w * 0.75, 4),
                    h=round(cell_h * 0.75, 4),
                    is_usable=True,
                )
            )
    return regions


def _draw_demo_classroom(seat_regions: list[SeatRegion], occupied_seat_ids: set[str]) -> np.ndarray:
    w, h = 1200, 900
    img = np.full((h, w, 3), (245, 245, 240), dtype=np.uint8)
    cv2.putText(
        img, "SYNTHETIC DEMO CLASSROOM -- not a real photo", (24, 34),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (120, 60, 10), 2, cv2.LINE_AA,
    )

    rng = np.random.default_rng(42)  # fixed seed -> fully deterministic image
    by_id = {s.seat_id: s for s in seat_regions}

    for seat in seat_regions:
        x1, y1, sw, sh = norm_to_pixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, w, h)
        # desk
        cv2.rectangle(img, (x1, y1 + int(sh * 0.55)), (x1 + sw, y1 + sh), (200, 170, 130), -1)
        cv2.rectangle(img, (x1, y1 + int(sh * 0.55)), (x1 + sw, y1 + sh), (150, 120, 90), 2)
        cv2.putText(
            img, seat.seat_id, (x1 + 4, y1 + sh + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (90, 90, 90), 1, cv2.LINE_AA
        )

        if seat.seat_id in occupied_seat_ids:
            cx = x1 + sw // 2 + int(rng.integers(-4, 5))
            cy = y1 + int(sh * 0.32)
            body_color = tuple(int(v) for v in rng.integers(90, 200, size=3))
            cv2.circle(img, (cx, cy), int(sh * 0.16), body_color, -1)  # head
            cv2.rectangle(
                img,
                (cx - int(sw * 0.28), cy + int(sh * 0.12)),
                (cx + int(sw * 0.28), y1 + int(sh * 0.58)),
                body_color,
                -1,
            )  # shoulders/torso

    return img


def _case_to_input(seat_id: str, assigned_id: str | None, case: str) -> tuple[SeatVerificationInput, str | None]:
    """Returns (engine input, detected_student_id_for_overlay)."""
    assigned_name = STUDENT_NAMES.get(assigned_id) if assigned_id else None

    if case == "correct_identity":
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name,
                detection_confidence=0.93, seat_match_confidence=0.91, spatial_consistency=0.88,
                detected_student_id=assigned_id, identity_confidence=0.9,
            ),
            assigned_id,
        )
    if case == "correct_unverified":
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name,
                detection_confidence=0.87, seat_match_confidence=0.85, spatial_consistency=0.8,
            ),
            None,
        )
    if case == "empty":
        return (
            SeatVerificationInput(seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name),
            None,
        )
    if case == "empty_conflict":
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name,
                conflicting_candidate_score=0.31,
            ),
            None,
        )
    if case == "wrong_seat":
        # A different student's identity than what was officially assigned here.
        other_id = "STU020"
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name,
                detection_confidence=0.9, seat_match_confidence=0.88, spatial_consistency=0.82,
                detected_student_id=other_id, identity_confidence=0.84,
            ),
            other_id,
        )
    if case == "unassigned":
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=None, assigned_student_name=None,
                detection_confidence=0.81, seat_match_confidence=0.79, spatial_consistency=0.7,
            ),
            None,
        )
    if case == "needs_review":
        return (
            SeatVerificationInput(
                seat_id=seat_id, assigned_student_id=assigned_id, assigned_student_name=assigned_name,
                detection_confidence=0.44, seat_match_confidence=0.38, spatial_consistency=0.3,
            ),
            None,
        )
    raise ValueError(f"unknown demo case: {case}")


def generate_demo_bundle(db: Session) -> ExamSession:
    seat_regions = _build_seat_regions()

    csv_rows = [
        ParsedSeatRow(
            seat_id=seat_id,
            row=int(seat_id[1:]),
            column=int(seat_id[1:]),
            student_id=assigned_id,
            student_name=STUDENT_NAMES.get(assigned_id) if assigned_id else None,
        )
        for seat_id, assigned_id, _ in DEMO_CASES
    ]
    # fix row/column from the actual grid (letters map to row index)
    for row, (seat_id, _, _) in zip(csv_rows, DEMO_CASES):
        row.row = ROW_LETTERS.index(seat_id[0]) + 1
        row.column = int(seat_id[1:])

    session = ExamSession(
        exam_name="Database Systems -- Demo Session",
        room="CSE-204 (Demo)",
        exam_date=dt.date.today(),
        status=SessionStatus.DRAFT,
        is_demo=True,
        seat_count=len(DEMO_CASES),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    seating_service.create_seating_plan(db, session.id, csv_rows, SeatingSource.DEMO, raw_filename="demo_seating.csv")

    occupied_ids = {seat_id for seat_id, _, case in DEMO_CASES if case not in ("empty", "empty_conflict")}
    demo_image = _draw_demo_classroom(seat_regions, occupied_ids)
    demo_dir = Path(settings.DEMO_DIR)
    demo_dir.mkdir(parents=True, exist_ok=True)
    image_path = demo_dir / f"demo_classroom_{session.id}.jpg"
    cv2.imwrite(str(image_path), demo_image)

    from app.schemas.classroom import ClassroomLayoutCreate

    layout = classroom_service.create_classroom_layout(
        db,
        ClassroomLayoutCreate(
            name=f"Demo Layout (session {session.id})",
            room=session.room,
            reference_width=demo_image.shape[1],
            reference_height=demo_image.shape[0],
            seats=seat_regions,
            calibration_method="demo",
        ),
        reference_image_path=str(image_path),
    )
    session.classroom_layout_id = layout.id
    session.status = SessionStatus.COMPLETED
    db.commit()

    job = ProcessingJob(
        session_id=session.id,
        evidence_type=EvidenceType.IMAGE,
        evidence_path=str(image_path),
        status=JobStatus.COMPLETED,
        progress_percent=100.0,
        frames_total=1,
        frames_processed=1,
        students_detected=len(occupied_ids),
        seats_analyzed=len(seat_regions),
        started_at=dt.datetime.utcnow(),
        finished_at=dt.datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    cfg = VerificationConfig(
        review_threshold=settings.CONFIDENCE_REVIEW_THRESHOLD, high_threshold=settings.CONFIDENCE_HIGH_THRESHOLD
    )
    annotations = []
    for seat_id, assigned_id, case in DEMO_CASES:
        engine_input, detected_id = _case_to_input(seat_id, assigned_id, case)
        outcome = classify_seat(engine_input, cfg)

        vr = VerificationResult(
            session_id=session.id,
            job_id=job.id,
            seat_id=outcome.seat_id,
            assigned_student_id=outcome.assigned_student_id,
            assigned_student_name=outcome.assigned_student_name,
            detected_student_id=outcome.detected_student_id,
            status=outcome.status,
            detection_confidence=outcome.detection_confidence,
            seat_match_confidence=outcome.seat_match_confidence,
            identity_confidence=outcome.identity_confidence,
            spatial_consistency=outcome.spatial_consistency,
            overall_confidence=outcome.overall_confidence,
            explanation=outcome.explanation + " [synthetic demo evidence]",
        )
        db.add(vr)

        region = next(s for s in seat_regions if s.seat_id == seat_id)
        px1, py1, pw, ph = norm_to_pixel(
            region.x - region.w / 2, region.y - region.h / 2, region.w, region.h,
            demo_image.shape[1], demo_image.shape[0],
        )
        annotations.append(
            {
                "seat_id": seat_id,
                "bbox": (px1, py1, px1 + pw, py1 + ph),
                "status": outcome.status,
                "assigned_student": outcome.assigned_student_name or outcome.assigned_student_id,
                "detected_student": outcome.detected_student_id,
                "confidence": outcome.overall_confidence,
            }
        )
    db.commit()

    overlay = render_annotated_image(demo_image, annotations)
    processed_dir = Path(settings.PROCESSED_DIR)
    processed_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(processed_dir / f"job_{job.id}_overlay.jpg"), overlay)

    return session
