/**
 * Seating-plan OCR / table extraction. Port of backend/app/cv/ocr.py,
 * using tesseract.js (pure JS/WASM Tesseract build) instead of the
 * system `tesseract` binary + pytesseract.
 *
 * Same heuristic table-parsing approach as the original: OCR the image,
 * then split each line into seat_id/row/column/student_id/student_name
 * columns using whitespace/comma/tab runs as column separators. Not a
 * perfect parser for every layout -- by design the API always returns
 * the extracted rows plus warnings and expects the frontend to render
 * an editable table for the invigilator to correct before use.
 *
 * tesseract.js downloads its language traineddata the first time it
 * runs. In a network-restricted environment that download can fail; this
 * mirrors the original Python code's own graceful-degradation pattern
 * (`except Exception: return OcrExtractionResult(warnings=[...])`)
 * rather than crashing the request.
 */
'use strict';

const COLUMN_SPLIT_RE = /\s{2,}|\t+|,/;

function looksLikeHeader(cells) {
  const joined = cells.join(' ').toLowerCase();
  return joined.includes('seat') && (joined.includes('student') || joined.includes('row'));
}

async function extractSeatingTable(imagePath) {
  let text = '';
  try {
    // Lazy-require so a missing/failed native dependency doesn't break
    // the rest of the app at startup.
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(imagePath);
      text = data.text || '';
    } finally {
      await worker.terminate();
    }
  } catch (exc) {
    return { rows: [], rawText: '', warnings: [`OCR unavailable: ${exc.message}`] };
  }

  const rows = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const cells = line.split(COLUMN_SPLIT_RE).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (looksLikeHeader(cells)) continue;

    const numericCells = cells.filter((c) => /^\d+$/.test(c));
    const alnumCells = cells.filter((c) => !/^\d+$/.test(c));

    const row = {
      seat_id: alnumCells[0] || null,
      row: null,
      column: null,
      student_id: null,
      student_name: null,
      raw_line: line,
      confidence: 'low',
    };
    if (numericCells.length >= 2) {
      row.row = parseInt(numericCells[0], 10);
      row.column = parseInt(numericCells[1], 10);
    }
    if (alnumCells.length >= 2) row.student_id = alnumCells[1];
    if (alnumCells.length >= 3) row.student_name = alnumCells.slice(2).join(' ');
    row.confidence = row.seat_id && row.student_id ? 'medium' : 'low';
    rows.push(row);
  }

  const warnings = [];
  if (!rows.length) {
    warnings.push('No table rows could be confidently extracted. Please use the manual editor or CSV upload instead.');
  } else {
    warnings.push(`Extracted ${rows.length} row(s) via OCR heuristics -- review and correct before saving.`);
  }

  return { rows, rawText: text, warnings };
}

module.exports = { extractSeatingTable };
