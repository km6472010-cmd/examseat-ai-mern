# ExamSeat AI — Intelligent Exam Seating Arrangement Verification System

A computer-vision-assisted tool that helps invigilators verify whether students are sitting in their officially assigned exam seats — and, just as importantly, tells them clearly when it *isn't sure* and a human needs to look.

---

## 1. Problem

During university examinations, students are assigned specific seats according to an official seating arrangement. Invigilators need to verify that students are actually sitting where they're supposed to. A plain person-detector isn't enough: the system has to reason about the *relationship* between a detected student, a physical seat, and that seat's official assignment — not just "is there a person here."

Given classroom photographs or video and the official seating arrangement, the system needs to determine:

1. Which seats are occupied.
2. Which assigned seats are empty.
3. Whether a student appears to be sitting in someone else's seat.
4. Whether the actual seating differs from the official arrangement.
5. Which cases are too uncertain to decide automatically and need a human to check.

## 2. Solution

ExamSeat AI runs the full pipeline described below: it detects seats and students in a classroom photo or video, spatially matches each student to the nearest plausible seat, looks up that seat's official assignment, and runs a transparent, multi-factor confidence-scoring engine to classify each seat as **Correct**, **Empty**, **Wrong Seat**, **Unassigned**, or **Needs Review**. Every classification carries an explanation and a confidence breakdown — nothing is a black box, and nothing below the configured confidence threshold is ever presented as a settled fact.

The system is explicitly **an assistance tool, not an autonomous disciplinary system**. Low-confidence cases are always routed to a Human Verification queue rather than reported as findings.

## 3. Features

- Official seating arrangement input via **CSV upload**, a **manual spreadsheet-style editor**, or **OCR extraction** from a photographed/scanned seating plan (with mandatory human review of extracted rows).
- **Classroom calibration**: upload a classroom photo, auto-lay-out a rows × columns seat grid, then drag every seat into place. Layouts are saved and reusable across future photos/videos of the same room.
- Real, working **person detection** (OpenCV HOG, fully offline — no GPU or model download required) with an architecture that supports swapping in a YOLO backend later without touching calling code.
- A genuine **student-to-seat spatial matching algorithm**: Euclidean distance + IoU + bounding-box containment, combined into a configurable, explainable assignment score, resolved with a one-to-one greedy matching pass (not "always pick the closest seat").
- A **comparison / verification engine** implementing all five classification outcomes with a transparent, multi-factor confidence score — never hiding uncertainty.
- Optional **identity-matching module** (off by default) for when authorized reference images are supplied — with explicit confidence thresholds and a hard rule against ever guessing an identity.
- **Human Verification queue**: every `NEEDS_REVIEW` case, with Confirm / Reject / Mark Empty actions, all recorded for audit.
- **Visual overlays** (green/red/yellow/gray/blue by status) and an **interactive seating map**.
- **Video support**: frame sampling, lightweight centroid tracking, and per-seat evidence aggregation across frames, with live progress reporting.
- **Reports**: PDF / CSV / JSON export with summary stats and a full detailed table.
- A **Demo Mode** that exercises the entire pipeline — including every possible classification outcome — with clearly labeled synthetic data and zero configuration.
- A professional 8-page dashboard UI (Next.js + TypeScript + Tailwind + shadcn/ui-style components).

## 4. Architecture

