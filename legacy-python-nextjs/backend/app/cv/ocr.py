"""
Seating-plan OCR / table extraction (spec section 5, Option C).

Uses the system `tesseract` binary via pytesseract -- no heavyweight
PaddleOCR/EasyOCR dependency needed for a table this simple. This is a
real, working baseline: it OCRs the image, then heuristically splits
each line into seat_id/row/column/student_id/student_name columns using
whitespace/comma/tab runs as column separators (the same shape produced
by printing a spreadsheet or a neatly ruled table to an image).

It will not perfectly parse every seating-plan layout (skewed scans,
merged cells, handwriting are all out of scope for a baseline). That is
why the API always returns the extracted rows alongside per-row
warnings and asks the frontend to render them in an editable table for
the invigilator to correct before the plan is used for verification
(spec: "Clearly display extracted data and allow the user to correct it
before verification").
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import pytesseract
from PIL import Image

_COLUMN_SPLIT_RE = re.compile(r"\s{2,}|\t+|,")


@dataclass
class ExtractedSeatRow:
    seat_id: str | None = None
    row: int | None = None
    column: int | None = None
    student_id: str | None = None
    student_name: str | None = None
    raw_line: str = ""
    confidence: str = "low"  # low | medium | high -- heuristic, not a probability


@dataclass
class OcrExtractionResult:
    rows: list[ExtractedSeatRow] = field(default_factory=list)
    raw_text: str = ""
    warnings: list[str] = field(default_factory=list)


def _looks_like_header(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    return "seat" in joined and ("student" in joined or "row" in joined)


def extract_seating_table(image_path: str) -> OcrExtractionResult:
    try:
        text = pytesseract.image_to_string(Image.open(image_path))
    except Exception as exc:  # tesseract missing / unreadable image
        return OcrExtractionResult(warnings=[f"OCR unavailable: {exc}"])

    result = OcrExtractionResult(raw_text=text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    for line in lines:
        cells = [c.strip() for c in _COLUMN_SPLIT_RE.split(line) if c.strip()]
        if len(cells) < 2:
            continue
        if _looks_like_header(cells):
            continue

        row = ExtractedSeatRow(raw_line=line)
        # Heuristic column assignment: seat_id (alnum, short), row/column
        # (integers), student_id (alnum with digits), student_name (the
        # remaining longest text cell).
        numeric_cells = [c for c in cells if c.isdigit()]
        alnum_cells = [c for c in cells if not c.isdigit()]

        if alnum_cells:
            row.seat_id = alnum_cells[0]
        if len(numeric_cells) >= 2:
            row.row, row.column = int(numeric_cells[0]), int(numeric_cells[1])
        if len(alnum_cells) >= 2:
            row.student_id = alnum_cells[1]
        if len(alnum_cells) >= 3:
            row.student_name = " ".join(alnum_cells[2:])

        row.confidence = "medium" if row.seat_id and row.student_id else "low"
        result.rows.append(row)

    if not result.rows:
        result.warnings.append(
            "No table rows could be confidently extracted. Please use the manual editor or CSV upload instead."
        )
    else:
        result.warnings.append(
            f"Extracted {len(result.rows)} row(s) via OCR heuristics -- review and correct before saving."
        )
    return result
