'use strict';

const express = require('express');
const { ExamSession, VerificationResult, SeatingPlan, Seat, ProcessingJob, HumanReview, Report } = require('../models');
const { computeSummary } = require('../services/reportService');

const router = express.Router();

async function summarize(session) {
  const results = await VerificationResult.find({ sessionId: session._id });
  const summary = results.length
    ? computeSummary(session, results)
    : {
        total_seats: session.seatCount,
        occupied: 0,
        empty: 0,
        correct: 0,
        wrong_seat: 0,
        unassigned: 0,
        needs_review: 0,
        accuracy_pct: 0.0,
      };
  return {
    id: session._id,
    exam_name: session.examName,
    room: session.room,
    exam_date: session.examDate,
    status: session.status,
    seat_count: session.seatCount,
    is_demo: session.isDemo,
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
  };
}

function sessionOut(session) {
  return {
    id: session._id,
    exam_name: session.examName,
    room: session.room,
    exam_date: session.examDate,
    status: session.status,
    seat_count: session.seatCount,
    is_demo: session.isDemo,
    classroom_layout_id: session.classroomLayoutId,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { exam_name: examName, room, exam_date: examDate } = req.body;
    if (!examName || !room || !examDate) {
      return res.status(422).json({ detail: 'exam_name, room, and exam_date are required.' });
    }
    const session = await ExamSession.create({ examName, room, examDate, status: 'draft' });
    return res.json(sessionOut(session));
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const sessions = await ExamSession.find({}, { createdAt: -1 });
    const out = await Promise.all(sessions.map(summarize));
    return res.json(out);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const session = await ExamSession.findById(req.params.id);
    if (!session) return res.status(404).json({ detail: 'Exam session not found' });
    return res.json(await summarize(session));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const session = await ExamSession.findById(req.params.id);
    if (!session) return res.status(404).json({ detail: 'Exam session not found' });
    const allowed = ['exam_name', 'room', 'exam_date', 'status', 'classroom_layout_id'];
    const fieldMap = {
      exam_name: 'examName',
      room: 'room',
      exam_date: 'examDate',
      status: 'status',
      classroom_layout_id: 'classroomLayoutId',
    };
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[fieldMap[key]] = req.body[key];
    }
    const updated = await ExamSession.findByIdAndUpdate(req.params.id, update);
    return res.json(sessionOut(updated));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const session = await ExamSession.findById(req.params.id);
    if (!session) return res.status(404).json({ detail: 'Exam session not found' });

    // Manual cascade delete (spec: deletion functionality) -- the original
    // relied on SQLAlchemy `cascade="all, delete-orphan"` relationships;
    // both Mongoose and the local-store fallback need this done explicitly.
    const plans = await SeatingPlan.find({ sessionId: session._id });
    for (const plan of plans) await Seat.deleteMany({ seatingPlanId: plan._id });
    await SeatingPlan.deleteMany({ sessionId: session._id });

    const results = await VerificationResult.find({ sessionId: session._id });
    for (const r of results) await HumanReview.deleteMany({ verificationResultId: r._id });
    await VerificationResult.deleteMany({ sessionId: session._id });

    await ProcessingJob.deleteMany({ sessionId: session._id });
    await Report.deleteMany({ sessionId: session._id });
    await ExamSession.findByIdAndDelete(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
