"""Runtime-configurable settings (spec section 16, Settings page).

Persisted to a small JSON file under DATA_DIR so changes survive a
restart without requiring a database migration or environment-variable
edit -- appropriate for the handful of tunable thresholds this app
exposes (confidence thresholds, detection backend, retention policy).
"""
from __future__ import annotations

import json
from pathlib import Path

from app.config import settings

_RUNTIME_SETTINGS_PATH = Path(settings.DATA_DIR) / "runtime_settings.json"

_EDITABLE_FIELDS = [
    "person_detection_confidence_threshold",
    "seat_match_max_distance_norm",
    "confidence_review_threshold",
    "confidence_high_threshold",
    "identity_match_threshold",
    "auto_delete_evidence",
    "retention_days",
]

_FIELD_TO_SETTING_ATTR = {
    "person_detection_confidence_threshold": "PERSON_DETECTION_CONFIDENCE_THRESHOLD",
    "seat_match_max_distance_norm": "SEAT_MATCH_MAX_DISTANCE_NORM",
    "confidence_review_threshold": "CONFIDENCE_REVIEW_THRESHOLD",
    "confidence_high_threshold": "CONFIDENCE_HIGH_THRESHOLD",
    "identity_match_threshold": "IDENTITY_MATCH_THRESHOLD",
    "auto_delete_evidence": "AUTO_DELETE_EVIDENCE",
    "retention_days": "RETENTION_DAYS",
}


def load_runtime_settings() -> None:
    """Applies any persisted overrides onto the in-memory settings singleton. Call at startup."""
    if not _RUNTIME_SETTINGS_PATH.exists():
        return
    try:
        data = json.loads(_RUNTIME_SETTINGS_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return
    for field, value in data.items():
        attr = _FIELD_TO_SETTING_ATTR.get(field)
        if attr:
            setattr(settings, attr, value)


def get_settings_dict() -> dict:
    return {
        "detection_backend": settings.DETECTION_BACKEND,
        "person_detection_confidence_threshold": settings.PERSON_DETECTION_CONFIDENCE_THRESHOLD,
        "seat_match_max_distance_norm": settings.SEAT_MATCH_MAX_DISTANCE_NORM,
        "confidence_review_threshold": settings.CONFIDENCE_REVIEW_THRESHOLD,
        "confidence_high_threshold": settings.CONFIDENCE_HIGH_THRESHOLD,
        "identity_match_threshold": settings.IDENTITY_MATCH_THRESHOLD,
        "auto_delete_evidence": settings.AUTO_DELETE_EVIDENCE,
        "retention_days": settings.RETENTION_DAYS,
    }


def update_settings(updates: dict) -> dict:
    current = {f: getattr(settings, _FIELD_TO_SETTING_ATTR[f]) for f in _EDITABLE_FIELDS}
    for field, value in updates.items():
        if field in _EDITABLE_FIELDS and value is not None:
            current[field] = value
            setattr(settings, _FIELD_TO_SETTING_ATTR[field], value)

    _RUNTIME_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    _RUNTIME_SETTINGS_PATH.write_text(json.dumps(current, indent=2))
    return get_settings_dict()
