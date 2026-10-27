/**
 * Report generation: PDF, CSV, JSON export. Port of
 * backend/app/services/report_service.py (PDF via pdfkit instead of
 * reportlab; same layout/content).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { settings } = require('../config');

const STATUS_LABELS = {
  CORRECT: 'Correct',
  EMPTY: 'Empty',
  WRONG_SEAT: 'Wrong Seat',
  UNASSIGNED: 'Unassigned',
  NEEDS_REVIEW: 'Needs Review',
};

const STATUS_BG = {
  Correct: '#dcfce7',
  Empty: '#f1f5f9',
  'Wrong Seat': '#fee2e2',
  Unassigned: '#dbeafe',
  'Needs Review': '#fef9c3',
};

function computeSummary(session, results) {
  const total = results.length;
  const empty = results.filter((r) => r.status === 'EMPTY').length;
  const correct = results.filter((r) => r.status === 'CORRECT').length;
  const wrong = results.filter((r) => r.status === 'WRONG_SEAT').length;
  const unassigned = results.filter((r) => r.status === 'UNASSIGNED').length;
  const review = results.filter((r) => r.status === 'NEEDS_REVIEW').length;
  const occupied = total - empty;
  const accuracy = total ? Math.round((correct / total) * 1000) / 10 : 0.0;
  return {
    exam_name: session.examName,
    room: session.room,
    exam_date: session.examDate,
    total_seats: total,
    occupied,
    empty,
    correct,
    wrong_seat: wrong,
    unassigned,
    needs_review: review,
    accuracy_pct: accuracy,
  };
}

function rowsForExport(results) {
  return [...results]
    .sort((a, b) => (a.seatId > b.seatId ? 1 : -1))
    .map((r) => ({
      seat: r.seatId,
      assigned: r.assignedStudentId || '-',
      detected: r.detectedStudentId || (r.status === 'EMPTY' ? 'None' : 'Unknown'),
      status: STATUS_LABELS[r.status] || r.status,
      confidence: `${Math.round((r.overallConfidence || 0) * 100)}%`,
    }));
}

function generateCsvReport(session, results) {
  fs.mkdirSync(settings.REPORTS_DIR, { recursive: true });
  const filePath = path.join(settings.REPORTS_DIR, `session_${session._id}_report.csv`);
  const summary = computeSummary(session, results);
  const lines = [];
  for (const [k, v] of Object.entries(summary)) lines.push(`${k},${v}`);
  lines.push('');
  lines.push('Seat,Assigned,Detected,Status,Confidence');
  for (const row of rowsForExport(results)) {
    lines.push([row.seat, row.assigned, row.detected, row.status, row.confidence].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

function generateJsonReport(session, results) {
  fs.mkdirSync(settings.REPORTS_DIR, { recursive: true });
  const filePath = path.join(settings.REPORTS_DIR, `session_${session._id}_report.json`);
  const payload = {
    summary: computeSummary(session, results),
    results: [...results]
      .sort((a, b) => (a.seatId > b.seatId ? 1 : -1))
      .map((r) => ({
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
        explanation: r.explanation,
      })),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function generatePdfReport(session, results) {
  fs.mkdirSync(settings.REPORTS_DIR, { recursive: true });
  const filePath = path.join(settings.REPORTS_DIR, `session_${session._id}_report.pdf`);
  const summary = computeSummary(session, results);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);
  const done = new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
  doc.pipe(stream);

  doc.fontSize(20).fillColor('#1e293b').text('ExamSeat AI -- Verification Report', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#000');
  doc.text(`Exam: ${summary.exam_name}`);
  doc.text(`Room: ${summary.room}`);
  doc.text(`Date: ${summary.exam_date}`);
  doc.moveDown();

  doc.fontSize(14).fillColor('#1e293b').text('Summary');
  doc.moveDown(0.3);
  const summaryCols = [
    ['Total Seats', summary.total_seats],
    ['Occupied', summary.occupied],
    ['Empty', summary.empty],
    ['Correct', summary.correct],
    ['Wrong Seat', summary.wrong_seat],
    ['Unassigned', summary.unassigned],
    ['Needs Review', summary.needs_review],
    ['Accuracy', `${summary.accuracy_pct}%`],
  ];
  doc.fontSize(9).fillColor('#333');
  doc.text(summaryCols.map(([k]) => k).join('  |  '));
  doc.text(summaryCols.map(([, v]) => String(v)).join('  |  '));
  doc.moveDown();

  doc.fontSize(14).fillColor('#1e293b').text('Detailed Results');
  doc.moveDown(0.3);
  doc.fontSize(9);
  const rows = rowsForExport(results);
  const colWidths = [70, 110, 110, 100, 80];
  const startX = doc.x;
  let y = doc.y;

  const drawRow = (cells, bg, bold) => {
    let x = startX;
    if (bg) {
      doc.rect(startX, y - 2, colWidths.reduce((a, b) => a + b, 0), 16).fill(bg);
    }
    doc.fillColor(bold ? '#ffffff' : '#111111').font(bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((c, i) => {
      doc.text(String(c), x, y, { width: colWidths[i], height: 16 });
      x += colWidths[i];
    });
    y += 16;
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
  };

  drawRow(['Seat', 'Assigned', 'Detected', 'Status', 'Confidence'], '#1e293b', true);
  for (const row of rows) {
    drawRow(
      [row.seat, row.assigned, row.detected, row.status, row.confidence],
      STATUS_BG[row.status] || '#ffffff',
      false
    );
  }

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#555').font('Helvetica-Oblique').text(
    'This report is generated by an AI-assisted verification tool. Low-confidence cases are marked ' +
      "'Needs Review' and require human confirmation before any action is taken -- this system does not " +
      'make autonomous disciplinary decisions.'
  );

  doc.end();
  return done;
}

module.exports = { computeSummary, generateCsvReport, generateJsonReport, generatePdfReport };
