import pytest

from app.services.csv_service import CsvValidationError, parse_seating_csv

VALID_CSV = b"""seat_id,row,column,student_id,student_name
A01,1,1,STU001,Student 1
A02,1,2,STU002,Student 2
A03,1,3,STU003,Student 3
A04,1,4,STU004,Student 4
"""


def test_parses_valid_csv():
    result = parse_seating_csv(VALID_CSV)
    assert result.rows_parsed == 4
    assert result.rows_skipped == 0
    assert result.rows[0].seat_id == "A01"
    assert result.rows[0].student_id == "STU001"


def test_seat_without_assignment_is_allowed():
    csv_bytes = b"seat_id,row,column,student_id,student_name\nB05,2,5,,\n"
    result = parse_seating_csv(csv_bytes)
    assert result.rows_parsed == 1
    assert result.rows[0].student_id is None


def test_missing_required_column_raises():
    csv_bytes = b"seat_id,row\nA01,1\n"
    with pytest.raises(CsvValidationError):
        parse_seating_csv(csv_bytes)


def test_empty_seat_id_is_skipped_with_warning():
    csv_bytes = b"seat_id,row,column,student_id,student_name\n,1,1,STU001,Student 1\nA02,1,2,STU002,Student 2\n"
    result = parse_seating_csv(csv_bytes)
    assert result.rows_parsed == 1
    assert result.rows_skipped == 1
    assert "Missing seat_id" in result.warnings[0]["message"]


def test_duplicate_seat_id_is_skipped():
    csv_bytes = (
        b"seat_id,row,column,student_id,student_name\n"
        b"A01,1,1,STU001,Student 1\n"
        b"A01,1,1,STU999,Duplicate\n"
    )
    result = parse_seating_csv(csv_bytes)
    assert result.rows_parsed == 1
    assert result.rows_skipped == 1


def test_non_integer_row_column_is_skipped():
    csv_bytes = (
        b"seat_id,row,column,student_id,student_name\n"
        b"A01,one,1,STU001,Student 1\n"
        b"A02,1,2,STU002,Student 2\n"
    )
    result = parse_seating_csv(csv_bytes)
    assert result.rows_parsed == 1
    assert result.rows_skipped == 1


def test_empty_file_raises():
    with pytest.raises(CsvValidationError):
        parse_seating_csv(b"")


def test_no_valid_rows_raises():
    csv_bytes = b"seat_id,row,column,student_id,student_name\n,,,,\n"
    with pytest.raises(CsvValidationError):
        parse_seating_csv(csv_bytes)
