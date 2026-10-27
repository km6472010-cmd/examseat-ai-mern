"""Visual overlay rendering (spec section 13).

GREEN = Correct, RED = Wrong seat, YELLOW = Needs verification,
GRAY = Empty, BLUE = Unassigned.
"""
from __future__ import annotations

import cv2
import numpy as np

STATUS_COLORS_BGR = {
    "CORRECT": (76, 175, 80),      # green
    "WRONG_SEAT": (60, 60, 220),   # red
    "NEEDS_REVIEW": (0, 210, 255), # yellow
    "EMPTY": (150, 150, 150),      # gray
    "UNASSIGNED": (220, 140, 60),  # blue-ish
}


def draw_seat_annotation(
    image: np.ndarray,
    seat_id: str,
    bbox: tuple[int, int, int, int],
    status: str,
    assigned_student: str | None,
    detected_student: str | None,
    confidence: float,
) -> None:
    color = STATUS_COLORS_BGR.get(status, (255, 255, 255))
    x1, y1, x2, y2 = bbox
    cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)

    lines = [seat_id]
    if assigned_student:
        lines.append(f"Assigned: {assigned_student}")
    if detected_student:
        lines.append(f"Detected: {detected_student}")
    label = status.replace("_", " ")
    lines.append(f"{label}  {confidence * 100:.0f}%")

    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.42
    thickness = 1
    line_h = 16
    box_h = line_h * len(lines) + 8
    box_w = max(cv2.getTextSize(t, font, scale, thickness)[0][0] for t in lines) + 10

    label_y1 = max(0, y1 - box_h)
    overlay = image.copy()
    cv2.rectangle(overlay, (x1, label_y1), (x1 + box_w, y1), color, -1)
    cv2.addWeighted(overlay, 0.65, image, 0.35, 0, image)

    for i, text in enumerate(lines):
        ty = label_y1 + (i + 1) * line_h - 2
        cv2.putText(image, text, (x1 + 5, ty), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def render_annotated_image(image: np.ndarray, annotations: list[dict]) -> np.ndarray:
    """annotations: list of dicts with keys seat_id,bbox,status,assigned_student,detected_student,confidence"""
    out = image.copy()
    for a in annotations:
        draw_seat_annotation(
            out,
            seat_id=a["seat_id"],
            bbox=a["bbox"],
            status=a["status"],
            assigned_student=a.get("assigned_student"),
            detected_student=a.get("detected_student"),
            confidence=a.get("confidence", 0.0),
        )
    return out
