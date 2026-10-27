"""
The comparison / verification engine (spec sections 10 & 11).

This is deliberately pure, dependency-free logic (no DB, no OpenCV) so it
is trivially unit-testable: given the official assignment for a seat and
whatever the CV pipeline could determine about it, decide one of

    CORRECT | EMPTY | WRONG_SEAT | UNASSIGNED | NEEDS_REVIEW

and compute a transparent, explainable overall confidence score. Low
confidence always wins over a "confident-looking" status -- the engine
never lets a shaky signal produce an unqualified accusation (spec
section 33: "the system must say Needs Human Verification rather than
making an unsupported decision").
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class VerificationConfig:
    review_threshold: float = 0.60
    high_threshold: float = 0.80
    # Weights used when an identity match IS available (Mode 2).
    w_detection_with_identity: float = 0.25
    w_seat_match_with_identity: float = 0.25
    w_identity: float = 0.30
    w_spatial_with_identity: float = 0.20
    # Weights used when identity is unavailable (Mode 1, the default) --
    # redistributed across the signals we actually have rather than
    # penalizing every seat for a factor that was never attempted.
    w_detection_no_identity: float = 0.40
    w_seat_match_no_identity: float = 0.35
    w_spatial_no_identity: float = 0.25


@dataclass
class SeatVerificationInput:
    seat_id: str
    assigned_student_id: str | None
    assigned_student_name: str | None = None
    is_usable: bool = True

    # Set only if a person detection was spatially matched to this seat.
    detection_confidence: float | None = None
    seat_match_confidence: float | None = None
    spatial_consistency: float | None = None

    # Set only if identity matching (Mode 2) ran and found a match above
    # its own threshold. None means "identity could not be verified" --
    # never fabricate an identity here.
    detected_student_id: str | None = None
    identity_confidence: float | None = None

    # Set when an empty seat had a losing candidate detection nearby
    # (assignment conflict) -- surfaces an edge case for human review
    # instead of silently reporting a confident EMPTY.
    conflicting_candidate_score: float | None = None


@dataclass
class VerificationOutcome:
    seat_id: str
    status: str
    detection_confidence: float
    seat_match_confidence: float
    identity_confidence: float
    spatial_consistency: float
    overall_confidence: float
    explanation: str
    assigned_student_id: str | None
    assigned_student_name: str | None
    detected_student_id: str | None


def compute_overall_confidence(
    detection_confidence: float,
    seat_match_confidence: float,
    identity_confidence: float | None,
    spatial_consistency: float,
    cfg: VerificationConfig,
) -> float:
    if identity_confidence is not None:
        score = (
            cfg.w_detection_with_identity * detection_confidence
            + cfg.w_seat_match_with_identity * seat_match_confidence
            + cfg.w_identity * identity_confidence
            + cfg.w_spatial_with_identity * spatial_consistency
        )
    else:
        score = (
            cfg.w_detection_no_identity * detection_confidence
            + cfg.w_seat_match_no_identity * seat_match_confidence
            + cfg.w_spatial_no_identity * spatial_consistency
        )
    return round(min(max(score, 0.0), 1.0), 4)


def classify_seat(inp: SeatVerificationInput, cfg: VerificationConfig | None = None) -> VerificationOutcome:
    cfg = cfg or VerificationConfig()
    occupied = inp.seat_match_confidence is not None

    detection_confidence = inp.detection_confidence or 0.0
    seat_match_confidence = inp.seat_match_confidence or 0.0
    spatial_consistency = inp.spatial_consistency if inp.spatial_consistency is not None else 0.5

    # ---- EMPTY (officially assigned, nobody detected there) -----------
    if inp.assigned_student_id is not None and not occupied:
        if inp.conflicting_candidate_score is not None and inp.conflicting_candidate_score >= 0.15:
            overall = round(1.0 - inp.conflicting_candidate_score, 4)
            status = "NEEDS_REVIEW" if overall < cfg.review_threshold else "EMPTY"
            explanation = (
                f"Seat {inp.seat_id} looks empty, but a detected student scored "
                f"{inp.conflicting_candidate_score:.0%} for this seat and lost it to a competing "
                "assignment -- please double-check."
            )
            return VerificationOutcome(
                seat_id=inp.seat_id,
                status=status,
                detection_confidence=0.0,
                seat_match_confidence=0.0,
                identity_confidence=0.0,
                spatial_consistency=1.0 - inp.conflicting_candidate_score,
                overall_confidence=overall,
                explanation=explanation,
                assigned_student_id=inp.assigned_student_id,
                assigned_student_name=inp.assigned_student_name,
                detected_student_id=None,
            )
        overall = 0.92
        return VerificationOutcome(
            seat_id=inp.seat_id,
            status="EMPTY",
            detection_confidence=0.0,
            seat_match_confidence=0.0,
            identity_confidence=0.0,
            spatial_consistency=1.0,
            overall_confidence=overall,
            explanation=(
                f"Seat {inp.seat_id} is assigned to "
                f"{inp.assigned_student_name or inp.assigned_student_id}, but no student was detected there."
            ),
            assigned_student_id=inp.assigned_student_id,
            assigned_student_name=inp.assigned_student_name,
            detected_student_id=None,
        )

    # ---- Not occupied and not officially assigned: nothing to report --
    if inp.assigned_student_id is None and not occupied:
        overall = 1.0
        return VerificationOutcome(
            seat_id=inp.seat_id,
            status="EMPTY",
            detection_confidence=0.0,
            seat_match_confidence=0.0,
            identity_confidence=0.0,
            spatial_consistency=1.0,
            overall_confidence=overall,
            explanation=f"Seat {inp.seat_id} has no official assignment and is unoccupied.",
            assigned_student_id=None,
            assigned_student_name=None,
            detected_student_id=None,
        )

    overall = compute_overall_confidence(
        detection_confidence, seat_match_confidence, inp.identity_confidence, spatial_consistency, cfg
    )

    # ---- UNASSIGNED OCCUPANCY ------------------------------------------
    if inp.assigned_student_id is None and occupied:
        status = "NEEDS_REVIEW" if overall < cfg.review_threshold else "UNASSIGNED"
        explanation = (
            f"A student was detected in seat {inp.seat_id}, which has no official seating assignment."
        )
        return VerificationOutcome(
            seat_id=inp.seat_id,
            status=status,
            detection_confidence=round(detection_confidence, 4),
            seat_match_confidence=round(seat_match_confidence, 4),
            identity_confidence=round(inp.identity_confidence or 0.0, 4),
            spatial_consistency=round(spatial_consistency, 4),
            overall_confidence=overall,
            explanation=explanation,
            assigned_student_id=None,
            assigned_student_name=None,
            detected_student_id=inp.detected_student_id,
        )

    # ---- Occupied + officially assigned --------------------------------
    if inp.identity_confidence is not None and inp.detected_student_id is not None:
        if inp.detected_student_id == inp.assigned_student_id:
            status = "CORRECT"
            explanation = (
                f"{inp.detected_student_id} was identified in their assigned seat {inp.seat_id}."
            )
        else:
            status = "WRONG_SEAT"
            explanation = (
                f"Seat {inp.seat_id} is assigned to {inp.assigned_student_name or inp.assigned_student_id}, "
                f"but {inp.detected_student_id} appears to be sitting there instead."
            )
    else:
        # Mode 1: identity unavailable. We only know *someone* is present.
        status = "CORRECT"
        explanation = (
            f"A student was detected in seat {inp.seat_id} (assigned to "
            f"{inp.assigned_student_name or inp.assigned_student_id}), but identity could not be verified."
        )

    if overall < cfg.review_threshold:
        status = "NEEDS_REVIEW"
        explanation += " Confidence is below the review threshold -- please verify manually."

    return VerificationOutcome(
        seat_id=inp.seat_id,
        status=status,
        detection_confidence=round(detection_confidence, 4),
        seat_match_confidence=round(seat_match_confidence, 4),
        identity_confidence=round(inp.identity_confidence or 0.0, 4),
        spatial_consistency=round(spatial_consistency, 4),
        overall_confidence=overall,
        explanation=explanation,
        assigned_student_id=inp.assigned_student_id,
        assigned_student_name=inp.assigned_student_name,
        detected_student_id=inp.detected_student_id,
    )
