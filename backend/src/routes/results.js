'use strict';

const express = require('express');
const { VerificationResult } = require('../models');

const router = express.Router();

function resultOut(r) {
  return {
    id: r._id,
    session_id: r.sessionId,
    job_id: r.jobId,
    seat_id: r.seatId,
    assigned_student_id: r.assignedStudentId,
    assigned_student_name: r.assignedStudentName,
    detected_student_id: r.detectedStudentId,
    status: r.status,
    detection_confidence: r.detectionConfidence,
    seat_match_confidence: r.seatMatchConfidence,
    identity_confidence: r.identityConfidence,
    spatial_consistency: r.spatialConsistency,
    overall_confidence: r.overallConfidence,
    evidence_image_path: r.evidenceImagePath,
    explanation: r.explanation,
    created_at: r.createdAt,
  };
}

// Latest verification result per seat for this session.
router.get('/:sessionId', async (req, res, next) => {
  try {
    const results = await VerificationResult.find({ sessionId: req.params.sessionId }, { seatId: 1, createdAt: -1 });
    const latestBySeat = new Map();
    for (const r of results) {
      if (!latestBySeat.has(r.seatId)) latestBySeat.set(r.seatId, r);
    }
    const out = [...latestBySeat.values()].sort((a, b) => (a.seatId > b.seatId ? 1 : -1));
    return res.json(out.map(resultOut));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
