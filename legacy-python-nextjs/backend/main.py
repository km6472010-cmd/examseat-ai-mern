"""ExamSeat AI backend entrypoint.

Run with:  uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import classroom, demo, jobs, reports, results, reviews, seating, sessions, settings as settings_api, verify
from app.config import settings
from app.database.session import init_db
from app.services.settings_service import load_runtime_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("examseat")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_directories()
    load_runtime_settings()
    init_db()
    logger.info("ExamSeat AI backend started. Detection backend: %s", settings.DETECTION_BACKEND)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Intelligent Exam Seating Arrangement Verification System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error.", "error_code": "internal_error"})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


app.include_router(sessions.router)
app.include_router(seating.router)
app.include_router(classroom.router)
app.include_router(verify.router)
app.include_router(jobs.router)
app.include_router(results.router)
app.include_router(reviews.router)
app.include_router(reports.router)
app.include_router(settings_api.router)
app.include_router(demo.router)

# Serve uploaded/processed/demo evidence images so the frontend can render
# overlays, seating-plan scans, etc. Never publicly indexed -- see README >
# Privacy for production hardening notes (auth, signed URLs, retention).
app.mount("/media/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")
app.mount("/media/processed", StaticFiles(directory=str(settings.PROCESSED_DIR)), name="processed")
app.mount("/media/demo", StaticFiles(directory=str(settings.DEMO_DIR)), name="demo")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}
