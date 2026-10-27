"""Report generation (spec section 19): PDF, CSV, JSON export."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.config import settings
from app.models.detection import VerificationResult
from app.models.exam_session import ExamSession

STATUS_LABELS = {
    "CORRECT": "Correct",
    "EMPTY": "Empty",
    "WRONG_SEAT": "Wrong Seat",
    "UNASSIGNED": "Unassigned",
    "NEEDS_REVIEW": "Needs Review",
}


def compute_summary(session: ExamSession, results: list[VerificationResult]) -> dict:
    total = len(results)
    empty = sum(1 for r in results if r.status == "EMPTY")
    correct = sum(1 for r in results if r.status == "CORRECT")
    wrong = sum(1 for r in results if r.status == "WRONG_SEAT")
    unassigned = sum(1 for r in results if r.status == "UNASSIGNED")
    review = sum(1 for r in results if r.status == "NEEDS_REVIEW")
    occupied = total - empty
    accuracy = round((correct / total) * 100, 1) if total else 0.0
    return {
        "exam_name": session.exam_name,
        "room": session.room,
        "exam_date": session.exam_date.isoformat(),
        "total_seats": total,
        "occupied": occupied,
        "empty": empty,
        "correct": correct,
        "wrong_seat": wrong,
        "unassigned": unassigned,
        "needs_review": review,
        "accuracy_pct": accuracy,
    }


def _rows_for_export(results: list[VerificationResult]) -> list[dict]:
    return [
        {
            "seat": r.seat_id,
            "assigned": r.assigned_student_id or "-",
            "detected": r.detected_student_id or ("None" if r.status == "EMPTY" else "Unknown"),
            "status": STATUS_LABELS.get(r.status, r.status),
            "confidence": f"{r.overall_confidence * 100:.0f}%",
        }
        for r in sorted(results, key=lambda r: r.seat_id)
    ]


def generate_csv_report(session: ExamSession, results: list[VerificationResult]) -> Path:
    out_dir = Path(settings.REPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"session_{session.id}_report.csv"
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        summary = compute_summary(session, results)
        for k, v in summary.items():
            writer.writerow([k, v])
        writer.writerow([])
        writer.writerow(["Seat", "Assigned", "Detected", "Status", "Confidence"])
        for row in _rows_for_export(results):
            writer.writerow([row["seat"], row["assigned"], row["detected"], row["status"], row["confidence"]])
    return path


def generate_json_report(session: ExamSession, results: list[VerificationResult]) -> Path:
    out_dir = Path(settings.REPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"session_{session.id}_report.json"
    payload = {
        "summary": compute_summary(session, results),
        "results": [
            {
                "seat_id": r.seat_id,
                "assigned_student_id": r.assigned_student_id,
                "assigned_student_name": r.assigned_student_name,
                "detected_student_id": r.detected_student_id,
                "status": r.status.value if hasattr(r.status, "value") else r.status,
                "detection_confidence": r.detection_confidence,
                "seat_match_confidence": r.seat_match_confidence,
                "identity_confidence": r.identity_confidence,
                "spatial_consistency": r.spatial_consistency,
                "overall_confidence": r.overall_confidence,
                "explanation": r.explanation,
            }
            for r in sorted(results, key=lambda r: r.seat_id)
        ],
    }
    with open(path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    return path


def generate_pdf_report(session: ExamSession, results: list[VerificationResult]) -> Path:
    out_dir = Path(settings.REPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"session_{session.id}_report.pdf"
    summary = compute_summary(session, results)

    doc = SimpleDocTemplate(str(path), pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("ExamSeat AI -- Verification Report", styles["Title"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>Exam:</b> {summary['exam_name']}", styles["Normal"]))
    story.append(Paragraph(f"<b>Room:</b> {summary['room']}", styles["Normal"]))
    story.append(Paragraph(f"<b>Date:</b> {summary['exam_date']}", styles["Normal"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Summary", styles["Heading2"]))
    summary_table_data = [
        ["Total Seats", "Occupied", "Empty", "Correct", "Wrong Seat", "Unassigned", "Needs Review", "Accuracy"],
        [
            summary["total_seats"],
            summary["occupied"],
            summary["empty"],
            summary["correct"],
            summary["wrong_seat"],
            summary["unassigned"],
            summary["needs_review"],
            f"{summary['accuracy_pct']}%",
        ],
    ]
    st = Table(summary_table_data, hAlign="LEFT")
    st.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.append(st)
    story.append(Spacer(1, 16))

    story.append(Paragraph("Detailed Results", styles["Heading2"]))
    detail_data = [["Seat", "Assigned", "Detected", "Status", "Confidence"]]
    row_colors = []
    status_bg = {
        "Correct": colors.HexColor("#dcfce7"),
        "Empty": colors.HexColor("#f1f5f9"),
        "Wrong Seat": colors.HexColor("#fee2e2"),
        "Unassigned": colors.HexColor("#dbeafe"),
        "Needs Review": colors.HexColor("#fef9c3"),
    }
    for row in _rows_for_export(results):
        detail_data.append([row["seat"], row["assigned"], row["detected"], row["status"], row["confidence"]])
        row_colors.append(status_bg.get(row["status"], colors.white))

    dt_table = Table(detail_data, hAlign="LEFT", repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]
    for i, c in enumerate(row_colors, start=1):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), c))
    dt_table.setStyle(TableStyle(style_cmds))
    story.append(dt_table)

    story.append(Spacer(1, 16))
    story.append(
        Paragraph(
            "<i>This report is generated by an AI-assisted verification tool. Low-confidence "
            "cases are marked 'Needs Review' and require human confirmation before any action is "
            "taken -- this system does not make autonomous disciplinary decisions.</i>",
            styles["Normal"],
        )
    )

    doc.build(story)
    return path
