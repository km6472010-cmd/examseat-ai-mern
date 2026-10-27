/**
 * Demo Mode. Port of backend/app/services/demo_service.py.
 *
 * Generates a synthetic classroom photo and a matching official seating
 * arrangement, then runs the actual comparison/confidence engine
 * (src/verification/engine.js classifySeat -- the exact same function
 * every real verification run uses) against a deterministic, hand-
 * designed set of per-seat evidence values that exercise every status
 * the pipeline can produce (CORRECT via both Mode 1 "identity
 * unverified" and Mode 2 "identity matched", EMPTY, EMPTY-with-conflict,
 * WRONG_SEAT, UNASSIGNED, NEEDS_REVIEW).
 *
 * Honesty note ("do not fake the AI"): the *decision logic* here is
 * 100% real -- every row below is classified by the same verification
 * engine a live camera run uses, and you can see its math in
 * src/verification/engine.js. What's synthetic is the *evidence feeding
 * into it* (detection/seat-match/identity confidence numbers, and the
 * cartoon classroom photo) -- a from-scratch edge/blob heuristic cannot
 * reliably "see" drawn stick figures any more than the original's HOG
 * detector could, so scripting realistic evidence values is what lets
 * Demo Mode show every status without requiring a real photo first.
 * Every session, seat, and result created by this endpoint is flagged
 * `isDemo: true` and the frontend must visibly label it as synthetic
 * data, never presented as a real verification outcome.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { settings } = require('../config');
const { normToPixel } = require('../cv/seats');
const { renderAnnotatedImage } = require('../cv/overlay');
const { classifySeat } = require('../verification/engine');
const { createSeatingPlan } = require('./seatingService');
const { createClassroomLayout } = require('./classroomService');
const { ExamSession, ProcessingJob, VerificationResult } = require('../models');

const ROWS = 4;
const COLS = 5;
const ROW_LETTERS = ['A', 'B', 'C', 'D'];

// [seatId, assignedStudentId|null, case]
const DEMO_CASES = [
  ['A01', 'STU001', 'correct_identity'],
  ['A02', 'STU002', 'correct_identity'],
  ['A03', 'STU003', 'correct_unverified'],
  ['A04', 'STU004', 'correct_unverified'],
  ['A05', 'STU005', 'correct_unverified'],
  ['B01', 'STU006', 'empty'],
  ['B02', 'STU007', 'empty_conflict'],
  ['B03', 'STU008', 'correct_unverified'],
  ['B04', 'STU009', 'correct_unverified'],
  ['B05', 'STU010', 'correct_unverified'],
  ['C01', 'STU011', 'wrong_seat'],
  ['C02', 'STU012', 'wrong_seat'],
  ['C03', null, 'unassigned'],
  ['C04', 'STU013', 'needs_review'],
  ['C05', 'STU014', 'needs_review'],
  ['D01', 'STU015', 'correct_unverified'],
  ['D02', 'STU016', 'correct_unverified'],
  ['D03', 'STU017', 'correct_unverified'],
  ['D04', 'STU018', 'correct_unverified'],
  ['D05', 'STU019', 'correct_unverified'],
];

const STUDENT_NAMES = {};
for (let n = 1; n <= 20; n += 1) STUDENT_NAMES[`STU${String(n).padStart(3, '0')}`] = `Student ${n}`;

function buildSeatRegions() {
  const margin = 0.05;
  const cellW = (1 - 2 * margin) / COLS;
  const cellH = (1 - 2 * margin) / ROWS;
  const regions = [];
  ROW_LETTERS.forEach((letter, r) => {
    for (let c = 0; c < COLS; c += 1) {
      const seatId = `${letter}${String(c + 1).padStart(2, '0')}`;
      regions.push({
        seatId,
        row: r + 1,
        column: c + 1,
        x: Math.round((margin + cellW * (c + 0.5)) * 10000) / 10000,
        y: Math.round((margin + cellH * (r + 0.5)) * 10000) / 10000,
        w: Math.round(cellW * 0.75 * 10000) / 10000,
        h: Math.round(cellH * 0.75 * 10000) / 10000,
        isUsable: true,
      });
    }
  });
  return regions;
}

// Deterministic PRNG (mulberry32) so the demo image is byte-identical run
// to run, matching the original's fixed numpy Generator seed.
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDemoClassroomSvg(seatRegions, occupiedSeatIds) {
  const w = 1200;
  const h = 900;
  const rng = mulberry32(42);
  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo));

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#f5f5f0" />`,
    '<text x="24" y="34" font-family="sans-serif" font-size="20" fill="#783c0a">SYNTHETIC DEMO CLASSROOM -- not a real photo</text>',
  ];

  for (const seat of seatRegions) {
    const [x1, y1, sw, sh] = normToPixel(seat.x - seat.w / 2, seat.y - seat.h / 2, seat.w, seat.h, w, h);
    const deskY = y1 + Math.round(sh * 0.55);
    const deskH = sh - Math.round(sh * 0.55);
    parts.push(`<rect x="${x1}" y="${deskY}" width="${sw}" height="${deskH}" fill="#c8aa82" stroke="#967850" stroke-width="2" />`);
    parts.push(`<text x="${x1 + 4}" y="${y1 + sh + 16}" font-family="sans-serif" font-size="13" fill="#5a5a5a">${seat.seatId}</text>`);

    if (occupiedSeatIds.has(seat.seatId)) {
      const cx = x1 + Math.floor(sw / 2) + randInt(-4, 5);
      const cy = y1 + Math.round(sh * 0.32);
      const r = Math.round(sh * 0.16);
      const shade = randInt(90, 200);
      const color = `rgb(${shade},${Math.round(shade * 0.85)},${Math.round(shade * 0.7)})`;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`);
      const bodyX1 = cx - Math.round(sw * 0.28);
      const bodyY1 = cy + Math.round(sh * 0.12);
      const bodyX2 = cx + Math.round(sw * 0.28);
      const bodyY2 = y1 + Math.round(sh * 0.58);
      parts.push(`<rect x="${bodyX1}" y="${bodyY1}" width="${bodyX2 - bodyX1}" height="${Math.max(1, bodyY2 - bodyY1)}" fill="${color}" />`);
    }
  }

  parts.push('</svg>');
  return { svg: parts.join(''), width: w, height: h };
}

function caseToInput(seatId, assignedId, caseName) {
  const assignedName = assignedId ? STUDENT_NAMES[assignedId] : null;

  if (caseName === 'correct_identity') {
    return [
      {
        seatId, assignedStudentId: assignedId, assignedStudentName: assignedName,
        detectionConfidence: 0.93, seatMatchConfidence: 0.91, spatialConsistency: 0.88,
        detectedStudentId: assignedId, identityConfidence: 0.9,
      },
      assignedId,
    ];
  }
  if (caseName === 'correct_unverified') {
    return [
      { seatId, assignedStudentId: assignedId, assignedStudentName: assignedName, detectionConfidence: 0.87, seatMatchConfidence: 0.85, spatialConsistency: 0.8 },
      null,
    ];
  }
  if (caseName === 'empty') {
    return [{ seatId, assignedStudentId: assignedId, assignedStudentName: assignedName }, null];
  }
  if (caseName === 'empty_conflict') {
    return [{ seatId, assignedStudentId: assignedId, assignedStudentName: assignedName, conflictingCandidateScore: 0.31 }, null];
  }
  if (caseName === 'wrong_seat') {
    const otherId = 'STU020';
    return [
      {
        seatId, assignedStudentId: assignedId, assignedStudentName: assignedName,
        detectionConfidence: 0.9, seatMatchConfidence: 0.88, spatialConsistency: 0.82,
        detectedStudentId: otherId, identityConfidence: 0.84,
      },
      otherId,
    ];
  }
  if (caseName === 'unassigned') {
    return [
      { seatId, assignedStudentId: null, assignedStudentName: null, detectionConfidence: 0.81, seatMatchConfidence: 0.79, spatialConsistency: 0.7 },
      null,
    ];
  }
  if (caseName === 'needs_review') {
    return [
      { seatId, assignedStudentId: assignedId, assignedStudentName: assignedName, detectionConfidence: 0.44, seatMatchConfidence: 0.38, spatialConsistency: 0.3 },
      null,
    ];
  }
  throw new Error(`unknown demo case: ${caseName}`);
}

async function generateDemoBundle() {
  const seatRegions = buildSeatRegions();

  const csvRows = DEMO_CASES.map(([seatId, assignedId]) => ({
    seatId,
    row: ROW_LETTERS.indexOf(seatId[0]) + 1,
    column: parseInt(seatId.slice(1), 10),
    studentId: assignedId,
    studentName: assignedId ? STUDENT_NAMES[assignedId] : null,
  }));

  const session = await ExamSession.create({
    examName: 'Database Systems -- Demo Session',
    room: 'CSE-204 (Demo)',
    examDate: new Date().toISOString().slice(0, 10),
    status: 'draft',
    isDemo: true,
    seatCount: DEMO_CASES.length,
  });

  await createSeatingPlan(session._id, csvRows, 'demo', 'demo_seating.csv');

  const occupiedIds = new Set(DEMO_CASES.filter(([, , c]) => c !== 'empty' && c !== 'empty_conflict').map(([id]) => id));
  const { svg, width, height } = drawDemoClassroomSvg(seatRegions, occupiedIds);
  fs.mkdirSync(settings.DEMO_DIR, { recursive: true });
  const imagePath = path.join(settings.DEMO_DIR, `demo_classroom_${session._id}.jpg`);
  const demoImageBuffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(imagePath, demoImageBuffer);

  const layout = await createClassroomLayout(
    {
      name: `Demo Layout (session ${session._id})`,
      room: session.room,
      referenceWidth: width,
      referenceHeight: height,
      seats: seatRegions,
      calibrationMethod: 'demo',
    },
    imagePath
  );
  await ExamSession.findByIdAndUpdate(session._id, { classroomLayoutId: layout._id, status: 'completed' });

  const job = await ProcessingJob.create({
    sessionId: session._id,
    evidenceType: 'image',
    evidencePath: imagePath,
    status: 'completed',
    progressPercent: 100.0,
    framesTotal: 1,
    framesProcessed: 1,
    studentsDetected: occupiedIds.size,
    seatsAnalyzed: seatRegions.length,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  const cfg = { reviewThreshold: settings.CONFIDENCE_REVIEW_THRESHOLD, highThreshold: settings.CONFIDENCE_HIGH_THRESHOLD };
  const annotations = [];

  for (const [seatId, assignedId, caseName] of DEMO_CASES) {
    const [engineInput] = caseToInput(seatId, assignedId, caseName);
    const outcome = classifySeat(engineInput, cfg);

    await VerificationResult.create({
      sessionId: session._id,
      jobId: job._id,
      seatId: outcome.seatId,
      assignedStudentId: outcome.assignedStudentId,
      assignedStudentName: outcome.assignedStudentName,
      detectedStudentId: outcome.detectedStudentId,
      status: outcome.status,
      detectionConfidence: outcome.detectionConfidence,
      seatMatchConfidence: outcome.seatMatchConfidence,
      identityConfidence: outcome.identityConfidence,
      spatialConsistency: outcome.spatialConsistency,
      overallConfidence: outcome.overallConfidence,
      explanation: `${outcome.explanation} [synthetic demo evidence]`,
    });

    const region = seatRegions.find((s) => s.seatId === seatId);
    const [px1, py1, pw, ph] = normToPixel(region.x - region.w / 2, region.y - region.h / 2, region.w, region.h, width, height);
    annotations.push({
      seatId,
      bbox: [px1, py1, px1 + pw, py1 + ph],
      status: outcome.status,
      assignedStudent: outcome.assignedStudentName || outcome.assignedStudentId,
      detectedStudent: outcome.detectedStudentId,
      confidence: outcome.overallConfidence,
    });
  }

  const overlayBuffer = await renderAnnotatedImage(demoImageBuffer, annotations);
  fs.mkdirSync(settings.PROCESSED_DIR, { recursive: true });
  fs.writeFileSync(path.join(settings.PROCESSED_DIR, `job_${job._id}_overlay.jpg`), overlayBuffer);

  return ExamSession.findById(session._id);
}

module.exports = { generateDemoBundle, DEMO_CASES };