```
examseat-ai/
├── frontend/            Next.js 15 (App Router) + TypeScript + Tailwind CSS
│   ├── app/              8 pages: dashboard, seating, classroom, verify, results, review, reports, settings
│   ├── components/       ui/ (button, card, table, dialog, ...), layout/, seating/, dashboard/
│   ├── lib/               API client, session context, utils
│   └── types/             Shared TypeScript types mirroring the backend schemas
│
├── backend/              Python + FastAPI
│   ├── app/
│   │   ├── api/           One router per resource (sessions, seating, classroom, verify, jobs, results, reviews, reports, settings, demo)
│   │   ├── models/         SQLAlchemy ORM models (12 tables)
│   │   ├── schemas/        Pydantic request/response models
│   │   ├── services/       Business logic: CSV parsing, seating/classroom persistence, the verification orchestrator, reports, demo data, settings
│   │   ├── cv/              Pure computer-vision logic: detectors, seat calibration, spatial matching, identity, overlay rendering, video/tracking, OCR
│   │   ├── verification/    The comparison engine (classification + confidence scoring) — framework-free, unit tested in isolation
│   │   └── database/        SQLAlchemy engine/session setup
│   └── tests/              pytest suite (41 tests): CSV parsing, matching math, engine classification, full API flows
│
├── models/                Optional local model weights (e.g. a future YOLO backend)
├── data/                   uploads/ processed/ demo/  — evidence images, overlays, synthetic demo assets
├── reports/                Generated PDF/CSV/JSON reports
├── docker-compose.yml      Postgres + backend + frontend
└── .env.example
```

Computer-vision logic (`app/cv/`, `app/verification/`) is kept completely separate from persistence and API concerns (`app/api/`, `app/services/`, `app/models/`) — every CV/verification function is a plain, framework-free Python function that can (and is) unit tested without a database or an HTTP client.

### High-level architecture

```mermaid
flowchart LR
    subgraph Frontend["Next.js Frontend"]
        UI["8 pages\n(Dashboard, Seating, Classroom,\nVerify, Results, Review, Reports, Settings)"]
    end

    subgraph Backend["FastAPI Backend"]
        API["API routers"]
        SVC["Services\n(orchestration)"]
        CV["CV layer\n(detection, matching, OCR, overlay)"]
        ENGINE["Verification engine\n(classification + confidence)"]
        DB[(SQLAlchemy ORM)]
    end

    STORE[("SQLite / PostgreSQL")]
    FILES[("Local filesystem\ndata/, reports/")]

    UI <-->|REST + JSON, multipart uploads| API
    API --> SVC
    SVC --> CV
    SVC --> ENGINE
    SVC --> DB
    DB <--> STORE
    SVC --> FILES
    API -->|/media/*| FILES
```

## 5. AI pipeline

```mermaid
flowchart TD
    A["Classroom photo or video"] --> B["Seat detection / seat mapping\n(manual calibration or grid auto-layout)"]
    A --> C["Student detection\n(OpenCV HOG person detector)"]
    B --> D["Student-to-Seat Assignment\n(distance + IoU + containment, one-to-one match)"]
    C --> D
    D --> E["Official Seating Arrangement Lookup"]
    E --> F["Comparison Engine\n(CORRECT / EMPTY / WRONG_SEAT / UNASSIGNED / NEEDS_REVIEW)"]
    F --> G["Confidence Scoring\n(detection + seat-match + identity + spatial consistency)"]
    G -->|"confidence < threshold"| H["Human Verification Queue"]
    G -->|"confidence >= threshold"| I["Dashboard + Seating Map + Report"]
    H --> I
```

Every stage above corresponds to a real module, not a placeholder:

| Stage | Module |
|---|---|
| Person detection | `backend/app/cv/detectors.py` (`OpenCVHOGDetector`, pluggable `YoloDetector` interface) |
| Seat calibration / auto-layout | `backend/app/cv/seats.py` |
| Spatial matching | `backend/app/cv/matching.py` |
| Optional identity matching | `backend/app/cv/identity.py` (Mode 2 only, off by default) |
| Video frame sampling + tracking | `backend/app/cv/video.py` |
| Seating-plan OCR | `backend/app/cv/ocr.py` |
| Comparison + confidence engine | `backend/app/verification/engine.py` |
| Pipeline orchestration | `backend/app/services/verification_service.py` |
| Visual overlay rendering | `backend/app/cv/overlay.py` |

## 6. Installation

Requirements: **Python 3.11+**, **Node.js 20+**, and (optionally) **Docker** for the one-command Postgres deployment. `tesseract-ocr` must be installed on the system for the OCR seating-plan feature (`apt install tesseract-ocr` / `brew install tesseract`) — every other feature works without it.

```bash
git clone <this repo>
cd examseat-ai
cp .env.example backend/.env        # optional -- sensible defaults ship out of the box
cp .env.example frontend/.env.local # keep only NEXT_PUBLIC_API_URL
```

