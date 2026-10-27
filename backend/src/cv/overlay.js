/**
 * Visual overlay rendering. Port of backend/app/cv/overlay.py.
 *
 * GREEN = Correct, RED = Wrong seat, YELLOW = Needs verification,
 * GRAY = Empty, BLUE = Unassigned.
 *
 * The original used OpenCV to draw directly onto pixel buffers. Node has
 * no equivalent CV library available in this sandbox (see README > MERN
 * Conversion Notes), so this builds the exact same boxes/labels as an SVG
 * overlay and composites it onto the source photo with `sharp` (whose
 * binaries install cleanly from the npm registry and which embeds
 * librsvg for SVG compositing) -- same visual result, no native CV
 * dependency required.
 */
'use strict';

const sharp = require('sharp');

const STATUS_COLORS = {
  CORRECT: '#4caf50',
  WRONG_SEAT: '#dc3c3c',
  NEEDS_REVIEW: '#ffd200',
  EMPTY: '#969696',
  UNASSIGNED: '#3c8cdc',
};

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function annotationSvg(width, height, annotations) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`];
  for (const a of annotations) {
    const color = STATUS_COLORS[a.status] || '#ffffff';
    const [x1, y1, x2, y2] = a.bbox;
    const w = Math.max(1, x2 - x1);
    const h = Math.max(1, y2 - y1);
    parts.push(`<rect x="${x1}" y="${y1}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="2.5" />`);

    const lines = [a.seatId];
    if (a.assignedStudent) lines.push(`Assigned: ${a.assignedStudent}`);
    if (a.detectedStudent) lines.push(`Detected: ${a.detectedStudent}`);
    lines.push(`${a.status.replace(/_/g, ' ')}  ${Math.round((a.confidence || 0) * 100)}%`);

    const lineH = 16;
    const boxH = lineH * lines.length + 8;
    const boxW = Math.max(...lines.map((t) => t.length)) * 6.5 + 10;
    const labelY1 = Math.max(0, y1 - boxH);

    parts.push(
      `<rect x="${x1}" y="${labelY1}" width="${boxW}" height="${boxH}" fill="${color}" fill-opacity="0.72" />`
    );
    lines.forEach((text, i) => {
      const ty = labelY1 + (i + 1) * lineH - 2;
      parts.push(
        `<text x="${x1 + 5}" y="${ty}" font-family="sans-serif" font-size="12" fill="#ffffff">${escapeXml(text)}</text>`
      );
    });
  }
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Composite seat annotations onto a base image.
 * @param {Buffer|string} baseImage - image buffer or file path
 * @param {Array} annotations - [{seatId,bbox:[x1,y1,x2,y2],status,assignedStudent,detectedStudent,confidence}]
 * @returns {Promise<Buffer>} JPEG buffer of the annotated image
 */
async function renderAnnotatedImage(baseImage, annotations) {
  const base = sharp(baseImage);
  const meta = await base.metadata();
  const svg = annotationSvg(meta.width, meta.height, annotations);
  return base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

module.exports = { STATUS_COLORS, annotationSvg, renderAnnotatedImage };
