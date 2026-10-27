from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class SeatRegion(BaseModel):
    """A calibrated seat location in normalized [0,1] image coordinates."""

    seat_id: str
    row: int
    column: int
    x: float = Field(..., ge=0, le=1, description="normalized center x")
    y: float = Field(..., ge=0, le=1, description="normalized center y")
    w: float = Field(..., ge=0, le=1, description="normalized box width")
    h: float = Field(..., ge=0, le=1, description="normalized box height")
    is_usable: bool = True


class ClassroomLayoutCreate(BaseModel):
    name: str
    room: str | None = None
    reference_width: int | None = None
    reference_height: int | None = None
    seats: list[SeatRegion]
    calibration_method: str = "manual"


class ClassroomLayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    room: str | None
    reference_image_path: str | None
    reference_width: int | None
    reference_height: int | None
    calibration_method: str
    seats: list[SeatRegion]
    created_at: dt.datetime
    updated_at: dt.datetime


class AutoDetectSeatsResult(BaseModel):
    """Result of the best-effort automatic seat/desk detector.

    Automatic seat detection from a single 2D photo is inherently
    unreliable (occlusion, perspective, generic furniture) -- this is a
    heuristic baseline (contour/grid based). Its output is always meant to
    be reviewed and corrected in the calibration UI before saving, per
    spec section 6 ("If automatic seat detection is unreliable, provide a
    manual seat calibration tool").
    """

    seats: list[SeatRegion]
    method: str
    confidence_note: str
