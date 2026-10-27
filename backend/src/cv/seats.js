/**
 * Seat/desk region helpers: normalized<->pixel conversion and a best-effort
 * automatic seat-region detector. Port of backend/app/cv/seats.py.
 *
 * Automatic seat detection from a single 2D photo (arbitrary furniture,
 * occlusion, perspective) is not something a generic heuristic can do
 * reliably. `autoDetectSeatRegions` lays out an evenly spaced grid over
 * the image -- a real, working baseline meant to pre-populate the
 * calibration UI for the invigilator to correct, never to be trusted
 * blindly.
 */
'use strict';

function pixelToNorm(x, y, w, h, imgW, imgH) {
  return [x / imgW, y / imgH, w / imgW, h / imgH];
}

function normToPixel(x, y, w, h, imgW, imgH) {
  return [Math.round(x * imgW), Math.round(y * imgH), Math.round(w * imgW), Math.round(h * imgH)];
}

/** Return [x1, y1, x2, y2] in normalized coords from a center+size seat region. */
function seatRegionBboxNorm(seat) {
  const x1 = seat.x - seat.w / 2;
  const y1 = seat.y - seat.h / 2;
  const x2 = seat.x + seat.w / 2;
  const y2 = seat.y + seat.h / 2;
  return [x1, y1, x2, y2];
}

function autoDetectSeatRegions(rows, columns, margin = 0.04) {
  const usableW = 1.0 - 2 * margin;
  const usableH = 1.0 - 2 * margin;
  const cellW = usableW / Math.max(columns, 1);
  const cellH = usableH / Math.max(rows, 1);

  const seats = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const cx = margin + cellW * (c + 0.5);
      const cy = margin + cellH * (r + 0.5);
      const seatLetter = r < 26 ? String.fromCharCode('A'.charCodeAt(0) + r) : `R${r + 1}`;
      const seatId = `${seatLetter}${String(c + 1).padStart(2, '0')}`;
      seats.push({
        seatId,
        row: r + 1,
        column: c + 1,
        x: Math.round(cx * 10000) / 10000,
        y: Math.round(cy * 10000) / 10000,
        w: Math.round(cellW * 0.8 * 10000) / 10000,
        h: Math.round(cellH * 0.8 * 10000) / 10000,
        isUsable: true,
      });
    }
  }
  return seats;
}

module.exports = { pixelToNorm, normToPixel, seatRegionBboxNorm, autoDetectSeatRegions };
