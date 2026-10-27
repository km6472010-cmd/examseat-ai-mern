/**
 * Application configuration.
 *
 * All settings are overridable via environment variables (see .env.example
 * at the project root). Defaults are chosen so the app runs out-of-the-box
 * with zero external configuration.
 *
 * This is the direct port of the original backend/app/config.py.
 */
'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const BACKEND_DIR = __dirname.endsWith(`${path.sep}src`) ? path.dirname(__dirname) : path.dirname(__dirname);
const PROJECT_ROOT = path.dirname(BACKEND_DIR);

function envStr(name, fallback) {
  return process.env[name] !== undefined ? process.env[name] : fallback;
}
function envFloat(name, fallback) {
  const v = process.env[name];
  return v !== undefined ? parseFloat(v) : fallback;
}
function envInt(name, fallback) {
  const v = process.env[name];
  return v !== undefined ? parseInt(v, 10) : fallback;
}
function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}
function envList(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to comma-split
  }
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const settings = {
  APP_NAME: envStr('APP_NAME', 'ExamSeat AI'),
  ENVIRONMENT: envStr('ENVIRONMENT', 'development'),
  SECRET_KEY: envStr('SECRET_KEY', 'change-me-in-production-please'),
  API_PREFIX: envStr('API_PREFIX', '/api'),
  PORT: envInt('PORT', 8000),
  CORS_ORIGINS: envList('CORS_ORIGINS', ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']),

  // --- Database --------------------------------------------------------
  // MongoDB connection string. Point this at any real MongoDB instance
  // (local mongod, Docker, MongoDB Atlas, ...) -- see README > MERN
  // Conversion Notes for why this cloud build session falls back to an
  // embedded local datastore when this URI can't be reached.
  MONGODB_URI: envStr('MONGODB_URI', 'mongodb://127.0.0.1:27017/examseat'),
  MONGODB_CONNECT_TIMEOUT_MS: envInt('MONGODB_CONNECT_TIMEOUT_MS', 2500),

  // --- Storage -----------------------------------------------------------
  DATA_DIR: path.join(PROJECT_ROOT, 'data'),
  UPLOADS_DIR: path.join(PROJECT_ROOT, 'data', 'uploads'),
  PROCESSED_DIR: path.join(PROJECT_ROOT, 'data', 'processed'),
  DEMO_DIR: path.join(PROJECT_ROOT, 'data', 'demo'),
  REPORTS_DIR: path.join(PROJECT_ROOT, 'reports'),
  MODELS_DIR: path.join(PROJECT_ROOT, 'models'),

  // --- Retention / privacy ------------------------------------------------
  AUTO_DELETE_EVIDENCE: envBool('AUTO_DELETE_EVIDENCE', false),
  RETENTION_DAYS: envInt('RETENTION_DAYS', 30),

  // --- CV / detection ------------------------------------------------------
  DETECTION_BACKEND: envStr('DETECTION_BACKEND', 'heuristic'),
  PERSON_DETECTION_CONFIDENCE_THRESHOLD: envFloat('PERSON_DETECTION_CONFIDENCE_THRESHOLD', 0.35),

  // --- Verification thresholds (all configurable via Settings page) --------
  SEAT_MATCH_MAX_DISTANCE_NORM: envFloat('SEAT_MATCH_MAX_DISTANCE_NORM', 0.12),
  CONFIDENCE_REVIEW_THRESHOLD: envFloat('CONFIDENCE_REVIEW_THRESHOLD', 0.6),
  CONFIDENCE_HIGH_THRESHOLD: envFloat('CONFIDENCE_HIGH_THRESHOLD', 0.8),
  IDENTITY_MATCH_THRESHOLD: envFloat('IDENTITY_MATCH_THRESHOLD', 0.75),
};

function ensureDirectories() {
  for (const d of [
    settings.DATA_DIR,
    settings.UPLOADS_DIR,
    path.join(settings.UPLOADS_DIR, 'classroom'),
    path.join(settings.UPLOADS_DIR, 'evidence'),
    path.join(settings.UPLOADS_DIR, 'ocr'),
    settings.PROCESSED_DIR,
    settings.DEMO_DIR,
    settings.REPORTS_DIR,
    settings.MODELS_DIR,
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

module.exports = { settings, ensureDirectories, PROJECT_ROOT };
