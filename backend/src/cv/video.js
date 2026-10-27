/**
 * Video pipeline support. Port of backend/app/cv/video.py.
 *
 *     Video -> extract frames -> detect students -> track students ->
 *     map students to seats -> aggregate results across frames ->
 *     final seating verification
 *
 * Frame extraction originally used OpenCV's VideoCapture; here it shells
 * out to the system `ffmpeg`/`ffprobe` binaries (both present in this
 * sandbox) to sample every Nth frame to temporary JPEGs, which are then
 * read back and fed through the same detector/matching pipeline as the
 * image path.
 *
 * `CentroidTracker` is an unchanged, dependency-free port of the classic
 * centroid-distance tracker: it keeps a person from being counted as a
 * "new" student in every single frame just because the detector
 * re-detected them a few pixels off.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsp = fs.promises;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

async function probeFrameCount(videoPath) {
  try {
    const out = await run('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=nb_frames,r_frame_rate,duration',
      '-of', 'default=noprint_wrappers=1',
      videoPath,
    ]);
    const nbFramesMatch = out.match(/nb_frames=(\d+)/);
    if (nbFramesMatch) return parseInt(nbFramesMatch[1], 10);
    const durMatch = out.match(/duration=([\d.]+)/);
    const rateMatch = out.match(/r_frame_rate=(\d+)\/(\d+)/);
    if (durMatch && rateMatch) {
      const fps = parseInt(rateMatch[1], 10) / Math.max(1, parseInt(rateMatch[2], 10));
      return Math.max(1, Math.round(parseFloat(durMatch[1]) * fps));
    }
  } catch {
    // ffprobe unavailable or file unreadable -- fall through to an estimate
  }
  return 0;
}

/**
 * Extracts every `sampleEveryNFrames`-th frame from a video to JPEG files
 * in a temp directory and yields {frameIndex, total, framePath} for each.
 * Cleans up the temp directory when the generator is exhausted.
 */
async function* extractFrames(videoPath, sampleEveryNFrames = 5) {
  const total = await probeFrameCount(videoPath);
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'examseat-frames-'));
  try {
    await run('ffmpeg', [
      '-y', '-i', videoPath,
      '-vf', `select='not(mod(n\\,${sampleEveryNFrames}))'`,
      '-vsync', 'vfr',
      '-q:v', '3',
      path.join(tmpDir, 'frame_%06d.jpg'),
    ]);
    const files = (await fsp.readdir(tmpDir)).filter((f) => f.endsWith('.jpg')).sort();
    let idx = 0;
    for (const f of files) {
      const framePath = path.join(tmpDir, f);
      yield { frameIndex: idx * sampleEveryNFrames, total: total || files.length * sampleEveryNFrames, framePath };
      idx += 1;
    }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

class CentroidTracker {
  constructor(maxDisappeared = 8, maxDistance = 80.0) {
    this.nextId = 0;
    this.objects = new Map(); // id -> {centroid, bbox, confidence, framesSeen, disappeared}
    this.maxDisappeared = maxDisappeared;
    this.maxDistance = maxDistance;
  }

  _register(bbox, confidence) {
    const cx = (bbox[0] + bbox[2]) / 2;
    const cy = (bbox[1] + bbox[3]) / 2;
    const tid = this.nextId;
    this.objects.set(tid, { trackId: tid, centroid: [cx, cy], bbox, confidence, framesSeen: 1, disappeared: 0 });
    this.nextId += 1;
    return tid;
  }

  update(detections) {
    // detections: [[bbox, confidence], ...]
    if (!detections.length) {
      for (const [id, obj] of this.objects) {
        obj.disappeared += 1;
        if (obj.disappeared > this.maxDisappeared) this.objects.delete(id);
      }
      return this.objects;
    }

    const inputCentroids = detections.map(([b]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);

    if (this.objects.size === 0) {
      for (const [bbox, conf] of detections) this._register(bbox, conf);
      return this.objects;
    }

    const objectIds = [...this.objects.keys()];
    const objectCentroids = objectIds.map((id) => this.objects.get(id).centroid);

    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const D = objectCentroids.map((oc) => inputCentroids.map((ic) => dist(oc, ic)));

    const rowOrder = D.map((row, i) => [i, Math.min(...row)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    const usedRows = new Set();
    const usedCols = new Set();

    for (const row of rowOrder) {
      const rowVals = D[row];
      let col = 0;
      let best = Infinity;
      for (let j = 0; j < rowVals.length; j += 1) {
        if (!usedCols.has(j) && rowVals[j] < best) { best = rowVals[j]; col = j; }
      }
      if (usedRows.has(row) || usedCols.has(col) || best === Infinity) continue;
      if (best > this.maxDistance) continue;

      const oid = objectIds[row];
      const [bbox, conf] = detections[col];
      const obj = this.objects.get(oid);
      obj.centroid = inputCentroids[col];
      obj.bbox = bbox;
      obj.confidence = conf;
      obj.framesSeen += 1;
      obj.disappeared = 0;
      usedRows.add(row);
      usedCols.add(col);
    }

    for (let row = 0; row < objectCentroids.length; row += 1) {
      if (usedRows.has(row)) continue;
      const oid = objectIds[row];
      const obj = this.objects.get(oid);
      obj.disappeared += 1;
      if (obj.disappeared > this.maxDisappeared) this.objects.delete(oid);
    }

    for (let col = 0; col < inputCentroids.length; col += 1) {
      if (usedCols.has(col)) continue;
      const [bbox, conf] = detections[col];
      this._register(bbox, conf);
    }

    return this.objects;
  }
}

module.exports = { extractFrames, probeFrameCount, CentroidTracker };
