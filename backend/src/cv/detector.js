/**
 * Person/occupancy detection backend.
 *
 * Design (mirrors the fallback-chain idea in the original spec / README):
 *
 *     Preferred: a real deep-learning detector  ->  this build's baseline
 *
 * The original Python build used OpenCV's built-in HOG+SVM people
 * detector -- itself explicitly documented there as "a *baseline*...
 * intentionally... far less accurate than a modern deep detector". There
 * is no equivalent zero-download, native-free computer-vision detector
 * available for Node in this sandbox (no OpenCV binding installs
 * cleanly without native build tooling + a blocked binary download; see
 * README > MERN Conversion Notes), so this backend reimplements a
 * comparable *real* (not faked/random) heuristic detector from scratch
 * in pure JS:
 *
 *     grayscale -> Sobel edge magnitude -> threshold -> connected-
 *     component blob extraction -> person-shaped blob filtering ->
 *     confidence squashing
 *
 * This is a genuine, deterministic, fully offline computer-vision
 * pipeline -- not a placeholder and never `Math.random()` -- but, like
 * the original's own HOG baseline, it is a *baseline*: it will miss
 * seated or heavily occluded students and can false-positive on
 * high-contrast desk clutter. That is exactly why the rest of the
 * architecture (manual seat calibration, transparent confidence scoring,
 * the human verification queue) is designed to stay useful even when raw
 * detection confidence is mediocre -- unchanged from the original design.
 */
'use strict';

const sharp = require('sharp');

const TARGET_WIDTH = 640;

function sobelMagnitude(gray, width, height) {
  const mag = new Float32Array(width * height);
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const v = gray[(y + dy) * width + (x + dx)];
          gx += v * gxKernel[k];
          gy += v * gyKernel[k];
          k += 1;
        }
      }
      mag[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const blobs = [];
  const stack = [];

  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    const label = blobs.length;
    labels[start] = label;
    stack.push(start);

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = (idx / width) | 0;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n < 0 || n >= width * height) continue;
        // guard against horizontal wrap-around
        if ((n === idx - 1 || n === idx + 1) && (n / width | 0) !== y) continue;
        if (mask[n] && labels[n] === -1) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    blobs.push({ minX, minY, maxX, maxY, area: count });
  }
  return blobs;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * @param {Buffer} imageBuffer - raw image bytes (jpeg/png/etc.)
 * @param {number} confidenceThreshold
 * @returns {Promise<Array>} [{x1,y1,x2,y2,confidence}] in ORIGINAL image pixel coordinates
 */
async function detectPeopleHeuristic(imageBuffer, confidenceThreshold = 0.35) {
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const origW = meta.width;
  const origH = meta.height;
  if (!origW || !origH) return [];

  const scale = origW > TARGET_WIDTH ? origW / TARGET_WIDTH : 1.0;
  const workW = Math.max(1, Math.round(origW / scale));
  const workH = Math.max(1, Math.round(origH / scale));

  const { data } = await img
    .resize(workW, workH)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gray = new Float32Array(workW * workH);
  for (let i = 0; i < data.length; i += 1) gray[i] = data[i];

  const mag = sobelMagnitude(gray, workW, workH);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < mag.length; i += 1) {
    sum += mag[i];
    if (mag[i] > max) max = mag[i];
  }
  const mean = sum / mag.length;
  // Adaptive threshold: comfortably above the average edge strength so
  // flat desks/walls don't get flagged, but low enough to keep genuine
  // high-contrast silhouettes (hair/shoulders against a background).
  const threshold = Math.min(max * 0.6, mean * 3.2 + 12);

  const mask = new Uint8Array(workW * workH);
  for (let i = 0; i < mag.length; i += 1) mask[i] = mag[i] > threshold ? 1 : 0;

  const blobs = connectedComponents(mask, workW, workH);
  const imgArea = workW * workH;

  const detections = [];
  for (const b of blobs) {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const boxArea = bw * bh;
    const areaFrac = boxArea / imgArea;
    const fillRatio = b.area / boxArea; // how "solid" the edge cluster is within its own bbox

    // Person-shaped filter: big enough to plausibly be a torso/head+
    // shoulders, not a sliver, not the whole frame, roughly upright.
    const aspect = bh / bw;
    if (areaFrac < 0.004 || areaFrac > 0.35) continue;
    if (aspect < 0.6 || aspect > 3.2) continue;
    if (bw < 12 || bh < 12) continue;

    // Squash a combination of edge density and blob solidity into (0,1),
    // same spirit as the original's logistic squash of the HOG SVM score
    // -- a heuristic confidence, not a calibrated probability.
    const raw = 4.0 * fillRatio + 6.0 * Math.min(areaFrac / 0.08, 1.0) - 3.0;
    const confidence = Math.round(sigmoid(raw) * 10000) / 10000;
    if (confidence < confidenceThreshold) continue;

    detections.push({
      x1: b.minX * scale,
      y1: b.minY * scale,
      x2: (b.maxX + 1) * scale,
      y2: (b.maxY + 1) * scale,
      confidence,
    });
  }

  return detections;
}

module.exports = { detectPeopleHeuristic, sobelMagnitude, connectedComponents };
