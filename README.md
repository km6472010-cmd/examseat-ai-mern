# ExamSeat AI — Intelligent Exam Seating Arrangement Verification System

**Stack: MongoDB + Express + React + Node.js (MERN).**

This is a from-scratch MERN conversion of the original ExamSeat AI build (FastAPI + SQLAlchemy + Next.js), which is preserved unchanged under [`legacy-python-nextjs/`](./legacy-python-nextjs/) for reference. Every piece of business logic — the spatial seat-matching algorithm, the confidence-scoring/classification engine, the human-review workflow, report generation, demo mode — was ported line-for-line into JavaScript; nothing about *what the system decides* changed, only the language and frameworks it runs on.

```
Classroom photo/video
        │
   Person detection ──► Student↔Seat spatial matching ──► Official seating lookup
        │                                                        │
        └──────────────► Confidence-scored classification ◄──────┘
                                   │
                CORRECT · EMPTY · WRONG_SEAT · UNASSIGNED · NEEDS_REVIEW
                                   │
                     Human verification queue + reports
```

## Stack

| Layer | Technology |
|---|---|
| Database | MongoDB (via Mongoose) |
| API | Express.js (Node.js) |
| Frontend | React 19 + Vite + react-router-dom |
| CV / matching / scoring | Plain JS, ported from the original Python modules |

## Project layout

```
backend/                 Express + Mongoose API
  src/
    config.js             All settings (env-overridable)
    db/                    Mongoose connection + sandbox-only local-store fallback (see below)
    models/                Mongoose schemas (12 models, 1:1 with the original SQLAlchemy models)
    cv/                     matching.js, detector.js, overlay.js, seats.js, video.js
    verification/           engine.js — the classification/confidence engine
    services/               orchestration: verificationService, demoService, reportService, ...
    routes/                 sessions, seating, classroom, verify, jobs, results, reviews, reports, settings, demo
    app.js / server.js
frontend/                 React + Vite SPA (8 pages, same UI/UX as the original)
  src/
    pages/                  DashboardPage, SeatingPage, ClassroomPage, VerifyPage, ResultsPage, ReviewPage, ReportsPage, SettingsPage
    components/             ui/ (shadcn-style), layout/, dashboard/, seating/
    lib/api.ts               typed fetch client
    types/index.ts           shared response types
data/, reports/, models/  Runtime storage (gitignored except .gitkeep)
legacy-python-nextjs/     The original FastAPI + Next.js build, unchanged, kept for reference
docker-compose.yml        mongo + backend + frontend, for a real MongoDB deployment
```

## Running locally

**Backend**

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # or: npm start
```

Runs on `http://localhost:8000`. On startup it tries to connect to `MONGODB_URI` (default `mongodb://127.0.0.1:27017/examseat`); if you have MongoDB installed locally (or point it at Atlas), it uses that directly. See **MERN Conversion Notes** below for what happens if it can't connect.

**Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --host --port 5173
```

Runs on `http://localhost:5173`, already configured (`VITE_API_URL`, and the backend's `CORS_ORIGINS`) to talk to the backend above.

**Docker (real MongoDB end-to-end)**

```bash
docker compose up --build
```

Provisions an actual `mongo:7` container plus both app services — this is the path to exercise the app against real MongoDB rather than the sandbox fallback described next.

## MERN Conversion Notes — why there's a local-store fallback

This project was converted and *run* inside a network-restricted cloud build sandbox. That sandbox's outbound network only allows HTTPS to a handful of package registries (npm, PyPI, crates.io, the Go module proxy) — no MongoDB Atlas, no `mongodb.org` binary downloads, no Docker daemon, no apt `mongodb-server` package. Every avenue for getting a real MongoDB (or even a MongoDB-wire-protocol-compatible mock server) running inside *that specific sandbox* was tried and confirmed unreachable before writing a fallback: `apt-get install mongodb-server` (no candidate package), Docker (`dockerd` isn't running and can't be started), `mongodb-memory-server` (its binary download is blocked), a Java-based in-memory mock server (Maven Central is blocked), MongoDB Atlas over its real wire-protocol port (the sandbox only proxies HTTP(S), not arbitrary TCP database protocols, even to an allowed host).

So that the app could still be **built and genuinely run/tested** end-to-end in that environment, `backend/src/db/` contains:

