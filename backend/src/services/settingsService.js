/**
 * Runtime-configurable settings. Port of backend/app/services/settings_service.py.
 *
 * Persisted to a small JSON file under DATA_DIR so changes survive a
 * restart without a database migration.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { settings } = require('../config');

const RUNTIME_SETTINGS_PATH = path.join(settings.DATA_DIR, 'runtime_settings.json');

const FIELD_TO_SETTING_ATTR = {
  person_detection_confidence_threshold: 'PERSON_DETECTION_CONFIDENCE_THRESHOLD',
  seat_match_max_distance_norm: 'SEAT_MATCH_MAX_DISTANCE_NORM',
  confidence_review_threshold: 'CONFIDENCE_REVIEW_THRESHOLD',
  confidence_high_threshold: 'CONFIDENCE_HIGH_THRESHOLD',
  identity_match_threshold: 'IDENTITY_MATCH_THRESHOLD',
  auto_delete_evidence: 'AUTO_DELETE_EVIDENCE',
  retention_days: 'RETENTION_DAYS',
};
const EDITABLE_FIELDS = Object.keys(FIELD_TO_SETTING_ATTR);

function loadRuntimeSettings() {
  if (!fs.existsSync(RUNTIME_SETTINGS_PATH)) return;
  try {
    const data = JSON.parse(fs.readFileSync(RUNTIME_SETTINGS_PATH, 'utf-8'));
    for (const [field, value] of Object.entries(data)) {
      const attr = FIELD_TO_SETTING_ATTR[field];
      if (attr) settings[attr] = value;
    }
  } catch {
    // ignore a corrupt/missing runtime settings file, same as the original
  }
}

function getSettingsDict() {
  return {
    detection_backend: settings.DETECTION_BACKEND,
    person_detection_confidence_threshold: settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD,
    seat_match_max_distance_norm: settings.SEAT_MATCH_MAX_DISTANCE_NORM,
    confidence_review_threshold: settings.CONFIDENCE_REVIEW_THRESHOLD,
    confidence_high_threshold: settings.CONFIDENCE_HIGH_THRESHOLD,
    identity_match_threshold: settings.IDENTITY_MATCH_THRESHOLD,
    auto_delete_evidence: settings.AUTO_DELETE_EVIDENCE,
    retention_days: settings.RETENTION_DAYS,
  };
}

function updateSettings(updates) {
  const current = getSettingsDict();
  for (const [field, value] of Object.entries(updates)) {
    if (EDITABLE_FIELDS.includes(field) && value !== null && value !== undefined) {
      current[field] = value;
      settings[FIELD_TO_SETTING_ATTR[field]] = value;
    }
  }
  fs.mkdirSync(path.dirname(RUNTIME_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(current, null, 2));
  return getSettingsDict();
}

module.exports = { loadRuntimeSettings, getSettingsDict, updateSettings };
