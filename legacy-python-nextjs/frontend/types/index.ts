export type SessionStatus = "draft" | "ready" | "processing" | "completed" | "archived";

export interface ExamSessionSummary {
  id: number;
  exam_name: string;
  room: string;
  exam_date: string;
  status: SessionStatus;
  seat_count: number;
  is_demo: boolean;
  classroom_layout_id: number | null;
  created_at: string;
  updated_at: string;
  total_seats: number;
  occupied: number;
  empty: number;
  correct: number;
  wrong_seat: number;
  unassigned: number;
  needs_review: number;
  accuracy_pct: number;
}

export interface SeatOut {
  id: number;
  seat_id: string;
  row: number;
  column: number;
  is_usable: boolean;
  assigned_student_id: string | null;
  assigned_student_name: string | null;
}

export interface SeatingPlanOut {
  id: number;
  session_id: number;
  source: "csv" | "manual" | "ocr" | "demo";
  is_active: boolean;
  raw_filename: string | null;
  created_at: string;
  seats: SeatOut[];
}

export interface SeatRegion {
  seat_id: string;
  row: number;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
  is_usable: boolean;
}

export interface ClassroomLayoutOut {
  id: number;
  name: string;
  room: string | null;
  reference_image_path: string | null;
  reference_width: number | null;
  reference_height: number | null;
  calibration_method: string;
  seats: SeatRegion[];
  created_at: string;
  updated_at: string;
}

export type VerificationStatus = "CORRECT" | "EMPTY" | "WRONG_SEAT" | "UNASSIGNED" | "NEEDS_REVIEW";

export interface VerificationResultOut {
  id: number;
  session_id: number;
  job_id: number | null;
  seat_id: string;
  assigned_student_id: string | null;
  assigned_student_name: string | null;
  detected_student_id: string | null;
  status: VerificationStatus;
  detection_confidence: number;
  seat_match_confidence: number;
  identity_confidence: number;
  spatial_consistency: number;
  overall_confidence: number;
  evidence_image_path: string | null;
  explanation: string | null;
  created_at: string;
}

export interface ProcessingJobOut {
  id: number;
  session_id: number;
  evidence_type: "image" | "video";
  status: "queued" | "running" | "completed" | "failed";
  progress_percent: number;
  frames_total: number;
  frames_processed: number;
  students_detected: number;
  seats_analyzed: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface ReviewOut {
  id: number;
  verification_result_id: number;
  reviewer: string;
  decision: string;
  notes: string | null;
  decided_at: string;
}

export interface AppSettings {
  detection_backend: string;
  person_detection_confidence_threshold: number;
  seat_match_max_distance_norm: number;
  confidence_review_threshold: number;
  confidence_high_threshold: number;
  identity_match_threshold: number;
  auto_delete_evidence: boolean;
  retention_days: number;
}

export interface ReportSummary {
  exam_name: string;
  room: string;
  exam_date: string;
  total_seats: number;
  occupied: number;
  empty: number;
  correct: number;
  wrong_seat: number;
  unassigned: number;
  needs_review: number;
  accuracy_pct: number;
}
