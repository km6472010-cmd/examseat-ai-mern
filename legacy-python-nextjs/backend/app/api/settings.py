from __future__ import annotations

from fastapi import APIRouter

from app.schemas.settings import AppSettingsOut, AppSettingsUpdate
from app.services import settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=AppSettingsOut)
def get_settings():
    return settings_service.get_settings_dict()


@router.put("", response_model=AppSettingsOut)
def update_settings(payload: AppSettingsUpdate):
    return settings_service.update_settings(payload.model_dump(exclude_unset=True))
