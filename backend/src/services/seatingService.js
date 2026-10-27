/**
 * Port of backend/app/services/seating_service.py.
 */
'use strict';

const { SeatingPlan, Seat, ExamSession } = require('../models');

/**
 * @param {string} sessionId
 * @param {Array} rows - [{seatId, row, column, studentId, studentName}]
 * @param {string} source - SeatingSource value
 * @param {string|null} rawFilename
 */
async function createSeatingPlan(sessionId, rows, source, rawFilename = null) {
  // Only one active seating plan per session at a time -- deactivate priors
  // so "official arrangement" always resolves unambiguously.
  await SeatingPlan.updateMany({ sessionId }, { isActive: false });

  const plan = await SeatingPlan.create({ sessionId, source, isActive: true, rawFilename });

  const seats = [];
  for (const r of rows) {
    const seat = await Seat.create({
      seatingPlanId: plan._id,
      seatId: r.seatId,
      row: r.row,
      column: r.column,
      assignedStudentId: r.studentId || null,
      assignedStudentName: r.studentName || null,
      isUsable: true,
    });
    seats.push(seat);
  }

  const session = await ExamSession.findById(sessionId);
  if (session) {
    await ExamSession.findByIdAndUpdate(sessionId, { seatCount: rows.length });
  }

  return { ...plan, seats };
}

async function getActiveSeatingPlan(sessionId) {
  const plan = await SeatingPlan.findOne({ sessionId, isActive: true }, { createdAt: -1 });
  if (!plan) return null;
  const seats = await Seat.find({ seatingPlanId: plan._id }, { seatId: 1 });
  return { ...plan, seats };
}

module.exports = { createSeatingPlan, getActiveSeatingPlan };
