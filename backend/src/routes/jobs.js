'use strict';

const express = require('express');
const { ProcessingJob } = require('../models');

const router = express.Router();

function jobOut(job) {
  return {
    id: job._id,
    session_id: job.sessionId,
    evidence_type: job.evidenceType,
    status: job.status,
    progress_percent: job.progressPercent,
    frames_total: job.framesTotal,
    frames_processed: job.framesProcessed,
    students_detected: job.studentsDetected,
    seats_analyzed: job.seatsAnalyzed,
    error_message: job.errorMessage,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    created_at: job.createdAt,
  };
}

router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const jobs = await ProcessingJob.find({ sessionId: req.params.sessionId }, { createdAt: -1 });
    return res.json(jobs.map(jobOut));
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const job = await ProcessingJob.findById(req.params.id);
    if (!job) return res.status(404).json({ detail: 'Processing job not found' });
    return res.json(jobOut(job));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
