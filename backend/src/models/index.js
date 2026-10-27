/**
 * Mongoose schema/model definitions -- direct port of the 12 SQLAlchemy
 * models under the original backend/app/models/*.py, using the shared
 * defineModel() factory (see src/db/modelFactory.js) so every model works
 * identically whether this run is connected to real MongoDB or, in a
 * network-restricted sandbox, the embedded local-store fallback.
 *
 * Foreign keys are plain String fields holding another document's `_id`
 * (rather than mongoose.Schema.Types.ObjectId) so lookups behave exactly
 * the same in both backends.
 */
'use strict';

const { defineModel } = require('../db/modelFactory');
const {
  UserRole,
  SeatingSource,
  SessionStatus,
  EvidenceType,
  JobStatus,
  VerificationStatus,
  ReviewDecision,
  ReportFormat,
} = require('./enums');

const User = defineModel('User', {
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  hashedPassword: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.INVIGILATOR },
});

const ExamSession = defineModel('ExamSession', {
  examName: { type: String, required: true },
  room: { type: String, required: true },
  examDate: { type: String, required: true }, // ISO date string, kept simple across both backends
  status: { type: String, enum: Object.values(SessionStatus), default: SessionStatus.DRAFT },
  seatCount: { type: Number, default: 0 },
  isDemo: { type: Boolean, default: false },
  createdBy: { type: String, default: null },
  classroomLayoutId: { type: String, default: null },
});

const Student = defineModel('Student', {
  studentId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  referenceImagePath: { type: String, default: null },
  embedding: { type: String, default: null },
});

const SeatingPlan = defineModel('SeatingPlan', {
  sessionId: { type: String, required: true, index: true },
  source: { type: String, enum: Object.values(SeatingSource), default: SeatingSource.CSV },
  isActive: { type: Boolean, default: true },
  rawFilename: { type: String, default: null },
});

const Seat = defineModel('Seat', {
  seatingPlanId: { type: String, required: true, index: true },
  seatId: { type: String, required: true, index: true },
  row: { type: Number, required: true },
  column: { type: Number, required: true },
  isUsable: { type: Boolean, default: true },
  assignedStudentId: { type: String, default: null },
  assignedStudentName: { type: String, default: null },
});

const ClassroomLayout = defineModel('ClassroomLayout', {
  name: { type: String, required: true },
  room: { type: String, default: null },
  referenceImagePath: { type: String, default: null },
  referenceWidth: { type: Number, default: null },
  referenceHeight: { type: Number, default: null },
  seatsJson: { type: String, default: '[]' },
  calibrationMethod: { type: String, default: 'manual' },
});

const ProcessingJob = defineModel('ProcessingJob', {
  sessionId: { type: String, required: true, index: true },
  evidenceType: { type: String, enum: Object.values(EvidenceType), required: true },
  evidencePath: { type: String, required: true },
  status: { type: String, enum: Object.values(JobStatus), default: JobStatus.QUEUED },
  progressPercent: { type: Number, default: 0 },
  framesTotal: { type: Number, default: 1 },
  framesProcessed: { type: Number, default: 0 },
  studentsDetected: { type: Number, default: 0 },
  seatsAnalyzed: { type: Number, default: 0 },
  errorMessage: { type: String, default: null },
  startedAt: { type: String, default: null },
  finishedAt: { type: String, default: null },
});

const Detection = defineModel('Detection', {
  jobId: { type: String, required: true, index: true },
  frameNumber: { type: Number, default: 0 },
  trackId: { type: Number, default: null },
  bboxX1: { type: Number, required: true },
  bboxY1: { type: Number, required: true },
  bboxX2: { type: Number, required: true },
  bboxY2: { type: Number, required: true },
  detectionConfidence: { type: Number, required: true },
  detectedIdentityStudentId: { type: String, default: null },
  identityConfidence: { type: Number, default: null },
});

const SeatAssignment = defineModel('SeatAssignment', {
  detectionId: { type: String, required: true, index: true },
  seatId: { type: String, required: true },
  classroomLayoutId: { type: String, required: true },
  distanceNorm: { type: Number, required: true },
  iou: { type: Number, default: 0 },
  containment: { type: Number, default: 0 },
  assignmentConfidence: { type: Number, required: true },
});

const VerificationResult = defineModel('VerificationResult', {
  sessionId: { type: String, required: true, index: true },
  jobId: { type: String, default: null },
  seatId: { type: String, required: true, index: true },
  assignedStudentId: { type: String, default: null },
  assignedStudentName: { type: String, default: null },
  detectedStudentId: { type: String, default: null },
  detectionId: { type: String, default: null },
  status: { type: String, enum: Object.values(VerificationStatus), required: true },
  detectionConfidence: { type: Number, default: 0 },
  seatMatchConfidence: { type: Number, default: 0 },
  identityConfidence: { type: Number, default: 0 },
  spatialConsistency: { type: Number, default: 0 },
  overallConfidence: { type: Number, default: 0 },
  evidenceImagePath: { type: String, default: null },
  explanation: { type: String, default: null },
});

const HumanReview = defineModel('HumanReview', {
  verificationResultId: { type: String, required: true, unique: true, index: true },
  reviewer: { type: String, default: 'invigilator' },
  decision: { type: String, enum: Object.values(ReviewDecision), required: true },
  notes: { type: String, default: null },
  decidedAt: { type: String, default: null },
});

const Report = defineModel('Report', {
  sessionId: { type: String, required: true, index: true },
  format: { type: String, enum: Object.values(ReportFormat), required: true },
  filePath: { type: String, required: true },
});

module.exports = {
  User,
  ExamSession,
  Student,
  SeatingPlan,
  Seat,
  ClassroomLayout,
  ProcessingJob,
  Detection,
  SeatAssignment,
  VerificationResult,
  HumanReview,
  Report,
};
