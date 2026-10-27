/**
 * CSV seating-arrangement parsing. Port of backend/app/services/csv_service.py.
 */
'use strict';

const { parse } = require('csv-parse/sync');

const REQUIRED_COLUMNS = ['seat_id', 'row', 'column'];

class CsvValidationError extends Error {}

/**
 * @param {Buffer|string} content
 * @returns {{rows: Array, warnings: Array, rowsParsed: number, rowsSkipped: number}}
 */
function parseSeatingCsv(content) {
  let text;
  try {
    text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    // strip a UTF-8 BOM if present, mirroring Python's utf-8-sig decode
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  } catch (exc) {
    throw new CsvValidationError(`File is not valid UTF-8 text: ${exc.message}`);
  }

  let records;
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (exc) {
    throw new CsvValidationError(`Could not parse CSV: ${exc.message}`);
  }

  if (!records.length) {
    throw new CsvValidationError('CSV file appears to be empty.');
  }

  const header = new Set(Object.keys(records[0]).map((h) => h.trim().toLowerCase()));
  const missing = REQUIRED_COLUMNS.filter((c) => !header.has(c));
  if (missing.length) {
    throw new CsvValidationError(
      `Missing required column(s): ${missing.sort().join(', ')}. Required columns are: ${[...REQUIRED_COLUMNS].sort().join(', ')}.`
    );
  }

  const rows = [];
  const warnings = [];
  const seenSeatIds = new Set();
  let rowsSkipped = 0;

  records.forEach((raw, i) => {
    const rowNumber = i + 2; // row 1 is the header
    const normalized = {};
    for (const [k, v] of Object.entries(raw)) {
      normalized[(k || '').trim().toLowerCase()] = (v || '').trim();
    }
    const seatId = normalized.seat_id || '';
    const rowVal = normalized.row || '';
    const colVal = normalized.column || '';

    if (!seatId) {
      warnings.push({ row_number: rowNumber, message: 'Missing seat_id -- row skipped.' });
      rowsSkipped += 1;
      return;
    }
    if (seenSeatIds.has(seatId)) {
      warnings.push({ row_number: rowNumber, message: `Duplicate seat_id '${seatId}' -- row skipped.` });
      rowsSkipped += 1;
      return;
    }
    const rowNum = Number.parseInt(rowVal, 10);
    const colNum = Number.parseInt(colVal, 10);
    if (Number.isNaN(rowNum) || Number.isNaN(colNum) || String(rowNum) !== rowVal.trim() || String(colNum) !== colVal.trim()) {
      warnings.push({
        row_number: rowNumber,
        message: `row/column must be integers (got row='${rowVal}', column='${colVal}') -- row skipped.`,
      });
      rowsSkipped += 1;
      return;
    }

    const studentId = normalized.student_id || null;
    const studentName = normalized.student_name || null;
    if (studentId && !studentName) {
      warnings.push({ row_number: rowNumber, message: `student_id '${studentId}' has no student_name.` });
    }

    seenSeatIds.add(seatId);
    rows.push({ seatId, row: rowNum, column: colNum, studentId, studentName });
  });

  if (!rows.length) {
    throw new CsvValidationError('No valid seat rows could be parsed from this file.');
  }

  return { rows, warnings, rowsParsed: rows.length, rowsSkipped };
}

module.exports = { parseSeatingCsv, CsvValidationError };
