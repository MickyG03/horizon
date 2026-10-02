from fastapi.testclient import TestClient

from main import app


def test_health_reports_ok_and_hud_version():
    with TestClient(app) as client:
        res = client.get("/api/health")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["hud"].startswith("0.")
