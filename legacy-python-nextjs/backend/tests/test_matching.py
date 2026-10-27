import pytest

from app.cv.matching import (
    MatchingConfig,
    NormalizedDetection,
    SeatBox,
    compute_containment,
    compute_iou,
    euclidean,
    match_students_to_seats,
    score_candidate,
)


def test_euclidean_distance():
    assert euclidean(0, 0, 3, 4) == 5.0
    assert euclidean(0.1, 0.1, 0.1, 0.1) == 0.0


def test_iou_full_overlap_is_one():
    box = (0.0, 0.0, 0.2, 0.2)
    assert compute_iou(box, box) == 1.0


def test_iou_no_overlap_is_zero():
    a = (0.0, 0.0, 0.1, 0.1)
    b = (0.5, 0.5, 0.6, 0.6)
    assert compute_iou(a, b) == 0.0


def test_iou_partial_overlap():
    a = (0.0, 0.0, 0.2, 0.2)
    b = (0.1, 0.1, 0.3, 0.3)
    iou = compute_iou(a, b)
    assert 0.0 < iou < 1.0


def test_containment_student_bigger_than_seat():
    # student bbox fully contains a small seat box centered inside it
    student = (0.0, 0.0, 1.0, 1.0)
    seat = (0.4, 0.4, 0.6, 0.6)
    containment = compute_containment(student, seat)
    # only 4% of the (huge) student box overlaps the seat -> low containment
    assert containment == pytest.approx(0.04)


def test_score_candidate_prefers_closer_and_higher_iou():
    cfg = MatchingConfig()
    close_high_iou = score_candidate(distance_norm=0.01, iou=0.8, containment=0.8, cfg=cfg)
    far_low_iou = score_candidate(distance_norm=0.3, iou=0.0, containment=0.0, cfg=cfg)
    assert close_high_iou > far_low_iou


def test_match_assigns_nearest_seat():
    seats = [
        SeatBox(seat_id="A01", cx=0.1, cy=0.1, x1=0.05, y1=0.05, x2=0.15, y2=0.15),
        SeatBox(seat_id="A02", cx=0.5, cy=0.1, x1=0.45, y1=0.05, x2=0.55, y2=0.15),
    ]
    dets = [
        NormalizedDetection(index=0, cx=0.11, cy=0.11, x1=0.06, y1=0.06, x2=0.16, y2=0.16, confidence=0.9),
    ]
    results = match_students_to_seats(dets, seats, MatchingConfig())
    assert results[0].seat_id == "A01"
    assert results[0].assignment_confidence > 0.5


def test_match_leaves_far_detection_unassigned():
    seats = [SeatBox(seat_id="A01", cx=0.1, cy=0.1, x1=0.05, y1=0.05, x2=0.15, y2=0.15)]
    dets = [NormalizedDetection(index=0, cx=0.9, cy=0.9, x1=0.85, y1=0.85, x2=0.95, y2=0.95, confidence=0.9)]
    results = match_students_to_seats(dets, seats, MatchingConfig())
    assert results[0].seat_id is None


def test_match_is_one_to_one():
    """Two detections both near the same seat -> only one gets it."""
    seats = [SeatBox(seat_id="A01", cx=0.1, cy=0.1, x1=0.05, y1=0.05, x2=0.15, y2=0.15)]
    dets = [
        NormalizedDetection(index=0, cx=0.10, cy=0.10, x1=0.05, y1=0.05, x2=0.15, y2=0.15, confidence=0.95),
        NormalizedDetection(index=1, cx=0.11, cy=0.11, x1=0.06, y1=0.06, x2=0.16, y2=0.16, confidence=0.80),
    ]
    results = match_students_to_seats(dets, seats, MatchingConfig())
    assigned = [r for r in results if r.seat_id == "A01"]
    assert len(assigned) == 1
    # the better-scoring (closer/more confident) detection should win
    assert assigned[0].detection_index == 0


def test_unusable_seat_is_never_assigned():
    seats = [SeatBox(seat_id="A01", cx=0.1, cy=0.1, x1=0.05, y1=0.05, x2=0.15, y2=0.15, is_usable=False)]
    dets = [NormalizedDetection(index=0, cx=0.10, cy=0.10, x1=0.05, y1=0.05, x2=0.15, y2=0.15, confidence=0.95)]
    results = match_students_to_seats(dets, seats, MatchingConfig())
    assert results[0].seat_id is None
