"""
Orchestrates the full pipeline (spec section 4):

    Classroom Detection -> Seat Detection/Mapping -> Student Detection ->
    Student-to-Seat Assignment -> Official Seating Arrangement Lookup ->
    Comparison Engine -> Confidence Scoring -> Human Verification Queue

This module is the glue between the pure CV/verification logic
(app/cv/*, app/verification/engine.py -- both independently unit
tested) and persistence (SQLAlchemy models) + the CV image/video I/O.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import cv2
from sqlalchemy.orm import Session

from app.config import settings
from app.cv.detectors import get_detector
from app.cv.matching import MatchingConfig, NormalizedDetection, SeatBox, match_students_to_seats
from app.cv.overlay import render_annotated_image
from app.cv.seats import norm_to_pixel, seat_region_bbox_norm
from app.cv.video import CentroidTracker, extract_frames
from app.models.detection import Detection, SeatAssignment, VerificationResult
from app.models.enums import JobStatus
from app.models.job import ProcessingJob
from app.models.seating import ClassroomLayout, Seat
from app.schemas.classroom import SeatRegion
from app.verification.engine import SeatVerificationInput, VerificationConfig, classify_seat


def _layout_seat_boxes(layout_seats: list[SeatRegion]) -> list[SeatBox]:
    boxes = []
    for s in layout_seats:
        x1, y1, x2, y2 = seat_region_bbox_norm(s)
        boxes.append(SeatBox(seat_id=s.seat_id, cx=s.x, cy=s.y, x1=x1, y1=y1, x2=x2, y2=y2, is_usable=s.is_usable))
    return boxes


def _verification_config() -> VerificationConfig:
    return VerificationConfig(
        review_threshold=settings.CONFIDENCE_REVIEW_THRESHOLD,
        high_threshold=settings.CONFIDENCE_HIGH_THRESHOLD,
    )


def _official_seat_lookup(official_seats: list[Seat]) -> dict[str, Seat]:
    return {s.seat_id: s for s in official_seats}


def run_image_verification(
    db: Session,
    job: ProcessingJob,
    image_path: str,
    layout: ClassroomLayout,
    layout_seats: list[SeatRegion],
    official_seats: list[Seat],
) -> list[VerificationResult]:
    job.status = JobStatus.RUNNING
    job.started_at = dt.datetime.utcnow()
    db.commit()

    image = cv2.imread(image_path)
    if image is None:
        job.status = JobStatus.FAILED
        job.error_message = f"Could not read image file: {image_path}"
        db.commit()
        raise ValueError(job.error_message)

    h, w = image.shape[:2]
    detector = get_detector(settings.DETECTION_BACKEND, settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD)
    raw_detections = detector.detect(image)

    normalized = [
        NormalizedDetection(
            index=i,
            cx=(d.x1 + d.x2) / 2 / w,
            cy=(d.y1 + d.y2) / 2 / h,
            x1=d.x1 / w,
            y1=d.y1 / h,
            x2=d.x2 / w,
            y2=d.y2 / h,
            confidence=d.confidence,
        )
        for i, d in enumerate(raw_detections)
    ]

    seat_boxes = _layout_seat_boxes(layout_seats)
    match_cfg = MatchingConfig(max_distance_norm=settings.SEAT_MATCH_MAX_DISTANCE_NORM)
    matches = match_students_to_seats(normalized, seat_boxes, match_cfg)

    # Persist raw detections + seat_assignments -----------------------------
    detection_rows: list[Detection] = []
    for i, d in enumerate(raw_detections):
        row = Detection(
            job_id=job.id,
            frame_number=0,
            bbox_x1=d.x1,
            bbox_y1=d.y1,
            bbox_x2=d.x2,
            bbox_y2=d.y2,
            detection_confidence=d.confidence,
        )
        db.add(row)
        detection_rows.append(row)
    db.flush()

    match_by_seat: dict[str, tuple] = {}  # seat_id -> (detection_row, match_result)
    conflict_by_seat: dict[str, float] = {}
    for m in matches:
        det_row = detection_rows[m.detection_index]
        if m.seat_id:
            db.add(
                SeatAssignment(
                    detection_id=det_row.id,
                    seat_id=m.seat_id,
                    classroom_layout_id=layout.id,
                    distance_norm=m.distance_norm,
                    iou=m.iou,
                    containment=m.containment,
                    assignment_confidence=m.assignment_confidence,
                )
            )
            match_by_seat[m.seat_id] = (det_row, m)
        # Track near-miss candidates for seats that end up empty (conflicts).
        for cand in m.all_candidates:
            if cand.seat_id not in match_by_seat or match_by_seat[cand.seat_id][0].id != det_row.id:
                conflict_by_seat[cand.seat_id] = max(conflict_by_seat.get(cand.seat_id, 0.0), cand.score)

    official_by_seat = _official_seat_lookup(official_seats)
    cfg = _verification_config()
    annotations = []
    results: list[VerificationResult] = []

    for seat in layout_seats:
        official = official_by_seat.get(seat.seat_id)
        assigned_id = official.assigned_student_id if official else None
        assigned_name = official.assigned_student_name if official else None
        is_usable = (official.is_usable if official else True) and seat.is_usable

        matched = match_by_seat.get(seat.seat_id)
        det_conf = matched[0].detection_confidence if matched else None
        seat_conf = matched[1].assignment_confidence if matched else None
        if matched:
            candidates = matched[1].all_candidates
            spatial = (
                round(candidates[0].score - candidates[1].score, 4) if len(candidates) > 1 else round(candidates[0].score, 4)
            ) if candidates else matched[1].assignment_confidence
            spatial = max(spatial, 0.0)
        else:
            spatial = None

        outcome = classify_seat(
            SeatVerificationInput(
                seat_id=seat.seat_id,
                assigned_student_id=assigned_id,
                assigned_student_name=assigned_name,
                is_usable=is_usable,
                detection_confidence=det_conf,
                seat_match_confidence=seat_conf,
                spatial_consistency=spatial,
                detected_student_id=None,  # identity matching not enabled by default (Mode 1)
                identity_confidence=None,
                conflicting_candidate_score=conflict_by_seat.get(seat.seat_id) if not matched else None,
            ),
            cfg,
        )

        vr = VerificationResult(
            session_id=job.session_id,
            job_id=job.id,
            seat_id=seat.seat_id,
            assigned_student_id=outcome.assigned_student_id,
            assigned_student_name=outcome.assigned_student_name,
            detected_student_id=outcome.detected_student_id,
            detection_id=matched[0].id if matched else None,
            status=outcome.status,
            detection_confidence=outcome.detection_confidence,
            seat_match_confidence=outcome.seat_match_confidence,
            identity_confidence=outcome.identity_confidence,
            spatial_consistency=outcome.spatial_consistency,
            overall_confidence=outcome.overall_confidence,
            explanation=outcome.explanation,
        )
        db.add(vr)
        results.append(vr)

        px1, py1, pw, ph = norm_to_pixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, w, h)
        bbox = (px1, py1, px1 + pw, py1 + ph)
        if matched:
            d = raw_detections[[i for i, dr in enumerate(detection_rows) if dr.id == matched[0].id][0]]
            bbox = (int(d.x1), int(d.y1), int(d.x2), int(d.y2))
        annotations.append(
            {
                "seat_id": seat.seat_id,
                "bbox": bbox,
                "status": outcome.status,
                "assigned_student": outcome.assigned_student_name or outcome.assigned_student_id,
                "detected_student": outcome.detected_student_id,
                "confidence": outcome.overall_confidence,
            }
        )

    overlay = render_annotated_image(image, annotations)
    processed_dir = Path(settings.PROCESSED_DIR)
    processed_dir.mkdir(parents=True, exist_ok=True)
    overlay_path = processed_dir / f"job_{job.id}_overlay.jpg"
    cv2.imwrite(str(overlay_path), overlay)

    job.status = JobStatus.COMPLETED
    job.progress_percent = 100.0
    job.frames_total = 1
    job.frames_processed = 1
    job.students_detected = len(raw_detections)
    job.seats_analyzed = len(layout_seats)
    job.finished_at = dt.datetime.utcnow()
    db.commit()

    return results


def run_video_verification(
    db: Session,
    job: ProcessingJob,
    video_path: str,
    layout: ClassroomLayout,
    layout_seats: list[SeatRegion],
    official_seats: list[Seat],
    sample_every_n_frames: int = 5,
    progress_cb=None,
) -> list[VerificationResult]:
    """Aggregates per-seat detection evidence across sampled frames (spec section 17)."""
    job.status = JobStatus.RUNNING
    job.started_at = dt.datetime.utcnow()
    db.commit()

    detector = get_detector(settings.DETECTION_BACKEND, settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD)
    seat_boxes = _layout_seat_boxes(layout_seats)
    match_cfg = MatchingConfig(max_distance_norm=settings.SEAT_MATCH_MAX_DISTANCE_NORM)
    tracker = CentroidTracker()

    # seat_id -> running stats across frames
    seat_votes: dict[str, int] = {}
    seat_det_conf_sum: dict[str, float] = {}
    seat_match_conf_sum: dict[str, float] = {}
    seat_spatial_sum: dict[str, float] = {}
    best_frame_bbox: dict[str, tuple[int, int, int, int]] = {}

    frames_processed = 0
    frames_total_est = 1
    representative_frame = None

    try:
        cap_info = cv2.VideoCapture(video_path)
        frames_total_est = int(cap_info.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        cap_info.release()

        for frame_idx, total, frame in extract_frames(video_path, sample_every_n_frames):
            frames_total_est = total or frames_total_est
            if representative_frame is None:
                representative_frame = frame

            h, w = frame.shape[:2]
            raw_detections = detector.detect(frame)
            tracker.update([((d.x1, d.y1, d.x2, d.y2), d.confidence) for d in raw_detections])

            normalized = [
                NormalizedDetection(
                    index=i,
                    cx=(d.x1 + d.x2) / 2 / w,
                    cy=(d.y1 + d.y2) / 2 / h,
                    x1=d.x1 / w,
                    y1=d.y1 / h,
                    x2=d.x2 / w,
                    y2=d.y2 / h,
                    confidence=d.confidence,
                )
                for i, d in enumerate(raw_detections)
            ]
            matches = match_students_to_seats(normalized, seat_boxes, match_cfg)
            for m in matches:
                if not m.seat_id:
                    continue
                seat_votes[m.seat_id] = seat_votes.get(m.seat_id, 0) + 1
                d = raw_detections[m.detection_index]
                seat_det_conf_sum[m.seat_id] = seat_det_conf_sum.get(m.seat_id, 0.0) + d.confidence
                seat_match_conf_sum[m.seat_id] = seat_match_conf_sum.get(m.seat_id, 0.0) + m.assignment_confidence
                candidates = m.all_candidates
                margin = (candidates[0].score - candidates[1].score) if len(candidates) > 1 else m.assignment_confidence
                seat_spatial_sum[m.seat_id] = seat_spatial_sum.get(m.seat_id, 0.0) + max(margin, 0.0)
                best_frame_bbox[m.seat_id] = (int(d.x1), int(d.y1), int(d.x2), int(d.y2))

            frames_processed += 1
            job.frames_total = frames_total_est
            job.frames_processed = frames_processed
            job.progress_percent = round(min(frames_processed * sample_every_n_frames / max(frames_total_est, 1), 1.0) * 100, 1)
            job.students_detected = len(tracker.objects)
            db.commit()
            if progress_cb:
                progress_cb(job)
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.error_message = str(exc)
        db.commit()
        raise

    official_by_seat = _official_seat_lookup(official_seats)
    cfg = _verification_config()
    annotations = []
    results: list[VerificationResult] = []
    min_vote_fraction = 0.4  # a seat must be occupied in >=40% of sampled frames to count as "occupied"

    for seat in layout_seats:
        official = official_by_seat.get(seat.seat_id)
        assigned_id = official.assigned_student_id if official else None
        assigned_name = official.assigned_student_name if official else None
        is_usable = (official.is_usable if official else True) and seat.is_usable

        votes = seat_votes.get(seat.seat_id, 0)
        occupied = frames_processed > 0 and (votes / frames_processed) >= min_vote_fraction

        det_conf = seat_conf = spatial = None
        if occupied and votes > 0:
            det_conf = seat_det_conf_sum[seat.seat_id] / votes
            seat_conf = seat_match_conf_sum[seat.seat_id] / votes
            spatial = seat_spatial_sum[seat.seat_id] / votes
            # Reward consistency across frames: a seat matched in nearly every
            # sampled frame is much more trustworthy than one matched once.
            consistency_ratio = votes / max(frames_processed, 1)
            seat_conf = round(seat_conf * (0.6 + 0.4 * consistency_ratio), 4)

        outcome = classify_seat(
            SeatVerificationInput(
                seat_id=seat.seat_id,
                assigned_student_id=assigned_id,
                assigned_student_name=assigned_name,
                is_usable=is_usable,
                detection_confidence=det_conf,
                seat_match_confidence=seat_conf,
                spatial_consistency=spatial,
                detected_student_id=None,
                identity_confidence=None,
            ),
            cfg,
        )

        vr = VerificationResult(
            session_id=job.session_id,
            job_id=job.id,
            seat_id=seat.seat_id,
            assigned_student_id=outcome.assigned_student_id,
            assigned_student_name=outcome.assigned_student_name,
            detected_student_id=outcome.detected_student_id,
            status=outcome.status,
            detection_confidence=outcome.detection_confidence,
            seat_match_confidence=outcome.seat_match_confidence,
            identity_confidence=outcome.identity_confidence,
            spatial_consistency=outcome.spatial_consistency,
            overall_confidence=outcome.overall_confidence,
            explanation=outcome.explanation + f" (based on {votes}/{frames_processed} sampled frames)",
        )
        db.add(vr)
        results.append(vr)

        if representative_frame is not None:
            h, w = representative_frame.shape[:2]
            px1, py1, pw, ph = norm_to_pixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, w, h)
            bbox = best_frame_bbox.get(seat.seat_id, (px1, py1, px1 + pw, py1 + ph))
            annotations.append(
                {
                    "seat_id": seat.seat_id,
                    "bbox": bbox,
                    "status": outcome.status,
                    "assigned_student": outcome.assigned_student_name or outcome.assigned_student_id,
                    "detected_student": outcome.detected_student_id,
                    "confidence": outcome.overall_confidence,
                }
            )

    if representative_frame is not None:
        overlay = render_annotated_image(representative_frame, annotations)
        processed_dir = Path(settings.PROCESSED_DIR)
        processed_dir.mkdir(parents=True, exist_ok=True)
        overlay_path = processed_dir / f"job_{job.id}_overlay.jpg"
        cv2.imwrite(str(overlay_path), overlay)

    job.status = JobStatus.COMPLETED
    job.progress_percent = 100.0
    job.seats_analyzed = len(layout_seats)
    job.finished_at = dt.datetime.utcnow()
    db.commit()

    return results
