'use strict';

const express = require('express');
const { VerificationResult, HumanReview } = require('../models');

const router = express.Router();

const DECISION_TO_STATUS = {
  confirm: null, // keeps the AI's own status, just marks it human-confirmed
  reject: 'NEEDS_REVIEW',
  mark_empty: 'EMPTY',
};

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

function reviewOut(r) {
  return {
    id: r._id,
    verification_result_id: r.verificationResultId,
    reviewer: r.reviewer,
    decision: r.decision,
    notes: r.notes,
    decided_at: r.decidedAt,
  };
}

// Every NEEDS_REVIEW case for this session that has not yet been reviewed.
router.get('/reviews/:sessionId', async (req, res, next) => {
  try {
    const allReviews = await HumanReview.find({});
    const results = await VerificationResult.find(
      { sessionId: req.params.sessionId, status: 'NEEDS_REVIEW' },
      { overallConfidence: 1 }
    );
    const reviewedIds = new Set(
      allReviews
        .filter((rv) => results.some((r) => r._id === rv.verificationResultId))
        .map((rv) => rv.verificationResultId)
    );
    const out = results.filter((r) => !reviewedIds.has(r._id));
    return res.json(out.map(resultOut));
  } catch (err) {
    return next(err);
  }
});

async function recordReview(req, res, decision) {
  const vr = await VerificationResult.findById(req.params.verificationResultId);
  if (!vr) {
    res.status(404).json({ detail: 'Verification result not found' });
    return;
  }
  const existing = await HumanReview.findOne({ verificationResultId: vr._id });
  if (existing) {
    res.status(409).json({ detail: 'This case has already been reviewed.' });
    return;
  }

  const review = await HumanReview.create({
    verificationResultId: vr._id,
    reviewer: req.body.reviewer || 'invigilator',
    decision,
    notes: req.body.notes || null,
    decidedAt: new Date().toISOString(),
  });

  const newStatus = DECISION_TO_STATUS[decision];
  if (newStatus !== null) {
    await VerificationResult.findByIdAndUpdate(vr._id, {
      status: newStatus,
      explanation: `${vr.explanation || ''} [Human review: ${decision}]`,
    });
  } else {
    await VerificationResult.findByIdAndUpdate(vr._id, { explanation: `${vr.explanation || ''} [Human-confirmed]` });
  }

  res.json(reviewOut(review));
}

router.post('/reviews/:verificationResultId/confirm', (req, res, next) => recordReview(req, res, 'confirm').catch(next));
router.post('/reviews/:verificationResultId/reject', (req, res, next) => recordReview(req, res, 'reject').catch(next));
router.post('/reviews/:verificationResultId/mark-empty', (req, res, next) => recordReview(req, res, 'mark_empty').catch(next));

module.exports = router;
