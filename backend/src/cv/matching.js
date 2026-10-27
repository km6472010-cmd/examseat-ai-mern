/**
 * Core algorithm: student <-> physical seat spatial matching.
 *
 * Direct, faithful port of the original backend/app/cv/matching.py --
 * same weights, same thresholds, same rounding, same greedy one-to-one
 * assignment strategy. See that file's docstring for the full design
 * rationale; it applies unchanged here.
 */
'use strict';

function euclidean(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function computeIou(a, b) {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
  const interW = Math.max(0.0, interX2 - interX1);
  const interH = Math.max(0.0, interY2 - interY1);
  const interArea = interW * interH;
  const areaA = Math.max(0.0, ax2 - ax1) * Math.max(0.0, ay2 - ay1);
  const areaB = Math.max(0.0, bx2 - bx1) * Math.max(0.0, by2 - by1);
  const union = areaA + areaB - interArea;
  return union > 0 ? interArea / union : 0.0;
}

/**
 * Fraction of the student's bounding box that falls inside the seat region.
 * Complements IoU: a student standing/leaning can have a bbox much bigger
 * than the seat region, which tanks IoU even when they are clearly *at*
 * that seat. Containment captures that case.
 */
function computeContainment(studentBox, seatBox) {
  const [sx1, sy1, sx2, sy2] = studentBox;
  const [tx1, ty1, tx2, ty2] = seatBox;
  const interX1 = Math.max(sx1, tx1);
  const interY1 = Math.max(sy1, ty1);
  const interX2 = Math.min(sx2, tx2);
  const interY2 = Math.min(sy2, ty2);
  const interW = Math.max(0.0, interX2 - interX1);
  const interH = Math.max(0.0, interY2 - interY1);
  const interArea = interW * interH;
  const studentArea = Math.max(1e-9, (sx2 - sx1) * (sy2 - sy1));
  return interArea / studentArea;
}

const DEFAULT_MATCHING_CONFIG = {
  maxDistanceNorm: 0.12,
  weightDistance: 0.45,
  weightIou: 0.3,
  weightContainment: 0.25,
  minScoreToAssign: 0.15,
};

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

function scoreCandidate(distanceNorm, iou, containment, cfg) {
  let distanceScore =
    cfg.maxDistanceNorm > 0 ? Math.max(0.0, 1.0 - distanceNorm / cfg.maxDistanceNorm) : 0.0;
  distanceScore = Math.min(distanceScore, 1.0);
  const raw = cfg.weightDistance * distanceScore + cfg.weightIou * iou + cfg.weightContainment * containment;
  return round4(Math.min(Math.max(raw, 0.0), 1.0));
}

/**
 * One-to-one greedy assignment maximizing total match score.
 *
 * Not a full Hungarian-algorithm optimum, but a documented, deterministic
 * approximation appropriate for classroom-sized seat counts: build every
 * plausible (detection, seat) candidate, sort by score, and greedily
 * commit the best pairs first, skipping any detection or seat that is
 * already taken. A nearer seat with poor containment/IoU can lose to a
 * slightly farther seat with a much better score -- the algorithm never
 * assumes "closest" is automatically correct.
 *
 * @param {Array} detections - [{index, cx, cy, x1, y1, x2, y2, confidence}]
 * @param {Array} seats - [{seatId, cx, cy, x1, y1, x2, y2, isUsable}]
 * @param {Object} [cfg]
 * @returns {Array} one SeatMatchResult per input detection
 */
function matchStudentsToSeats(detections, seats, cfg) {
  cfg = { ...DEFAULT_MATCHING_CONFIG, ...(cfg || {}) };

  const candidates = [];
  for (const det of detections) {
    const detBox = [det.x1, det.y1, det.x2, det.y2];
    for (const seat of seats) {
      if (seat.isUsable === false) continue;
      const seatBox = [seat.x1, seat.y1, seat.x2, seat.y2];
      const distance = euclidean(det.cx, det.cy, seat.cx, seat.cy);
      const iou = computeIou(detBox, seatBox);
      const containment = computeContainment(detBox, seatBox);

      if (distance > cfg.maxDistanceNorm * 3 && iou === 0 && containment === 0) {
        continue;
      }

      const score = scoreCandidate(distance, iou, containment, cfg);
      candidates.push({
        detectionIndex: det.index,
        seatId: seat.seatId,
        distanceNorm: round4(distance),
        iou: round4(iou),
        containment: round4(containment),
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const takenDetections = new Set();
  const takenSeats = new Set();
  const resultsByDetection = new Map();

  const candidatesByDetection = new Map();
  for (const c of candidates) {
    if (!candidatesByDetection.has(c.detectionIndex)) candidatesByDetection.set(c.detectionIndex, []);
    candidatesByDetection.get(c.detectionIndex).push(c);
  }
  const top5 = (idx) =>
    (candidatesByDetection.get(idx) || []).slice().sort((a, b) => b.score - a.score).slice(0, 5);

  for (const c of candidates) {
    if (takenDetections.has(c.detectionIndex) || takenSeats.has(c.seatId)) continue;
    if (c.score < cfg.minScoreToAssign) continue;
    takenDetections.add(c.detectionIndex);
    takenSeats.add(c.seatId);
    resultsByDetection.set(c.detectionIndex, {
      detectionIndex: c.detectionIndex,
      seatId: c.seatId,
      distanceNorm: c.distanceNorm,
      iou: c.iou,
      containment: c.containment,
      assignmentConfidence: c.score,
      allCandidates: top5(c.detectionIndex),
    });
  }

  for (const det of detections) {
    if (!resultsByDetection.has(det.index)) {
      resultsByDetection.set(det.index, {
        detectionIndex: det.index,
        seatId: null,
        distanceNorm: 0.0,
        iou: 0.0,
        containment: 0.0,
        assignmentConfidence: 0.0,
        allCandidates: top5(det.index),
      });
    }
  }

  return detections.map((d) => resultsByDetection.get(d.index));
}

module.exports = {
  euclidean,
  computeIou,
  computeContainment,
  scoreCandidate,
  matchStudentsToSeats,
  DEFAULT_MATCHING_CONFIG,
};
