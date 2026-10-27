/**
 * Port of backend/app/services/classroom_service.py.
 */
'use strict';

const { ClassroomLayout } = require('../models');
const { autoDetectSeatRegions } = require('../cv/seats');

async function createClassroomLayout(payload, referenceImagePath) {
  const layout = await ClassroomLayout.create({
    name: payload.name,
    room: payload.room || null,
    referenceImagePath: referenceImagePath || null,
    referenceWidth: payload.referenceWidth || null,
    referenceHeight: payload.referenceHeight || null,
    seatsJson: JSON.stringify(payload.seats || []),
    calibrationMethod: payload.calibrationMethod || 'manual',
  });
  return layout;
}

async function updateClassroomLayout(layoutId, payload) {
  const update = {
    name: payload.name,
    room: payload.room || null,
    seatsJson: JSON.stringify(payload.seats || []),
    calibrationMethod: payload.calibrationMethod || 'manual',
  };
  if (payload.referenceWidth) update.referenceWidth = payload.referenceWidth;
  if (payload.referenceHeight) update.referenceHeight = payload.referenceHeight;
  return ClassroomLayout.findByIdAndUpdate(layoutId, update);
}

function getLayoutSeats(layout) {
  try {
    return JSON.parse(layout.seatsJson || '[]');
  } catch {
    return [];
  }
}

function autoDetectSeatsForImage(rows, columns) {
  // Grid-estimate baseline -- see cv/seats.js for the rationale (spec
  // section 6/7): a single-photo seat segmenter is unreliable, so this
  // lays out an evenly spaced grid for the invigilator to drag/correct.
  return autoDetectSeatRegions(rows, columns);
}

module.exports = { createClassroomLayout, updateClassroomLayout, getLayoutSeats, autoDetectSeatsForImage };
