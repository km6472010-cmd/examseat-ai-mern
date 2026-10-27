"""
Application configuration.

All settings are overridable via environment variables (see .env.example at
the project root). Defaults are chosen so the app runs out-of-the-box with
zero external configuration (SQLite database, local filesystem storage).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- General -----------------------------------------------------
    APP_NAME: str = "ExamSeat AI"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "change-me-in-production-please"
    API_PREFIX: str = "/api"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- Database ------------------------------------------------------
    # Defaults to SQLite so the project runs with zero setup. Point this at
    # a Postgres DSN (e.g. postgresql+psycopg2://user:pass@host/db) for
    # production use.
    DATABASE_URL: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'examseat.db'}"

    # --- Storage -------------------------------------------------------
    DATA_DIR: Path = PROJECT_ROOT / "data"
    UPLOADS_DIR: Path = PROJECT_ROOT / "data" / "uploads"
    PROCESSED_DIR: Path = PROJECT_ROOT / "data" / "processed"
    DEMO_DIR: Path = PROJECT_ROOT / "data" / "demo"
    REPORTS_DIR: Path = PROJECT_ROOT / "reports"
    MODELS_DIR: Path = PROJECT_ROOT / "models"

    # --- Retention / privacy -------------------------------------------
    # When True, uploaded evidence images/videos are deleted automatically
    # after RETENTION_DAYS. Off by default for a demo/hackathon deployment;
    # a real deployment should turn this on (see README > Privacy).
    AUTO_DELETE_EVIDENCE: bool = False
    RETENTION_DAYS: int = 30

    # --- CV / detection --------------------------------------------------
    # "opencv" uses OpenCV's built-in HOG people-detector (no external model
    # download, fully offline). "yolo" is a pluggable interface for a
    # future ultralytics/YOLO backend (see app/cv/detectors.py) -- it is
    # not implemented in this build per the chosen CV approach, and the
    # factory falls back to "opencv" automatically if selected without the
    # optional dependency installed.
    DETECTION_BACKEND: str = "opencv"
    PERSON_DETECTION_CONFIDENCE_THRESHOLD: float = 0.35

    # --- Verification thresholds (all configurable via Settings page) ----
    SEAT_MATCH_MAX_DISTANCE_NORM: float = 0.12  # normalized (0-1) distance cutoff
    CONFIDENCE_REVIEW_THRESHOLD: float = 0.60  # below this -> NEEDS_REVIEW
    CONFIDENCE_HIGH_THRESHOLD: float = 0.80
    IDENTITY_MATCH_THRESHOLD: float = 0.75

    def ensure_directories(self) -> None:
        for d in [
            self.DATA_DIR,
            self.UPLOADS_DIR,
            self.PROCESSED_DIR,
            self.DEMO_DIR,
            self.REPORTS_DIR,
            self.MODELS_DIR,
        ]:
            Path(d).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
