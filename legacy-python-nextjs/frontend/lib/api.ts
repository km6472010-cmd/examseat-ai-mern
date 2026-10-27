import type {
  AppSettings,
  ClassroomLayoutOut,
  ExamSessionSummary,
  ProcessingJobOut,
  ReportSummary,
  ReviewOut,
  SeatingPlanOut,
  VerificationResultOut,
} from "@/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.blob() as unknown as T;
}

export function overlayUrl(jobId: number | null | undefined): string | null {
  if (!jobId) return null;
  return `${API_BASE}/media/processed/job_${jobId}_overlay.jpg`;
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // Backend stores absolute filesystem paths; map anything under data/{uploads,processed,demo}
  // to the corresponding public /media/* static route.
  const marker = "/data/";
  const idx = path.indexOf(marker);
  const rel = idx >= 0 ? path.slice(idx + marker.length) : path;
  return `${API_BASE}/media/${rel}`;
}

export const api = {
  // Sessions
  listSessions: () => request<ExamSessionSummary[]>("/api/sessions"),
  getSession: (id: number) => request<ExamSessionSummary>(`/api/sessions/${id}`),
  createSession: (data: { exam_name: string; room: string; exam_date: string }) =>
    request<ExamSessionSummary>("/api/sessions", { method: "POST", body: JSON.stringify(data) }),
  updateSession: (id: number, data: Record<string, unknown>) =>
    request<ExamSessionSummary>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  // Seating
  getSeatingPlan: (sessionId: number) => request<SeatingPlanOut>(`/api/seating/${sessionId}`).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }),
  uploadSeatingCsv: (sessionId: number, file: File) => {
    const fd = new FormData();
    fd.append("session_id", String(sessionId));
    fd.append("file", file);
    return request<{ seating_plan: SeatingPlanOut; warnings: { row_number: number; message: string }[]; rows_parsed: number; rows_skipped: number }>(
      "/api/seating/upload",
      { method: "POST", body: fd }
    );
  },
  saveManualSeating: (
    sessionId: number,
    seats: { seat_id: string; row: number; column: number; student_id?: string | null; student_name?: string | null; is_usable?: boolean }[]
  ) =>
    request<SeatingPlanOut>(`/api/seating/manual?session_id=${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ seats }),
    }),
  ocrExtractSeating: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ rows: Record<string, unknown>[]; warnings: string[]; raw_text: string }>("/api/seating/ocr/extract", {
      method: "POST",
      body: fd,
    });
  },
  ocrConfirmSeating: (sessionId: number, seats: Record<string, unknown>[]) =>
    request<SeatingPlanOut>(`/api/seating/ocr/confirm?session_id=${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ seats }),
    }),

  // Classroom
  listLayouts: () => request<ClassroomLayoutOut[]>("/api/classroom/layouts"),
  getLayout: (id: number) => request<ClassroomLayoutOut>(`/api/classroom/layouts/${id}`),
  uploadClassroomImage: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ path: string; width: number; height: number }>("/api/classroom/upload-image", {
      method: "POST",
      body: fd,
    });
  },
  autoDetectSeats: (file: File, rows: number, columns: number) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("rows", String(rows));
    fd.append("columns", String(columns));
    return request<{ seats: ClassroomLayoutOut["seats"]; method: string; confidence_note: string }>(
      "/api/classroom/auto-detect",
      { method: "POST", body: fd }
    );
  },
  calibrateClassroom: (data: {
    name: string;
    room?: string;
    reference_width?: number;
    reference_height?: number;
    seats: ClassroomLayoutOut["seats"];
    calibration_method?: string;
  }, referenceImagePath?: string) =>
    request<ClassroomLayoutOut>(
      `/api/classroom/calibrate${referenceImagePath ? `?reference_image_path=${encodeURIComponent(referenceImagePath)}` : ""}`,
      { method: "POST", body: JSON.stringify(data) }
    ),
  updateCalibration: (layoutId: number, data: ClassroomLayoutOut) =>
    request<ClassroomLayoutOut>(`/api/classroom/calibrate/${layoutId}`, { method: "PUT", body: JSON.stringify(data) }),

  // Verify
  verifyImage: (sessionId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<VerificationResultOut[]>(`/api/verify/image?session_id=${sessionId}`, { method: "POST", body: fd });
  },
  verifyVideo: (sessionId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ProcessingJobOut>(`/api/verify/video?session_id=${sessionId}`, { method: "POST", body: fd });
  },

  // Jobs
  getJob: (id: number) => request<ProcessingJobOut>(`/api/jobs/${id}`),
  listJobsForSession: (sessionId: number) => request<ProcessingJobOut[]>(`/api/jobs/session/${sessionId}`),

  // Results
  getResults: (sessionId: number) => request<VerificationResultOut[]>(`/api/results/${sessionId}`),

  // Reviews
  getReviewQueue: (sessionId: number) => request<VerificationResultOut[]>(`/api/reviews/${sessionId}`),
  confirmReview: (resultId: number, notes?: string) =>
    request<ReviewOut>(`/api/reviews/${resultId}/confirm`, { method: "POST", body: JSON.stringify({ decision: "confirm", notes }) }),
  rejectReview: (resultId: number, notes?: string) =>
    request<ReviewOut>(`/api/reviews/${resultId}/reject`, { method: "POST", body: JSON.stringify({ decision: "reject", notes }) }),
  markEmptyReview: (resultId: number, notes?: string) =>
    request<ReviewOut>(`/api/reviews/${resultId}/mark-empty`, { method: "POST", body: JSON.stringify({ decision: "mark_empty", notes }) }),

  // Reports
  getReportSummary: (sessionId: number) => request<ReportSummary>(`/api/reports/${sessionId}/summary`),
  downloadReportUrl: (sessionId: number, format: "pdf" | "csv" | "json") =>
    `${API_BASE}/api/reports/${sessionId}?format=${format}`,

  // Settings
  getSettings: () => request<AppSettings>("/api/settings"),
  updateSettings: (data: Partial<AppSettings>) => request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Demo
  runDemo: () => request<ExamSessionSummary>("/api/demo/run", { method: "POST" }),
};