## 7. Environment variables

See `.env.example` (root), `backend/.env.example`, and `frontend/.env.example`. The short version: everything has a working default — `DATABASE_URL` defaults to a local SQLite file and `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`. Every backend variable is documented inline in `backend/app/config.py`.

## 8. Running the backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is now live at `http://localhost:8000` and interactive docs (see section 13) at `http://localhost:8000/docs`. Tables are created automatically on first startup (see section 10).

## 9. Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend expects the backend to be reachable at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

### Running both with Docker Compose

```bash
docker compose up --build
```

This starts Postgres, the backend (pointed at Postgres via `DATABASE_URL`), and the frontend together — frontend on `:3000`, backend on `:8000`.

## 10. Database setup

The backend defaults to **SQLite** (`data/examseat.db`) with zero setup — tables are created automatically via `SQLAlchemy`'s `create_all()` on startup (`app/database/session.py:init_db`). To use **PostgreSQL** instead, set `DATABASE_URL` to a Postgres DSN, e.g.:

```
DATABASE_URL=postgresql+psycopg2://examseat:examseat@localhost:5432/examseat
```

The schema (12 tables: `users`, `exam_sessions`, `seating_plans`, `seats`, `students`, `seat_assignments`, `classroom_layouts`, `detections`, `verification_results`, `human_reviews`, `processing_jobs`, `reports`) is defined with SQLAlchemy 2.0-style models under `backend/app/models/` and works identically against either database — no raw SQL, no engine-specific features.

## 11. Model setup

No model download is required. The default `DETECTION_BACKEND=opencv` uses OpenCV's built-in HOG people-detector, which ships with the `opencv-python-headless` package already in `requirements.txt`.

The architecture supports a future YOLO backend (`app/cv/detectors.py:YoloDetector`) without any changes to calling code: install `ultralytics`, place weights under `models/`, and set `DETECTION_BACKEND=yolo`. If `ultralytics` isn't installed, the factory function automatically falls back to the OpenCV detector and logs a warning — the app never crashes because a model is unavailable (spec requirement: GPU YOLO → CPU YOLO → fallback detection / manual calibration).

## 12. Demo mode

Click **"Run Demo"** in the top bar (or on the empty-state Dashboard) — no configuration needed. This generates:

- A synthetic classroom photo (drawn with OpenCV, clearly labeled "SYNTHETIC DEMO CLASSROOM" in the image itself).
- A 20-seat official seating arrangement.
- A full set of verification results that intentionally exercise **every** classification outcome (`CORRECT` via both identity-verified and identity-unverified paths, `EMPTY`, an `EMPTY` seat with a flagged near-miss conflict, `WRONG_SEAT`, `UNASSIGNED`, and `NEEDS_REVIEW`).

