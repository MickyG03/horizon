"""Test bootstrap: isolated SQLite file and telemetry off, before `main` is imported anywhere."""

import os
import tempfile
from pathlib import Path

os.environ["HUD_TELEMETRY_ENABLED"] = "false"
os.environ["HORIZON_DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="horizon-test-")) / "test.db")
