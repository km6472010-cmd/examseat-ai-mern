'use strict';

const express = require('express');
const { generateDemoBundle } = require('../services/demoService');
const { VerificationResult } = require('../models');
const { computeSummary } = require('../services/reportService');

const router = express.Router();

// One-click Run Demo, no configuration required.
router.post('/run', async (req, res, next) => {
  try {
    const session = await generateDemoBundle();
    const results = await VerificationResult.find({ sessionId: session._id });
    const summary = computeSummary(session, results);
    return res.json({
      id: session._id,
      exam_name: session.examName,
      room: session.room,
      exam_date: session.examDate,
      status: 'completed',
      seat_count: session.seatCount,
      is_demo: true,
      classroom_layout_id: session.classroomLayoutId,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      total_seats: summary.total_seats,
      occupied: summary.occupied,
      empty: summary.empty,
      correct: summary.correct,
      wrong_seat: summary.wrong_seat,
      unassigned: summary.unassigned,
      needs_review: summary.needs_review,
      accuracy_pct: summary.accuracy_pct,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
