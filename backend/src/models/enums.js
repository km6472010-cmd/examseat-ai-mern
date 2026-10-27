/**
 * Shared enum-like constants (plain JS port of app/models/enums.py).
 * Mongoose doesn't need real enum types -- schema `enum: [...]` validators
 * reference these same arrays, so invalid values are still rejected in
 * Mongo mode exactly like the original SQLAlchemy Enum columns.
 */
'use strict';

const UserRole = { ADMIN: 'admin', INVIGILATOR: 'invigilator', VIEWER: 'viewer' };
const SeatingSource = { CSV: 'csv', MANUAL: 'manual', OCR: 'ocr', DEMO: 'demo' };
const SessionStatus = {
  DRAFT: 'draft',
  READY: 'ready',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};
const EvidenceType = { IMAGE: 'image', VIDEO: 'video' };
const JobStatus = { QUEUED: 'queued', RUNNING: 'running', COMPLETED: 'completed', FAILED: 'failed' };
const VerificationStatus = {
  CORRECT: 'CORRECT',
  EMPTY: 'EMPTY',
  WRONG_SEAT: 'WRONG_SEAT',
  UNASSIGNED: 'UNASSIGNED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};
const ReviewDecision = { CONFIRM: 'confirm', REJECT: 'reject', MARK_EMPTY: 'mark_empty' };
const ReportFormat = { PDF: 'pdf', CSV: 'csv', JSON: 'json' };

module.exports = {
  UserRole,
  SeatingSource,
  SessionStatus,
  EvidenceType,
  JobStatus,
  VerificationStatus,
  ReviewDecision,
  ReportFormat,
};
