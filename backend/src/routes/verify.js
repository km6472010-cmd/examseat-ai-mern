'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { settings } = require('../config');
const { ExamSession, ClassroomLayout, ProcessingJob } = require('../models');
const classroomService = require('../services/classroomService');
const seatingService = require('../services/seatingService');
const { runImageVerification, runVideoVerification } = require('../services/verificationService');

const router = express.Router();

const evidenceDir = path.join(settings.UPLOADS_DIR, 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, evidenceDir),
  filename: (req, file, cb) => cb(null, file.originalname),
}) });

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

async function prereqs(sessionId, res) {
  const session = await ExamSession.findById(sessionId);
  if (!session) {
    res.status(404).json({ detail: 'Exam session not found' });
    return null;
  }
  if (!session.classroomLayoutId) {
    res.status(422).json({ detail: 'This session has no calibrated classroom layout yet. Calibrate a classroom first.' });
    return null;
  }
  const layout = await ClassroomLayout.findById(session.classroomLayoutId);
  if (!layout) {
    res.status(422).json({ detail: 'Classroom layout not found.' });
    return null;
  }
  const plan = await seatingService.getActiveSeatingPlan(sessionId);
  if (!plan) {
    res.status(422).json({ detail: 'No official seating arrangement uploaded for this session yet.' });
    return null;
  }
  const layoutSeats = classroomService.getLayoutSeats(layout);
  return { session, layout, layoutSeats, officialSeats: plan.seats };
}

router.post('/image', upload.single('file'), async (req, res, next) => {
  try {
    const sessionId = req.query.session_id || req.body.session_id;
    if (!req.file) return res.status(422).json({ detail: 'An image file is required.' });
    const ctx = await prereqs(sessionId, res);
    if (!ctx) return undefined;
    const { session, layout, layoutSeats, officialSeats } = ctx;

    await ExamSession.findByIdAndUpdate(sessionId, { status: 'processing' });
    const job = await ProcessingJob.create({ sessionId, evidenceType: 'image', evidencePath: req.file.path });

    try {
      const results = await runImageVerification(job, req.file.path, layout, layoutSeats, officialSeats);
      await ExamSession.findByIdAndUpdate(sessionId, { status: 'completed' });
      return res.json(results.map(resultOut));
    } catch (exc) {
      await ExamSession.findByIdAndUpdate(sessionId, { status: 'ready' });
      return res.status(500).json({ detail: `Verification failed: ${exc.message}` });
    }
  } catch (err) {
    return next(err);
  }
});

router.post('/video', upload.single('file'), async (req, res, next) => {
  try {
    const sessionId = req.query.session_id || req.body.session_id;
    if (!req.file) return res.status(422).json({ detail: 'A video file is required.' });
    const ctx = await prereqs(sessionId, res);
    if (!ctx) return undefined;
    const { layout, layoutSeats, officialSeats } = ctx;

    await ExamSession.findByIdAndUpdate(sessionId, { status: 'processing' });
    const job = await ProcessingJob.create({ sessionId, evidenceType: 'video', evidencePath: req.file.path });

    // Fire-and-forget background processing, mirroring the original's
    // FastAPI BackgroundTasks -- the client polls GET /api/jobs/:id.
    runVideoVerification(job, req.file.path, layout, layoutSeats, officialSeats)
      .then(() => ExamSession.findByIdAndUpdate(sessionId, { status: 'completed' }))
      .catch(() => ExamSession.findByIdAndUpdate(sessionId, { status: 'ready' }));

    return res.json(jobOut(job));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
