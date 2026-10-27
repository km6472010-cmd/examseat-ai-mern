'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { settings } = require('../config');
const { ExamSession, SeatingPlan } = require('../models');
const { parseSeatingCsv, CsvValidationError } = require('../services/csvService');
const seatingService = require('../services/seatingService');
const { extractSeatingTable } = require('../services/ocrService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function getSessionOr404(sessionId, res) {
  const session = await ExamSession.findById(sessionId);
  if (!session) {
    res.status(404).json({ detail: 'Exam session not found' });
    return null;
  }
  return session;
}

function seatOut(seat) {
  return {
    id: seat._id,
    seat_id: seat.seatId,
    row: seat.row,
    column: seat.column,
    is_usable: seat.isUsable,
    assigned_student_id: seat.assignedStudentId,
    assigned_student_name: seat.assignedStudentName,
  };
}

function planOut(plan) {
  return {
    id: plan._id,
    session_id: plan.sessionId,
    source: plan.source,
    is_active: plan.isActive,
    raw_filename: plan.rawFilename,
    created_at: plan.createdAt,
    seats: (plan.seats || []).map(seatOut),
  };
}

// Option A: CSV upload -----------------------------------------------------
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const sessionId = req.body.session_id;
    if (!(await getSessionOr404(sessionId, res))) return undefined;
    if (!req.file) return res.status(422).json({ detail: 'A CSV file is required.' });

    let parsed;
    try {
      parsed = parseSeatingCsv(req.file.buffer);
    } catch (exc) {
      if (exc instanceof CsvValidationError) return res.status(422).json({ detail: exc.message });
      throw exc;
    }

    const plan = await seatingService.createSeatingPlan(sessionId, parsed.rows, 'csv', req.file.originalname);
    return res.json({
      seating_plan: planOut(plan),
      warnings: parsed.warnings,
      rows_parsed: parsed.rowsParsed,
      rows_skipped: parsed.rowsSkipped,
    });
  } catch (err) {
    return next(err);
  }
});

// Option B: manual seating-plan editor --------------------------------------
router.post('/manual', async (req, res, next) => {
  try {
    const sessionId = req.query.session_id || req.body.session_id;
    if (!(await getSessionOr404(sessionId, res))) return undefined;
    const seats = req.body.seats || [];
    if (!seats.length) return res.status(422).json({ detail: 'At least one seat is required.' });
    const rows = seats.map((s) => ({ seatId: s.seat_id, row: s.row, column: s.column, studentId: s.student_id, studentName: s.student_name }));
    const plan = await seatingService.createSeatingPlan(sessionId, rows, 'manual');
    return res.json(planOut(plan));
  } catch (err) {
    return next(err);
  }
});

// Option C: OCR extraction ---------------------------------------------------
router.post('/ocr/extract', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ detail: 'An image file is required.' });
    const uploadDir = path.join(settings.UPLOADS_DIR, 'ocr');
    fs.mkdirSync(uploadDir, { recursive: true });
    const dest = path.join(uploadDir, req.file.originalname);
    fs.writeFileSync(dest, req.file.buffer);

    const result = await extractSeatingTable(dest);
    return res.json({ rows: result.rows, warnings: result.warnings, raw_text: result.rawText });
  } catch (err) {
    return next(err);
  }
});

router.post('/ocr/confirm', async (req, res, next) => {
  try {
    const sessionId = req.query.session_id || req.body.session_id;
    if (!(await getSessionOr404(sessionId, res))) return undefined;
    const seats = req.body.seats || [];
    const rows = seats.map((s) => ({ seatId: s.seat_id, row: s.row, column: s.column, studentId: s.student_id, studentName: s.student_name }));
    const plan = await seatingService.createSeatingPlan(sessionId, rows, 'ocr');
    return res.json(planOut(plan));
  } catch (err) {
    return next(err);
  }
});

router.get('/:sessionId', async (req, res, next) => {
  try {
    const plan = await seatingService.getActiveSeatingPlan(req.params.sessionId);
    if (!plan) return res.status(404).json({ detail: 'No seating plan uploaded for this session yet.' });
    return res.json(planOut(plan));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
