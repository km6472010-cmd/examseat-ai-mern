import cv2
import numpy as np


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_create_and_get_session(client):
    r = client.post("/api/sessions", json={"exam_name": "Midterm", "room": "R1", "exam_date": "2026-09-03"})
    assert r.status_code == 200
    session_id = r.json()["id"]

    r = client.get(f"/api/sessions/{session_id}")
    assert r.status_code == 200
    assert r.json()["exam_name"] == "Midterm"
    assert r.json()["total_seats"] == 0


def test_get_missing_session_returns_404(client):
    r = client.get("/api/sessions/9999")
    assert r.status_code == 404


def test_csv_upload_creates_seating_plan(client):
    r = client.post("/api/sessions", json={"exam_name": "E1", "room": "R1", "exam_date": "2026-09-03"})
    session_id = r.json()["id"]

    csv_content = b"seat_id,row,column,student_id,student_name\nA01,1,1,STU001,Student 1\nA02,1,2,STU002,Student 2\n"
    r = client.post(
        "/api/seating/upload",
        data={"session_id": session_id},
        files={"file": ("seating.csv", csv_content, "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rows_parsed"] == 2
    assert len(body["seating_plan"]["seats"]) == 2

    r = client.get(f"/api/seating/{session_id}")
    assert r.status_code == 200
    assert r.json()["source"] == "csv"


def test_csv_upload_rejects_bad_columns(client):
    r = client.post("/api/sessions", json={"exam_name": "E1", "room": "R1", "exam_date": "2026-09-03"})
    session_id = r.json()["id"]
    r = client.post(
        "/api/seating/upload",
        data={"session_id": session_id},
        files={"file": ("bad.csv", b"foo,bar\n1,2\n", "text/csv")},
    )
    assert r.status_code == 422


def test_manual_seating_editor(client):
    r = client.post("/api/sessions", json={"exam_name": "E2", "room": "R2", "exam_date": "2026-09-03"})
    session_id = r.json()["id"]
    payload = {"seats": [{"seat_id": "A01", "row": 1, "column": 1, "student_id": "STU001", "student_name": "S1"}]}
    r = client.post(f"/api/seating/manual?session_id={session_id}", json=payload)
    assert r.status_code == 200
    assert r.json()["source"] == "manual"


def test_classroom_calibration_roundtrip(client):
    payload = {
        "name": "Layout A",
        "room": "R1",
        "seats": [{"seat_id": "A01", "row": 1, "column": 1, "x": 0.25, "y": 0.3, "w": 0.2, "h": 0.3}],
        "calibration_method": "manual",
    }
    r = client.post("/api/classroom/calibrate", json=payload)
    assert r.status_code == 200
    layout_id = r.json()["id"]

    r = client.get(f"/api/classroom/layouts/{layout_id}")
    assert r.status_code == 200
    assert r.json()["seats"][0]["seat_id"] == "A01"


def test_verify_requires_calibration_and_seating_plan(client):
    r = client.post("/api/sessions", json={"exam_name": "E3", "room": "R3", "exam_date": "2026-09-03"})
    session_id = r.json()["id"]
    img = np.full((100, 100, 3), 200, dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    r = client.post(
        "/api/verify/image", params={"session_id": session_id}, files={"file": ("x.jpg", buf.tobytes(), "image/jpeg")}
    )
    assert r.status_code == 422


def test_demo_mode_end_to_end(client):
    r = client.post("/api/demo/run")
    assert r.status_code == 200
    session = r.json()
    assert session["is_demo"] is True
    session_id = session["id"]

    r = client.get(f"/api/sessions/{session_id}")
    summary = r.json()
    assert summary["total_seats"] == 20
    assert summary["correct"] + summary["empty"] + summary["wrong_seat"] + summary["unassigned"] + summary["needs_review"] == 20

    r = client.get(f"/api/results/{session_id}")
    assert r.status_code == 200
    assert len(r.json()) == 20
    statuses = {row["status"] for row in r.json()}
    # demo mode is designed to exercise every possible classification
    assert statuses == {"CORRECT", "EMPTY", "WRONG_SEAT", "UNASSIGNED", "NEEDS_REVIEW"}


def test_human_review_queue_and_confirm(client):
    r = client.post("/api/demo/run")
    session_id = r.json()["id"]

    r = client.get(f"/api/reviews/{session_id}")
    assert r.status_code == 200
    queue = r.json()
    assert len(queue) >= 1
    result_id = queue[0]["id"]

    r = client.post(f"/api/reviews/{result_id}/confirm", json={"decision": "confirm", "reviewer": "tester"})
    assert r.status_code == 200

    # reviewing the same case twice should fail
    r = client.post(f"/api/reviews/{result_id}/confirm", json={"decision": "confirm", "reviewer": "tester"})
    assert r.status_code == 409

    r = client.get(f"/api/reviews/{session_id}")
    remaining_ids = [row["id"] for row in r.json()]
    assert result_id not in remaining_ids


def test_reports_all_formats(client):
    r = client.post("/api/demo/run")
    session_id = r.json()["id"]

    for fmt, content_type_prefix in [("json", "application/json"), ("csv", "text/csv"), ("pdf", "application/pdf")]:
        r = client.get(f"/api/reports/{session_id}", params={"format": fmt})
        assert r.status_code == 200
        assert r.headers["content-type"].startswith(content_type_prefix)
        assert len(r.content) > 0


def test_settings_update_persists(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    original = r.json()["confidence_review_threshold"]

    r = client.put("/api/settings", json={"confidence_review_threshold": 0.75})
    assert r.status_code == 200
    assert r.json()["confidence_review_threshold"] == 0.75

    r = client.get("/api/settings")
    assert r.json()["confidence_review_threshold"] == 0.75


def test_delete_session(client):
    r = client.post("/api/sessions", json={"exam_name": "ToDelete", "room": "R1", "exam_date": "2026-09-03"})
    session_id = r.json()["id"]
    r = client.delete(f"/api/sessions/{session_id}")
    assert r.status_code == 204
    r = client.get(f"/api/sessions/{session_id}")
    assert r.status_code == 404
