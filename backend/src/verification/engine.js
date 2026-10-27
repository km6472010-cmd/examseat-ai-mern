/**
 * The comparison / verification engine.
 *
 * Direct, faithful port of the original backend/app/verification/engine.py.
 * Deliberately pure, dependency-free logic (no DB, no CV) so it stays
 * trivially unit-testable: given the official assignment for a seat and
 * whatever the CV pipeline could determine about it, decide one of
 *
 *   CORRECT | EMPTY | WRONG_SEAT | UNASSIGNED | NEEDS_REVIEW
 *
 * and compute a transparent, explainable overall confidence score. Low
 * confidence always wins over a "confident-looking" status -- the engine
 * never lets a shaky signal produce an unqualified accusation.
 */
'use strict';

const DEFAULT_VERIFICATION_CONFIG = {
  reviewThreshold: 0.6,
  highThreshold: 0.8,
  // Weights used when an identity match IS available (Mode 2).
  wDetectionWithIdentity: 0.25,
  wSeatMatchWithIdentity: 0.25,
  wIdentity: 0.3,
  wSpatialWithIdentity: 0.2,
  // Weights used when identity is unavailable (Mode 1, the default) --
  // redistributed across the signals we actually have rather than
  // penalizing every seat for a factor that was never attempted.
  wDetectionNoIdentity: 0.4,
  wSeatMatchNoIdentity: 0.35,
  wSpatialNoIdentity: 0.25,
};

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

function computeOverallConfidence(detectionConfidence, seatMatchConfidence, identityConfidence, spatialConsistency, cfg) {
  let score;
  if (identityConfidence !== null && identityConfidence !== undefined) {
    score =
      cfg.wDetectionWithIdentity * detectionConfidence +
      cfg.wSeatMatchWithIdentity * seatMatchConfidence +
      cfg.wIdentity * identityConfidence +
      cfg.wSpatialWithIdentity * spatialConsistency;
  } else {
    score =
      cfg.wDetectionNoIdentity * detectionConfidence +
      cfg.wSeatMatchNoIdentity * seatMatchConfidence +
      cfg.wSpatialNoIdentity * spatialConsistency;
  }
  return round4(Math.min(Math.max(score, 0.0), 1.0));
}

/**
 * @param {Object} inp SeatVerificationInput -- see field list below.
 *   seatId, assignedStudentId, assignedStudentName, isUsable,
 *   detectionConfidence, seatMatchConfidence, spatialConsistency,
 *   detectedStudentId, identityConfidence, conflictingCandidateScore
 * @param {Object} [cfg]
 * @returns {Object} VerificationOutcome
 */
