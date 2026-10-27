"""CSV seating-arrangement parsing (spec section 5, Option A)."""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass

REQUIRED_COLUMNS = {"seat_id", "row", "column"}
OPTIONAL_COLUMNS = {"student_id", "student_name"}


@dataclass
class ParsedSeatRow:
    seat_id: str
    row: int
    column: int
    student_id: str | None
    student_name: str | None


@dataclass
class CsvParseResult:
    rows: list[ParsedSeatRow]
    warnings: list[dict]
    rows_parsed: int
    rows_skipped: int


class CsvValidationError(ValueError):
    pass


def parse_seating_csv(content: bytes) -> CsvParseResult:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvValidationError(f"File is not valid UTF-8 text: {exc}") from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise CsvValidationError("CSV file appears to be empty.")

    header = {h.strip().lower() for h in reader.fieldnames}
    missing = REQUIRED_COLUMNS - header
    if missing:
        raise CsvValidationError(
            f"Missing required column(s): {', '.join(sorted(missing))}. "
            f"Required columns are: {', '.join(sorted(REQUIRED_COLUMNS))}."
        )

    rows: list[ParsedSeatRow] = []
    warnings: list[dict] = []
    seen_seat_ids: set[str] = set()
    rows_skipped = 0

    for i, raw in enumerate(reader, start=2):  # row 1 is the header
        normalized = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        seat_id = normalized.get("seat_id", "")
        row_val = normalized.get("row", "")
        col_val = normalized.get("column", "")

        if not seat_id:
            warnings.append({"row_number": i, "message": "Missing seat_id -- row skipped."})
            rows_skipped += 1
            continue
        if seat_id in seen_seat_ids:
            warnings.append({"row_number": i, "message": f"Duplicate seat_id '{seat_id}' -- row skipped."})
            rows_skipped += 1
            continue
        try:
            row_num = int(row_val)
            col_num = int(col_val)
        except ValueError:
            warnings.append(
                {"row_number": i, "message": f"row/column must be integers (got row='{row_val}', column='{col_val}') -- row skipped."}
            )
            rows_skipped += 1
            continue

        student_id = normalized.get("student_id") or None
        student_name = normalized.get("student_name") or None
        if student_id and not student_name:
            warnings.append({"row_number": i, "message": f"student_id '{student_id}' has no student_name."})

        seen_seat_ids.add(seat_id)
        rows.append(
            ParsedSeatRow(
                seat_id=seat_id,
                row=row_num,
                column=col_num,
                student_id=student_id,
                student_name=student_name,
            )
        )

    if not rows:
        raise CsvValidationError("No valid seat rows could be parsed from this file.")

    return CsvParseResult(rows=rows, warnings=warnings, rows_parsed=len(rows), rows_skipped=rows_skipped)
