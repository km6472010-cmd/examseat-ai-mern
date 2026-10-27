'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { settings } = require('../config');
const { ClassroomLayout } = require('../models');
const classroomService = require('../services/classroomService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function layoutOut(layout) {
  return {
    id: layout._id,
    name: layout.name,
    room: layout.room,
    reference_image_path: layout.referenceImagePath,
    reference_width: layout.referenceWidth,
    reference_height: layout.referenceHeight,
    calibration_method: layout.calibrationMethod,
    seats: classroomService.getLayoutSeats(layout).map((s) => ({
      seat_id: s.seatId,
      row: s.row,
      column: s.column,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      is_usable: s.isUsable,
    })),
    created_at: layout.createdAt,
    updated_at: layout.updatedAt,
  };
}

router.post('/upload-image', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ detail: 'An image file is required.' });
    const uploadDir = path.join(settings.UPLOADS_DIR, 'classroom');
    fs.mkdirSync(uploadDir, { recursive: true });
    const dest = path.join(uploadDir, req.file.originalname);
    fs.writeFileSync(dest, req.file.buffer);

    let meta;
    try {
      meta = await sharp(dest).metadata();
      if (!meta.width || !meta.height) throw new Error('unreadable');
    } catch {
      return res.status(422).json({ detail: 'Uploaded file is not a readable image.' });
    }
    return res.json({ path: dest, width: meta.width, height: meta.height });
  } catch (err) {
    return next(err);
  }
});

router.post('/auto-detect', upload.single('file'), async (req, res, next) => {
  try {
    const rows = parseInt(req.body.rows, 10);
    const columns = parseInt(req.body.columns, 10);
    if (!req.file || !rows || !columns) {
      return res.status(422).json({ detail: 'rows, columns, and an image file are required.' });
    }
    const uploadDir = path.join(settings.UPLOADS_DIR, 'classroom');
    fs.mkdirSync(uploadDir, { recursive: true });
    const dest = path.join(uploadDir, req.file.originalname);
    fs.writeFileSync(dest, req.file.buffer);

    const seats = classroomService.autoDetectSeatsForImage(rows, columns);
    return res.json({
      seats: seats.map((s) => ({ seat_id: s.seatId, row: s.row, column: s.column, x: s.x, y: s.y, w: s.w, h: s.h, is_usable: s.isUsable })),
      method: 'grid-estimate',
      confidence_note:
        'Automatic seat detection from a single photo is unreliable (perspective, occlusion, arbitrary ' +
        'furniture). These seats were laid out as an evenly spaced grid -- please drag each seat to match ' +
        'the photo before saving.',
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/calibrate', async (req, res, next) => {
  try {
    const payload = req.body;
    const layout = await classroomService.createClassroomLayout(
      {
        name: payload.name,
        room: payload.room,
        referenceWidth: payload.reference_width,
        referenceHeight: payload.reference_height,
        seats: (payload.seats || []).map((s) => ({ seatId: s.seat_id, row: s.row, column: s.column, x: s.x, y: s.y, w: s.w, h: s.h, isUsable: s.is_usable !== false })),
        calibrationMethod: payload.calibration_method || 'manual',
      },
      req.query.reference_image_path || payload.reference_image_path || null
    );
    return res.json(layoutOut(layout));
  } catch (err) {
    return next(err);
  }
});

router.put('/calibrate/:layoutId', async (req, res, next) => {
  try {
    const layout = await ClassroomLayout.findById(req.params.layoutId);
    if (!layout) return res.status(404).json({ detail: 'Classroom layout not found' });
    const payload = req.body;
    const updated = await classroomService.updateClassroomLayout(req.params.layoutId, {
      name: payload.name,
      room: payload.room,
      referenceWidth: payload.reference_width,
      referenceHeight: payload.reference_height,
      seats: (payload.seats || []).map((s) => ({ seatId: s.seat_id, row: s.row, column: s.column, x: s.x, y: s.y, w: s.w, h: s.h, isUsable: s.is_usable !== false })),
      calibrationMethod: payload.calibration_method || 'manual',
    });
    return res.json(layoutOut(updated));
  } catch (err) {
    return next(err);
  }
});

router.get('/layouts', async (req, res, next) => {
  try {
    const layouts = await ClassroomLayout.find({}, { updatedAt: -1 });
    return res.json(layouts.map(layoutOut));
  } catch (err) {
    return next(err);
  }
});

router.get('/layouts/:id', async (req, res, next) => {
  try {
    const layout = await ClassroomLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ detail: 'Classroom layout not found' });
    return res.json(layoutOut(layout));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
