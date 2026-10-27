from app.verification.engine import SeatVerificationInput, VerificationConfig, classify_seat

CFG = VerificationConfig()


def test_correct_seat_with_identity_match():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="A01", assigned_student_id="STU001", assigned_student_name="Student 1",
            detection_confidence=0.9, seat_match_confidence=0.9, spatial_consistency=0.9,
            detected_student_id="STU001", identity_confidence=0.9,
        ),
        CFG,
    )
    assert r.status == "CORRECT"
    assert r.overall_confidence > CFG.review_threshold


def test_correct_seat_without_identity_is_still_correct_but_says_unverified():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="A04", assigned_student_id="STU004", assigned_student_name="Student 4",
            detection_confidence=0.9, seat_match_confidence=0.9, spatial_consistency=0.9,
        ),
        CFG,
    )
    assert r.status == "CORRECT"
    assert "identity could not be verified" in r.explanation
    assert r.detected_student_id is None  # never hallucinate an identity


def test_wrong_seat_detected():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="A03", assigned_student_id="STU003", assigned_student_name="Student 3",
            detection_confidence=0.9, seat_match_confidence=0.9, spatial_consistency=0.9,
            detected_student_id="STU008", identity_confidence=0.9,
        ),
        CFG,
    )
    assert r.status == "WRONG_SEAT"


def test_empty_seat():
    r = classify_seat(
        SeatVerificationInput(seat_id="A02", assigned_student_id="STU002", assigned_student_name="Student 2"),
        CFG,
    )
    assert r.status == "EMPTY"
    assert r.overall_confidence > 0.5


def test_empty_seat_with_conflict_lowers_confidence_and_can_flip_to_review():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="B04", assigned_student_id="STU014", assigned_student_name="Student 14",
            conflicting_candidate_score=0.6,
        ),
        CFG,
    )
    assert r.status == "NEEDS_REVIEW"
    assert r.overall_confidence < CFG.review_threshold


def test_unassigned_occupancy():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="B05", assigned_student_id=None,
            detection_confidence=0.9, seat_match_confidence=0.9, spatial_consistency=0.9,
        ),
        CFG,
    )
    assert r.status == "UNASSIGNED"


def test_low_confidence_forces_needs_review_even_when_occupied_and_assigned():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="C03", assigned_student_id="STU014", assigned_student_name="Student 14",
            detection_confidence=0.42, seat_match_confidence=0.35, spatial_consistency=0.3,
        ),
        CFG,
    )
    assert r.status == "NEEDS_REVIEW"


def test_low_confidence_unassigned_occupancy_also_needs_review():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="D01", assigned_student_id=None,
            detection_confidence=0.3, seat_match_confidence=0.3, spatial_consistency=0.3,
        ),
        CFG,
    )
    assert r.status == "NEEDS_REVIEW"


def test_unoccupied_unassigned_seat_is_uninteresting_empty():
    r = classify_seat(SeatVerificationInput(seat_id="Z99", assigned_student_id=None), CFG)
    assert r.status == "EMPTY"
    assert r.overall_confidence == 1.0


def test_confidence_is_bounded_between_zero_and_one():
    r = classify_seat(
        SeatVerificationInput(
            seat_id="A01", assigned_student_id="STU001", assigned_student_name="Student 1",
            detection_confidence=1.5, seat_match_confidence=1.5, spatial_consistency=1.5,
            detected_student_id="STU001", identity_confidence=1.5,
        ),
        CFG,
    )
    assert 0.0 <= r.overall_confidence <= 1.0
