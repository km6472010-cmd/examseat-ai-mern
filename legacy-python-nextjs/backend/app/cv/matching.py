"""
Core algorithm: student <-> physical seat spatial matching (spec section 8).

    Detected Student
          |
    Bounding Box Center
          |
    Nearest Seat (candidate set)
          |
    Distance + IoU + Containment scoring
          |
    Greedy one-to-one Seat Assignment (do NOT assume "closest" is always right)

Every score that goes into a match is kept on the result so the eventual
verification result can show its work (spec section 11: "Do NOT hide
uncertainty").
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class NormalizedDetection:
    index: int  # position in the input detections list
    cx: float
    cy: float
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


@dataclass
class SeatBox:
    seat_id: str
    cx: float
    cy: float
    x1: float
    y1: float
    x2: float
    y2: float
    is_usable: bool = True


@dataclass
class MatchCandidate:
    detection_index: int
    seat_id: str
    distance_norm: float
    iou: float
    containment: float
    score: float


@dataclass
class SeatMatchResult:
    detection_index: int
    seat_id: str | None
    distance_norm: float = 0.0
    iou: float = 0.0
    containment: float = 0.0
    assignment_confidence: float = 0.0
    all_candidates: list[MatchCandidate] = field(default_factory=list)


def euclidean(ax: float, ay: float, bx: float, by: float) -> float:
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def compute_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
    union = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


def compute_containment(
    student_box: tuple[float, float, float, float], seat_box: tuple[float, float, float, float]
) -> float:
    """Fraction of the student's bounding box that falls inside the seat region.

    Complements IoU: a student standing/leaning can have a bbox much
    bigger than the seat region, which tanks IoU even when they are
    clearly *at* that seat. Containment captures that case.
    """
    sx1, sy1, sx2, sy2 = student_box
    tx1, ty1, tx2, ty2 = seat_box
    inter_x1, inter_y1 = max(sx1, tx1), max(sy1, ty1)
    inter_x2, inter_y2 = min(sx2, tx2), min(sy2, ty2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    student_area = max(1e-9, (sx2 - sx1) * (sy2 - sy1))
    return inter_area / student_area


@dataclass
class MatchingConfig:
    max_distance_norm: float = 0.12
    weight_distance: float = 0.45
    weight_iou: float = 0.30
    weight_containment: float = 0.25
    min_score_to_assign: float = 0.15


def score_candidate(distance_norm: float, iou: float, containment: float, cfg: MatchingConfig) -> float:
    distance_score = max(0.0, 1.0 - (distance_norm / cfg.max_distance_norm)) if cfg.max_distance_norm > 0 else 0.0
    distance_score = min(distance_score, 1.0)
    raw = (
        cfg.weight_distance * distance_score
        + cfg.weight_iou * iou
        + cfg.weight_containment * containment
    )
    return round(min(max(raw, 0.0), 1.0), 4)


def match_students_to_seats(
    detections: list[NormalizedDetection],
    seats: list[SeatBox],
    cfg: MatchingConfig | None = None,
) -> list[SeatMatchResult]:
    """One-to-one greedy assignment maximizing total match score.

    Not a full Hungarian-algorithm optimum, but a documented, deterministic
    approximation appropriate for classroom-sized seat counts: build every
    plausible (detection, seat) candidate, sort by score, and greedily
    commit the best pairs first, skipping any detection or seat that is
    already taken. This directly implements "use configurable thresholds,
    do not assume the closest seat is always correct" -- a nearer seat
    with poor containment/IoU can lose to a slightly farther seat with a
    much better score.
    """
    cfg = cfg or MatchingConfig()

    candidates: list[MatchCandidate] = []
    for det in detections:
        det_box = (det.x1, det.y1, det.x2, det.y2)
        for seat in seats:
            if not seat.is_usable:
                continue
            seat_box = (seat.x1, seat.y1, seat.x2, seat.y2)
            distance = euclidean(det.cx, det.cy, seat.cx, seat.cy)
            iou = compute_iou(det_box, seat_box)
            containment = compute_containment(det_box, seat_box)

            # Skip pairs with no plausible spatial relationship at all --
            # keeps the candidate set (and the assignment audit trail)
            # from growing quadratically with irrelevant far-away seats.
            if distance > cfg.max_distance_norm * 3 and iou == 0 and containment == 0:
                continue

            score = score_candidate(distance, iou, containment, cfg)
            candidates.append(
                MatchCandidate(
                    detection_index=det.index,
                    seat_id=seat.seat_id,
                    distance_norm=round(distance, 4),
                    iou=round(iou, 4),
                    containment=round(containment, 4),
                    score=score,
                )
            )

    candidates.sort(key=lambda c: c.score, reverse=True)

    taken_detections: set[int] = set()
    taken_seats: set[str] = set()
    results_by_detection: dict[int, SeatMatchResult] = {}

    # keep every candidate per detection for transparency (top-N shown in UI)
    candidates_by_detection: dict[int, list[MatchCandidate]] = {}
    for c in candidates:
        candidates_by_detection.setdefault(c.detection_index, []).append(c)

    for c in candidates:
        if c.detection_index in taken_detections or c.seat_id in taken_seats:
            continue
        if c.score < cfg.min_score_to_assign:
            continue
        taken_detections.add(c.detection_index)
        taken_seats.add(c.seat_id)
        results_by_detection[c.detection_index] = SeatMatchResult(
            detection_index=c.detection_index,
            seat_id=c.seat_id,
            distance_norm=c.distance_norm,
            iou=c.iou,
            containment=c.containment,
            assignment_confidence=c.score,
            all_candidates=sorted(
                candidates_by_detection.get(c.detection_index, []), key=lambda x: x.score, reverse=True
            )[:5],
        )

    # Any detection that never found a seat is still reported (e.g. an
    # invigilator standing in an aisle) with seat_id=None.
    for det in detections:
        if det.index not in results_by_detection:
            results_by_detection[det.index] = SeatMatchResult(
                detection_index=det.index,
                seat_id=None,
                all_candidates=sorted(
                    candidates_by_detection.get(det.index, []), key=lambda x: x.score, reverse=True
                )[:5],
            )

    return [results_by_detection[d.index] for d in detections]
