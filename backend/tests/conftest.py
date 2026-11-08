import os
import sys
from pathlib import Path

# Deterministic, offline test configuration — must be set before the app is imported.
_db = Path(__file__).parent / "test.db"
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_db}",
    "ANTHROPIC_API_KEY": "",
    "ENABLE_URL_FETCH": "false",
    "ENABLE_DOMAIN_AGE": "false",
    "GOOGLE_SAFE_BROWSING_API_KEY": "",
    "VIRUSTOTAL_API_KEY": "",
    "RATE_LIMIT_PER_MINUTE": "1000",
})
sys.path.insert(0, str(Path(__file__).parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    if _db.exists():
        _db.unlink()
    from app.main import app

    with TestClient(app) as c:
        yield c
    _db.unlink(missing_ok=True)
