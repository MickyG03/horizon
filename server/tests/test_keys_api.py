import os
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

KEY = "sk-test-0123456789abcdef"


def _openai(rows):
    return next(r for r in rows if r["provider"] == "openai")


def test_save_and_remove_a_key_without_leaking_it():
    env_file = Path(os.environ["HORIZON_HUD_ENV_FILE"])
    with TestClient(app) as client:
        rows = client.get("/api/settings/keys").json()
        assert {r["provider"] for r in rows} == {"anthropic", "openai", "gemini", "hud"}
        assert all(KEY not in str(r) for r in rows)

        saved = client.put("/api/settings/keys/openai", json={"value": KEY}).json()
        assert saved["set"] is True and saved["hint"] == "…cdef" and saved["saved_by_horizon"]
        assert KEY not in str(saved)

        # written to the hud env file, owner-only
        assert f"OPENAI_API_KEY={KEY}" in env_file.read_text()
        assert oct(env_file.stat().st_mode & 0o777) == "0o600"

        # the running SDK sees it: the provider becomes usable with its own key
        providers = client.get("/api/providers").json()
        assert next(p for p in providers if p["agent_type"] == "openai")["via"] == "provider_key"

        # saving again replaces rather than duplicates
        client.put("/api/settings/keys/openai", json={"value": KEY + "x"})
        assert env_file.read_text().count("OPENAI_API_KEY=") == 1

        removed = client.delete("/api/settings/keys/openai").json()
        assert removed["set"] is False and removed["hint"] is None
        assert "OPENAI_API_KEY" not in env_file.read_text()
        assert _openai(client.get("/api/settings/keys").json())["set"] is False


def test_rejects_junk_and_unknown_providers():
    with TestClient(app) as client:
        assert (
            client.put("/api/settings/keys/openai", json={"value": "no spaces allowed"}).status_code
            == 400
        )
        assert client.put("/api/settings/keys/openai", json={"value": "short"}).status_code == 400
        assert client.put("/api/settings/keys/nope", json={"value": KEY}).status_code == 400
        assert client.delete("/api/settings/keys/nope").status_code == 404
