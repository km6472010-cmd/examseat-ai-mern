"""
Shared test fixtures.

IMPORTANT: environment variables that redirect storage to a temp
directory must be set *before* `app.config.settings` is imported
anywhere (pydantic-settings reads them at instantiation time), so this
happens at module import time, before any `from app...` import below.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

_TEST_ROOT = Path(tempfile.mkdtemp(prefix="examseat_test_"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_ROOT / 'test.db'}"
os.environ["DATA_DIR"] = str(_TEST_ROOT / "data")
os.environ["UPLOADS_DIR"] = str(_TEST_ROOT / "data" / "uploads")
os.environ["PROCESSED_DIR"] = str(_TEST_ROOT / "data" / "processed")
os.environ["DEMO_DIR"] = str(_TEST_ROOT / "data" / "demo")
os.environ["REPORTS_DIR"] = str(_TEST_ROOT / "reports")
os.environ["MODELS_DIR"] = str(_TEST_ROOT / "models")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database.session import Base, engine  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TEST_ROOT, ignore_errors=True)