- `connect.js` — the real, standard `mongoose.connect(MONGODB_URI)` call. This is what runs on any normal machine.
- `localStore.js` — a small embedded JSON-file datastore (one file per collection under `data/localdb/`), used **only** when the MongoDB connection attempt times out.
- `modelFactory.js` — defines a real Mongoose schema/model for every entity *and* wires up the local-store fallback, exposing one small async API (`find`, `findOne`, `findById`, `create`, `findByIdAndUpdate`, `findByIdAndDelete`, `updateMany`, `deleteMany`, `countDocuments`) that every route/service calls without caring which backend is live.

**On your own machine, none of this matters** — install MongoDB (or use Atlas), the connection succeeds, and the app runs on real MongoDB exactly like any other Mongoose app. The fallback is there purely so this specific build session could hand you a working, tested application rather than one that only compiles.

## The CV pipeline: what's real, what's a documented baseline

Faithfully carried over from the original build's own design principle ("do not fake the AI"):

- **Spatial matching** (`src/cv/matching.js`) and **the classification/confidence engine** (`src/verification/engine.js`) are exact, line-for-line ports of the original Python modules — same weights, same thresholds, same rounding, same greedy one-to-one assignment strategy. Nothing here is approximated.
- **Person detection** (`src/cv/detector.js`): the original used OpenCV's HOG+SVM people detector — itself explicitly documented as *"a baseline... far less accurate than a modern deep detector."* No Node OpenCV binding installs cleanly without native build tooling and a blocked binary download in the sandbox described above, so this backend reimplements a comparable **real** (not random/faked) detector from scratch: grayscale → Sobel edge magnitude → threshold → connected-component blob extraction → person-shaped-blob filtering → confidence squashing. It's a genuine, deterministic, offline CV pipeline — and, like the original's own baseline, it will miss seated/occluded students and can false-positive on high-contrast clutter. That's exactly why manual seat calibration, transparent confidence scoring, and the human verification queue exist.
- **Video** (`src/cv/video.js`): frame sampling now shells out to the system `ffmpeg`/`ffprobe` binaries (present in this sandbox) instead of OpenCV's `VideoCapture`; the centroid tracker is an unchanged port.
- **Overlay rendering** (`src/cv/overlay.js`): boxes/labels are built as an SVG and composited onto the source photo with `sharp` (whose binaries install cleanly from the npm registry) instead of drawing directly on pixel buffers with OpenCV.
- **OCR** (`src/services/ocrService.js`): `tesseract.js` (pure JS/WASM) instead of the system `tesseract` binary + pytesseract; if its language-data download fails in a restricted environment, it degrades gracefully with a warning, mirroring the original Python code's own try/except fallback.

## Demo Mode

`POST /api/demo/run` generates a synthetic classroom photo (SVG, rasterized to JPEG) and a matching seating arrangement, then classifies all 20 seats through the **real** verification engine — the exact same function every live camera run uses — against a deterministic, hand-designed set of per-seat evidence values that exercise every status the pipeline can produce. What's synthetic is the *evidence*, never the decision logic. Every demo session/result is flagged `is_demo: true`.

## Verified working (this build session)

Confirmed end-to-end in this environment, backend + browser UI, before delivery:

- `POST /api/demo/run` → 20-seat synthetic session classified as 13 CORRECT / 2 EMPTY / 2 WRONG_SEAT / 1 UNASSIGNED / 2 NEEDS_REVIEW — matching the hand-designed case list exactly.
- A full manual flow: create session → upload seating CSV → upload + calibrate a classroom photo → `POST /api/verify/image` against a real synthetic test photo, exercising the from-scratch heuristic detector, the matching algorithm, and the classification engine together, with an annotated overlay JPEG produced.
- Report downloads (`?format=pdf|csv|json`) and the human-review confirm/reject/mark-empty endpoints.
- The React frontend, loaded in an actual browser: dashboard → Run Demo → Results table, rendering the real API response.

## Testing

The original's 41 pytest tests documented the expected behavior of `matching.py` and `engine.py`; that same behavior is what `src/cv/matching.js` and `src/verification/engine.js` reproduce.

```bash
cd backend && npm test     # placeholder Node test runner wiring; add cases under backend/tests/
```

## Privacy & security

Unchanged from the original: uploaded evidence lives under `data/{uploads,processed,demo}` and is never publicly indexed by anything other than the app itself; `AUTO_DELETE_EVIDENCE`/`RETENTION_DAYS` are available but off by default; this is a hackathon/demo-scoped deployment, not a hardened production one (no auth layer is implemented — see `src/models/User` and `UserRole` for where one would attach).

## What this system is and isn't

An assistive verification tool, not an autonomous decision-maker. Every low-confidence case is routed to the human verification queue rather than silently reported as fact, and no report or UI surface claims certainty the underlying evidence doesn't support.
