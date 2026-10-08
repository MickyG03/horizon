"""Test bootstrap: isolated SQLite file and telemetry off, before `main` is imported anywhere."""

import os
import tempfile
from pathlib import Path

os.environ["HUD_TELEMETRY_ENABLED"] = "false"
_tmp = Path(tempfile.mkdtemp(prefix="horizon-test-"))
os.environ["HORIZON_DB_PATH"] = str(_tmp / "test.db")
# Never touch the real ~/.hud/.env from tests.
os.environ["HORIZON_HUD_ENV_FILE"] = str(_tmp / "hud.env")
