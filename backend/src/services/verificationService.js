/**
 * Orchestrates the full pipeline:
 *
 *   Classroom Detection -> Seat Detection/Mapping -> Student Detection ->
 *   Student-to-Seat Assignment -> Official Seating Arrangement Lookup ->
 *   Comparison Engine -> Confidence Scoring -> Human Verification Queue
 *
 * Port of backend/app/services/verification_service.py. This module is
 * the glue between the pure CV/verification logic (src/cv/*,
 * src/verification/engine.js -- both independently testable) and
 * persistence (Mongoose/local-store models) + image/video I/O.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { settings } = require('../config');
const { detectPeopleHeuristic } = require('../cv/detector');
const { matchStudentsToSeats } = require('../cv/matching');
const { renderAnnotatedImage } = require('../cv/overlay');
const { normToPixel, seatRegionBboxNorm } = require('../cv/seats');
const { extractFrames, CentroidTracker } = require('../cv/video');
const { classifySeat } = require('../verification/engine');
const { Detection, SeatAssignment, VerificationResult, ProcessingJob } = require('../models');

function layoutSeatBoxes(layoutSeats) {
  return layoutSeats.map((s) => {
    const [x1, y1, x2, y2] = seatRegionBboxNorm(s);
    return { seatId: s.seatId, cx: s.x, cy: s.y, x1, y1, x2, y2, isUsable: s.isUsable };
  });
}

function verificationConfig() {
  return { reviewThreshold: settings.CONFIDENCE_REVIEW_THRESHOLD, highThreshold: settings.CONFIDENCE_HIGH_THRESHOLD };
}

function officialSeatLookup(officialSeats) {
  const map = new Map();
  for (const s of officialSeats) map.set(s.seatId, s);
  return map;
}

async function runImageVerification(job, imagePath, layout, layoutSeats, officialSeats) {
  await ProcessingJob.findByIdAndUpdate(job._id, { status: 'running', startedAt: new Date().toISOString() });

  let meta;
  try {
    meta = await sharp(imagePath).metadata();
    if (!meta.width || !meta.height) throw new Error('unreadable image');
  } catch (exc) {
    await ProcessingJob.findByIdAndUpdate(job._id, { status: 'failed', errorMessage: `Could not read image file: ${imagePath}` });
    throw new Error(`Could not read image file: ${imagePath}`);
  }
  const w = meta.width;
  const h = meta.height;

  const rawDetections = await detectPeopleHeuristic(imagePath, settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD);

  const normalized = rawDetections.map((d, i) => ({
    index: i,
    cx: (d.x1 + d.x2) / 2 / w,
    cy: (d.y1 + d.y2) / 2 / h,
    x1: d.x1 / w,
    y1: d.y1 / h,
    x2: d.x2 / w,
    y2: d.y2 / h,
    confidence: d.confidence,
  }));

  const seatBoxes = layoutSeatBoxes(layoutSeats);
  const matchCfg = { maxDistanceNorm: settings.SEAT_MATCH_MAX_DISTANCE_NORM };
  const matches = matchStudentsToSeats(normalized, seatBoxes, matchCfg);

  // Persist raw detections -------------------------------------------------
  const detectionRows = [];
  for (const d of rawDetections) {
    const row = await Detection.create({
      jobId: job._id,
      frameNumber: 0,
      bboxX1: d.x1,
      bboxY1: d.y1,
      bboxX2: d.x2,
      bboxY2: d.y2,
      detectionConfidence: d.confidence,
    });
    detectionRows.push(row);
  }

  const matchBySeat = new Map(); // seatId -> {detRow, match}
  const conflictBySeat = new Map();
  for (const m of matches) {
    const detRow = detectionRows[m.detectionIndex];
    if (m.seatId) {
      await SeatAssignment.create({
        detectionId: detRow._id,
        seatId: m.seatId,
        classroomLayoutId: layout._id,
        distanceNorm: m.distanceNorm,
        iou: m.iou,
        containment: m.containment,
        assignmentConfidence: m.assignmentConfidence,
      });
      matchBySeat.set(m.seatId, { detRow, match: m });
    }
    for (const cand of m.allCandidates) {
      const existing = matchBySeat.get(cand.seatId);
      if (!existing || existing.detRow._id !== detRow._id) {
        conflictBySeat.set(cand.seatId, Math.max(conflictBySeat.get(cand.seatId) || 0.0, cand.score));
      }
    }
  }

  const officialBySeat = officialSeatLookup(officialSeats);
  const cfg = verificationConfig();
  const annotations = [];
  const results = [];

  for (const seat of layoutSeats) {
    const official = officialBySeat.get(seat.seatId);
    const assignedId = official ? official.assignedStudentId : null;
    const assignedName = official ? official.assignedStudentName : null;
    const isUsable = (official ? official.isUsable : true) && seat.isUsable;

    const matched = matchBySeat.get(seat.seatId);
    const detConf = matched ? matched.detRow.detectionConfidence : null;
    const seatConf = matched ? matched.match.assignmentConfidence : null;
    let spatial = null;
    if (matched) {
      const candidates = matched.match.allCandidates;
      spatial = candidates.length
        ? candidates.length > 1
          ? Math.round((candidates[0].score - candidates[1].score) * 10000) / 10000
          : Math.round(candidates[0].score * 10000) / 10000
        : matched.match.assignmentConfidence;
      spatial = Math.max(spatial, 0.0);
    }

    const outcome = classifySeat(
      {
        seatId: seat.seatId,
        assignedStudentId: assignedId,
        assignedStudentName: assignedName,
        isUsable,
        detectionConfidence: detConf,
        seatMatchConfidence: seatConf,
        spatialConsistency: spatial,
        detectedStudentId: null, // identity matching not enabled by default (Mode 1)
        identityConfidence: null,
        conflictingCandidateScore: !matched ? conflictBySeat.get(seat.seatId) : undefined,
      },
      cfg
    );

    const vr = await VerificationResult.create({
      sessionId: job.sessionId,
      jobId: job._id,
      seatId: seat.seatId,
      assignedStudentId: outcome.assignedStudentId,
      assignedStudentName: outcome.assignedStudentName,
      detectedStudentId: outcome.detectedStudentId,
      detectionId: matched ? matched.detRow._id : null,
      status: outcome.status,
      detectionConfidence: outcome.detectionConfidence,
      seatMatchConfidence: outcome.seatMatchConfidence,
      identityConfidence: outcome.identityConfidence,
      spatialConsistency: outcome.spatialConsistency,
      overallConfidence: outcome.overallConfidence,
      explanation: outcome.explanation,
    });
    results.push(vr);

    let bbox;
    const [px1, py1, pw, ph] = normToPixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, w, h);
    bbox = [px1, py1, px1 + pw, py1 + ph];
    if (matched) {
      const d = rawDetections[detectionRows.findIndex((dr) => dr._id === matched.detRow._id)];
      if (d) bbox = [Math.round(d.x1), Math.round(d.y1), Math.round(d.x2), Math.round(d.y2)];
    }
    annotations.push({
      seatId: seat.seatId,
      bbox,
      status: outcome.status,
      assignedStudent: outcome.assignedStudentName || outcome.assignedStudentId,
      detectedStudent: outcome.detectedStudentId,
      confidence: outcome.overallConfidence,
    });
  }

  const overlayBuffer = await renderAnnotatedImage(imagePath, annotations);
  fs.mkdirSync(settings.PROCESSED_DIR, { recursive: true });
  const overlayPath = path.join(settings.PROCESSED_DIR, `job_${job._id}_overlay.jpg`);
  fs.writeFileSync(overlayPath, overlayBuffer);

  await ProcessingJob.findByIdAndUpdate(job._id, {
    status: 'completed',
    progressPercent: 100.0,
    framesTotal: 1,
    framesProcessed: 1,
    studentsDetected: rawDetections.length,
    seatsAnalyzed: layoutSeats.length,
    finishedAt: new Date().toISOString(),
  });

  return results;
}

async function runVideoVerification(job, videoPath, layout, layoutSeats, officialSeats, sampleEveryNFrames = 5) {
  await ProcessingJob.findByIdAndUpdate(job._id, { status: 'running', startedAt: new Date().toISOString() });

  const seatBoxes = layoutSeatBoxes(layoutSeats);
  const matchCfg = { maxDistanceNorm: settings.SEAT_MATCH_MAX_DISTANCE_NORM };
  const tracker = new CentroidTracker();

  const seatVotes = new Map();
  const seatDetConfSum = new Map();
  const seatMatchConfSum = new Map();
  const seatSpatialSum = new Map();
  const bestFrameBbox = new Map();

  let framesProcessed = 0;
  let framesTotalEst = 1;
  let representativeFramePath = null;

  try {
    for await (const { total, framePath } of extractFrames(videoPath, sampleEveryNFrames)) {
      framesTotalEst = total || framesTotalEst;
      if (!representativeFramePath) {
        representativeFramePath = path.join(settings.PROCESSED_DIR, `job_${job._id}_repframe.jpg`);
        fs.mkdirSync(settings.PROCESSED_DIR, { recursive: true });
        fs.copyFileSync(framePath, representativeFramePath);
      }

      const meta = await sharp(framePath).metadata();
      const w = meta.width;
      const h = meta.height;
      const rawDetections = await detectPeopleHeuristic(framePath, settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD);
      tracker.update(rawDetections.map((d) => [[d.x1, d.y1, d.x2, d.y2], d.confidence]));

      const normalized = rawDetections.map((d, i) => ({
        index: i,
        cx: (d.x1 + d.x2) / 2 / w,
        cy: (d.y1 + d.y2) / 2 / h,
        x1: d.x1 / w,
        y1: d.y1 / h,
        x2: d.x2 / w,
        y2: d.y2 / h,
        confidence: d.confidence,
      }));
      const matches = matchStudentsToSeats(normalized, seatBoxes, matchCfg);
      for (const m of matches) {
        if (!m.seatId) continue;
        seatVotes.set(m.seatId, (seatVotes.get(m.seatId) || 0) + 1);
        const d = rawDetections[m.detectionIndex];
        seatDetConfSum.set(m.seatId, (seatDetConfSum.get(m.seatId) || 0) + d.confidence);
        seatMatchConfSum.set(m.seatId, (seatMatchConfSum.get(m.seatId) || 0) + m.assignmentConfidence);
        const candidates = m.allCandidates;
        const margin = candidates.length > 1 ? candidates[0].score - candidates[1].score : m.assignmentConfidence;
        seatSpatialSum.set(m.seatId, (seatSpatialSum.get(m.seatId) || 0) + Math.max(margin, 0.0));
        bestFrameBbox.set(m.seatId, [Math.round(d.x1), Math.round(d.y1), Math.round(d.x2), Math.round(d.y2)]);
      }

      framesProcessed += 1;
      await ProcessingJob.findByIdAndUpdate(job._id, {
        framesTotal: framesTotalEst,
        framesProcessed,
        progressPercent: Math.round(Math.min((framesProcessed * sampleEveryNFrames) / Math.max(framesTotalEst, 1), 1.0) * 1000) / 10,
        studentsDetected: tracker.objects.size,
      });
    }
  } catch (exc) {
    await ProcessingJob.findByIdAndUpdate(job._id, { status: 'failed', errorMessage: exc.message });
    throw exc;
  }

  const officialBySeat = officialSeatLookup(officialSeats);
  const cfg = verificationConfig();
  const annotations = [];
  const results = [];
  const minVoteFraction = 0.4;

  for (const seat of layoutSeats) {
    const official = officialBySeat.get(seat.seatId);
    const assignedId = official ? official.assignedStudentId : null;
    const assignedName = official ? official.assignedStudentName : null;
    const isUsable = (official ? official.isUsable : true) && seat.isUsable;

    const votes = seatVotes.get(seat.seatId) || 0;
    const occupied = framesProcessed > 0 && votes / framesProcessed >= minVoteFraction;

    let detConf = null;
    let seatConf = null;
    let spatial = null;
    if (occupied && votes > 0) {
      detConf = seatDetConfSum.get(seat.seatId) / votes;
      seatConf = seatMatchConfSum.get(seat.seatId) / votes;
      spatial = seatSpatialSum.get(seat.seatId) / votes;
      const consistencyRatio = votes / Math.max(framesProcessed, 1);
      seatConf = Math.round(seatConf * (0.6 + 0.4 * consistencyRatio) * 10000) / 10000;
    }

    const outcome = classifySeat(
      {
        seatId: seat.seatId,
        assignedStudentId: assignedId,
        assignedStudentName: assignedName,
        isUsable,
        detectionConfidence: detConf,
        seatMatchConfidence: seatConf,
        spatialConsistency: spatial,
        detectedStudentId: null,
        identityConfidence: null,
      },
      cfg
    );

    const vr = await VerificationResult.create({
      sessionId: job.sessionId,
      jobId: job._id,
      seatId: seat.seatId,
      assignedStudentId: outcome.assignedStudentId,
      assignedStudentName: outcome.assignedStudentName,
      detectedStudentId: outcome.detectedStudentId,
      status: outcome.status,
      detectionConfidence: outcome.detectionConfidence,
      seatMatchConfidence: outcome.seatMatchConfidence,
      identityConfidence: outcome.identityConfidence,
      spatialConsistency: outcome.spatialConsistency,
      overallConfidence: outcome.overallConfidence,
      explanation: `${outcome.explanation} (based on ${votes}/${framesProcessed} sampled frames)`,
    });
    results.push(vr);

    if (representativeFramePath) {
      const meta = await sharp(representativeFramePath).metadata();
      const [px1, py1, pw, ph] = normToPixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, meta.width, meta.height);
      const bbox = bestFrameBbox.get(seat.seatId) || [px1, py1, px1 + pw, py1 + ph];
      annotations.push({
        seatId: seat.seatId,
        bbox,
        status: outcome.status,
        assignedStudent: outcome.assignedStudentName || outcome.assignedStudentId,
        detectedStudent: outcome.detectedStudentId,
        confidence: outcome.overallConfidence,
      });
    }
  }

  if (representativeFramePath) {
    const overlayBuffer = await renderAnnotatedImage(representativeFramePath, annotations);
    const overlayPath = path.join(settings.PROCESSED_DIR, `job_${job._id}_overlay.jpg`);
    fs.writeFileSync(overlayPath, overlayBuffer);
  }

  await ProcessingJob.findByIdAndUpdate(job._id, {
    status: 'completed',
    progressPercent: 100.0,
    seatsAnalyzed: layoutSeats.length,
    finishedAt: new Date().toISOString(),
  });

  return results;
}

module.exports = { runImageVerification, runVideoVerification };
