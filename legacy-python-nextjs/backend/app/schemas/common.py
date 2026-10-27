from __future__ import annotations

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str
    error_code: str | None = None


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
