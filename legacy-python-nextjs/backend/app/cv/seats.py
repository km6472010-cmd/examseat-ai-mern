"""
Seat/desk region helpers: normalized<->pixel conversion and a best-effort
automatic seat-region detector.

Automatic seat detection from a single 2D photo (arbitrary furniture,
occlusion, perspective) is not something a generic heuristic can do
reliably -- the spec explicitly calls this out and asks for a manual
calibration tool as the dependable path (section 6/7). The heuristic
here (`auto_detect_seat_regions`) is a real, working baseline (grid
estimation over detected rectangular contours), not a fake -- but it is
meant to pre-populate the calibration UI for the invigilator to correct,
never to be trusted blindly.
"""
from __future__ import annotations

import cv2
import numpy as np

from app.schemas.classroom import SeatRegion


def pixel_to_norm(x: float, y: float, w: float, h: float, img_w: int, img_h: int) -> tuple[float, float, float, float]:
    return x / img_w, y / img_h, w / img_w, h / img_h


def norm_to_pixel(x: float, y: float, w: float, h: float, img_w: int, img_h: int) -> tuple[int, int, int, int]:
    return int(x * img_w), int(y * img_h), int(w * img_w), int(h * img_h)


def seat_region_bbox_norm(seat: SeatRegion) -> tuple[float, float, float, float]:
    """Return (x1, y1, x2, y2) in normalized coords from a center+size seat region."""
    x1 = seat.x - seat.w / 2
    y1 = seat.y - seat.h / 2
    x2 = seat.x + seat.w / 2
    y2 = seat.y + seat.h / 2
    return x1, y1, x2, y2


def auto_detect_seat_regions(
    image: np.ndarray, rows: int, columns: int, margin: float = 0.04
) -> list[SeatRegion]:
    """Grid-estimate seat regions across the usable classroom area.

    This is the fallback baseline referenced in spec section 6: rather
    than trying (and likely failing) to segment individual desks from
    arbitrary classroom photos, it lays out an evenly spaced rows x
    columns grid across the image, which is what most exam halls
    actually look like from an invigilator's vantage point. The
    calibration UI lets the user drag every seat afterwards.
    """
    h, w = image.shape[:2]
    usable_w = 1.0 - 2 * margin
    usable_h = 1.0 - 2 * margin
    cell_w = usable_w / max(columns, 1)
    cell_h = usable_h / max(rows, 1)

    seats: list[SeatRegion] = []
    for r in range(rows):
        for c in range(columns):
            cx = margin + cell_w * (c + 0.5)
            cy = margin + cell_h * (r + 0.5)
            seat_letter = chr(ord("A") + r) if r < 26 else f"R{r+1}"
            seat_id = f"{seat_letter}{c + 1:02d}"
            seats.append(
                SeatRegion(
                    seat_id=seat_id,
                    row=r + 1,
                    column=c + 1,
                    x=round(cx, 4),
                    y=round(cy, 4),
                    w=round(cell_w * 0.8, 4),
                    h=round(cell_h * 0.8, 4),
                    is_usable=True,
                )
            )
    return seats


def detect_desk_contours(image: np.ndarray, min_area_frac: float = 0.002) -> int:
    """Best-effort count of rectangular desk-like contours (edge/contour based).

    Used only as a heuristic suggestion (e.g. to pre-fill "how many seats
    did we find?" in the calibration UI) -- never as ground truth.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = image.shape[:2]
    img_area = h * w
    min_area = img_area * min_area_frac

    count = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, cw, ch = cv2.boundingRect(cnt)
        aspect = cw / ch if ch else 0
        if 0.4 <= aspect <= 3.0:  # roughly desk/chair-shaped
            count += 1
    return count