Every session, seat, and result this creates is flagged `is_demo: true` and shown with a "Synthetic Demo Data" badge in the UI. Honesty note: the *decision logic* is 100% real — every demo row is classified by the exact same `classify_seat()` function a live camera verification uses (see `backend/app/services/demo_service.py` for the full explanation of what's synthetic and why).

## 13. API documentation

FastAPI generates interactive docs automatically:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

Key endpoints (see `backend/app/api/*.py` for the complete set):

```
POST   /api/sessions                          Create an exam session
GET    /api/sessions                          List sessions (with live summary stats)
GET    /api/sessions/{id}                     Get one session + summary
PATCH  /api/sessions/{id}                     Update a session (e.g. link a classroom layout)
DELETE /api/sessions/{id}                     Delete a session and all its data

POST   /api/seating/upload                    Upload a seating CSV
POST   /api/seating/manual                    Save a manually-edited seating plan
POST   /api/seating/ocr/extract               OCR-extract a seating plan photo (review before saving)
POST   /api/seating/ocr/confirm               Save reviewed/corrected OCR rows
GET    /api/seating/{session_id}               Get the active seating plan

POST   /api/classroom/upload-image            Upload a classroom reference photo
POST   /api/classroom/auto-detect             Grid-suggest seat regions
POST   /api/classroom/calibrate               Save a classroom layout
PUT    /api/classroom/calibrate/{layout_id}    Update a layout
GET    /api/classroom/layouts                 List reusable layouts

POST   /api/verify/image                      Run verification on a photo (synchronous)
POST   /api/verify/video                      Run verification on a video (background job)
GET    /api/jobs/{job_id}                     Poll job status/progress

GET    /api/results/{session_id}               Latest verification result per seat
GET    /api/reviews/{session_id}               Human Verification queue
POST   /api/reviews/{result_id}/confirm|reject|mark-empty

GET    /api/reports/{session_id}?format=pdf|csv|json   Download a report
GET    /api/settings   PUT /api/settings       Runtime-configurable thresholds
POST   /api/demo/run                          Generate a demo session
```

## 14. Testing

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

41 tests covering:

- **CSV parsing** (`tests/test_csv_parsing.py`) — valid files, missing columns, duplicate/missing seat IDs, non-integer rows, unassigned seats.
- **Spatial matching math** (`tests/test_matching.py`) — Euclidean distance, IoU, containment, candidate scoring, one-to-one assignment, unusable seats.
- **Verification engine classification** (`tests/test_verification_engine.py`) — every status (correct with/without identity, wrong seat, empty, empty-with-conflict, unassigned, needs-review), confidence bounding.
- **Full API flows** (`tests/test_api.py`) — session CRUD, CSV upload, manual editor, classroom calibration, the full demo pipeline end-to-end, the human-review queue and its confirm/reject actions, all three report formats, settings persistence.

The frontend is verified with `npm run build` (production TypeScript build) and `npm run lint`, plus an end-to-end Playwright smoke pass through every page and the full session → seating → calibration → verification → results workflow during development.

## 15. Future improvements

- Swap in a proper deep-learning detector (YOLOv8/RT-DETR) once GPU/network constraints allow — the `YoloDetector` interface is already in place.
- Replace the color-histogram identity-matching baseline with a real face-embedding model (FaceNet/ArcFace-style), still gated behind explicit opt-in and authorized reference images.
- A true Hungarian-algorithm optimum for seat assignment instead of the current greedy approximation (functionally equivalent at classroom scale, but worth it at very high seat counts).
- Background job queue (Celery/RQ) for image verification too, with WebSocket progress instead of polling.
- Role-based auth (the `users` table and `UserRole` enum already exist; there's no login flow wired up yet).
- Multi-camera / multi-angle fusion for a single seating check.

## 16. Limitations

- The default OpenCV HOG detector is a *baseline*: meaningfully less accurate than a modern deep detector, especially for seated, partially occluded, or unusually angled students. This is why manual seat calibration and the Human Verification queue are first-class features, not afterthoughts.
- Automatic seat-region detection from a single photo is a grid heuristic, not real furniture segmentation — it's a starting point for the calibration UI, always meant to be corrected by a human.
- The identity-matching module is a documented placeholder (an HSV color-histogram signature), not production-grade face recognition. It is off by default.
- Video processing samples frames rather than analyzing every one, and aggregates per-seat evidence with a lightweight centroid tracker rather than a state-of-the-art multi-object tracker.
- Assignment is one detection per seat (no support yet for two people crowding one seat as a distinct case).

## 17. Privacy considerations

- Uploaded evidence (photos/videos) is stored on the local filesystem under `data/`, never made public, and served only through the app's own `/media/*` routes.
- `AUTO_DELETE_EVIDENCE` + `RETENTION_DAYS` (Settings page) let a deployment automatically purge evidence after a configurable window — off by default so a first run has no surprises, but should be turned on for real deployments.
- Deleting an exam session (`DELETE /api/sessions/{id}`) cascades to all of its seating plans, jobs, detections, and verification results.
- Identity matching is **opt-in only** and requires explicitly supplied, authorized reference images — it is never inferred or guessed.
- Every result the AI is not confident about is routed to Human Verification rather than reported as a finding — this system assists an invigilator's judgment, it does not replace it or make disciplinary decisions on its own.