function classifySeat(inp, cfg) {
  cfg = { ...DEFAULT_VERIFICATION_CONFIG, ...(cfg || {}) };
  const occupied = inp.seatMatchConfidence !== null && inp.seatMatchConfidence !== undefined;

  const detectionConfidence = inp.detectionConfidence || 0.0;
  const seatMatchConfidence = inp.seatMatchConfidence || 0.0;
  const spatialConsistency =
    inp.spatialConsistency !== null && inp.spatialConsistency !== undefined ? inp.spatialConsistency : 0.5;

  // ---- EMPTY (officially assigned, nobody detected there) -------------
  if (inp.assignedStudentId !== null && inp.assignedStudentId !== undefined && !occupied) {
    if (inp.conflictingCandidateScore !== null && inp.conflictingCandidateScore !== undefined && inp.conflictingCandidateScore >= 0.15) {
      const overall = round4(1.0 - inp.conflictingCandidateScore);
      const status = overall < cfg.reviewThreshold ? 'NEEDS_REVIEW' : 'EMPTY';
      const explanation =
        `Seat ${inp.seatId} looks empty, but a detected student scored ` +
        `${Math.round(inp.conflictingCandidateScore * 100)}% for this seat and lost it to a competing ` +
        'assignment -- please double-check.';
      return {
        seatId: inp.seatId,
        status,
        detectionConfidence: 0.0,
        seatMatchConfidence: 0.0,
        identityConfidence: 0.0,
        spatialConsistency: round4(1.0 - inp.conflictingCandidateScore),
        overallConfidence: overall,
        explanation,
        assignedStudentId: inp.assignedStudentId,
        assignedStudentName: inp.assignedStudentName,
        detectedStudentId: null,
      };
    }
    return {
      seatId: inp.seatId,
      status: 'EMPTY',
      detectionConfidence: 0.0,
      seatMatchConfidence: 0.0,
      identityConfidence: 0.0,
      spatialConsistency: 1.0,
      overallConfidence: 0.92,
      explanation: `Seat ${inp.seatId} is assigned to ${inp.assignedStudentName || inp.assignedStudentId}, but no student was detected there.`,
      assignedStudentId: inp.assignedStudentId,
      assignedStudentName: inp.assignedStudentName,
      detectedStudentId: null,
    };
  }

  // ---- Not occupied and not officially assigned: nothing to report ----
  if ((inp.assignedStudentId === null || inp.assignedStudentId === undefined) && !occupied) {
    return {
      seatId: inp.seatId,
      status: 'EMPTY',
      detectionConfidence: 0.0,
      seatMatchConfidence: 0.0,
      identityConfidence: 0.0,
      spatialConsistency: 1.0,
      overallConfidence: 1.0,
      explanation: `Seat ${inp.seatId} has no official assignment and is unoccupied.`,
      assignedStudentId: null,
      assignedStudentName: null,
      detectedStudentId: null,
    };
  }

  const overall = computeOverallConfidence(detectionConfidence, seatMatchConfidence, inp.identityConfidence, spatialConsistency, cfg);

  // ---- UNASSIGNED OCCUPANCY --------------------------------------------
  if ((inp.assignedStudentId === null || inp.assignedStudentId === undefined) && occupied) {
    const status = overall < cfg.reviewThreshold ? 'NEEDS_REVIEW' : 'UNASSIGNED';
    return {
      seatId: inp.seatId,
      status,
      detectionConfidence: round4(detectionConfidence),
      seatMatchConfidence: round4(seatMatchConfidence),
      identityConfidence: round4(inp.identityConfidence || 0.0),
      spatialConsistency: round4(spatialConsistency),
      overallConfidence: overall,
      explanation: `A student was detected in seat ${inp.seatId}, which has no official seating assignment.`,
      assignedStudentId: null,
      assignedStudentName: null,
      detectedStudentId: inp.detectedStudentId || null,
    };
  }

  // ---- Occupied + officially assigned -----------------------------------
  let status;
  let explanation;
  if (inp.identityConfidence !== null && inp.identityConfidence !== undefined && inp.detectedStudentId) {
    if (inp.detectedStudentId === inp.assignedStudentId) {
      status = 'CORRECT';
      explanation = `${inp.detectedStudentId} was identified in their assigned seat ${inp.seatId}.`;
    } else {
      status = 'WRONG_SEAT';
      explanation =
        `Seat ${inp.seatId} is assigned to ${inp.assignedStudentName || inp.assignedStudentId}, ` +
        `but ${inp.detectedStudentId} appears to be sitting there instead.`;
    }
  } else {
    // Mode 1: identity unavailable. We only know *someone* is present.
    status = 'CORRECT';
    explanation = `A student was detected in seat ${inp.seatId} (assigned to ${inp.assignedStudentName || inp.assignedStudentId}), but identity could not be verified.`;
  }

  if (overall < cfg.reviewThreshold) {
    status = 'NEEDS_REVIEW';
    explanation += ' Confidence is below the review threshold -- please verify manually.';
  }

  return {
    seatId: inp.seatId,
    status,
    detectionConfidence: round4(detectionConfidence),
    seatMatchConfidence: round4(seatMatchConfidence),
    identityConfidence: round4(inp.identityConfidence || 0.0),
    spatialConsistency: round4(spatialConsistency),
    overallConfidence: overall,
    explanation,
    assignedStudentId: inp.assignedStudentId,
    assignedStudentName: inp.assignedStudentName,
    detectedStudentId: inp.detectedStudentId || null,
  };
}

module.exports = { classifySeat, computeOverallConfidence, DEFAULT_VERIFICATION_CONFIG };
