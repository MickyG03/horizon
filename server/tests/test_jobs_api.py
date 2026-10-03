"""End-to-end: a scripted agent runs the fixture env in real hud subprocess runtimes."""

import time
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

FIXTURE = Path(__file__).parent / "fixtures" / "letter_count.py"


def _wait_for(client: TestClient, job_id: str, timeout: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("finished", "failed", "cancelled"):
            return job
        time.sleep(0.5)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


def test_scripted_job_runs_grades_and_triages():
    with TestClient(app) as client:
        env = client.post("/api/envs", json={"path": str(FIXTURE)}).json()

        res = client.post(
            "/api/jobs",
            json={
                "env_id": env["id"],
                "agent_type": "scripted",
                "model": "scripted",
                "group_size": 2,
                "agent_config": {"answer": "3"},
            },
        )
        assert res.status_code == 202, res.text
        job = _wait_for(client, res.json()["id"])

        assert job["status"] == "finished", job
        assert job["runs_total"] == 6 and job["runs_done"] == 6
        # "3" is right for strawberry and raspberry, wrong for blueberry (2 r's)
        by_cause = job["summary"]["by_cause"]
        assert by_cause == {"success": 4, "wrong_answer": 2}
        assert abs(job["summary"]["raw_reward"] - 4 / 6) < 1e-9
        assert job["summary"]["valid_reward"] == job["summary"]["raw_reward"]
        assert job["summary"]["infra_failures"] == 0

        runs = job["runs"]
        blueberry = [r for r in runs if r["args"].get("word") == "blueberry"]
        assert len(blueberry) == 2 and all(r["reward"] == 0.0 for r in blueberry)
        assert all(r["answer"] == "3" and r["stop_reason"] == "done" for r in runs)
        assert len({r["group_id"] for r in runs}) == 3  # one group per task

        detail = client.get(f"/api/runs/{runs[0]['id']}").json()
        sources = [s["source"] for s in detail["steps"]]
        assert "agent" in sources and "task" in sources and "user" in sources
        assert detail["job"]["id"] == job["id"]

        # excluding a run recomputes the summary
        wrong = blueberry[0]
        patched = client.patch(f"/api/runs/{wrong['id']}", json={"excluded": True}).json()
        assert patched["excluded"] is True
        after = client.get(f"/api/jobs/{job['id']}").json()
        assert after["summary"]["valid_n"] == 5
        assert abs(after["summary"]["valid_reward"] - 4 / 5) < 1e-9


def test_job_with_unknown_task_slug_is_rejected():
    with TestClient(app) as client:
        env = client.post("/api/envs", json={"path": str(FIXTURE)}).json()
        res = client.post(
            "/api/jobs",
            json={
                "env_id": env["id"],
                "agent_type": "scripted",
                "model": "scripted",
                "task_ids": ["nope"],
            },
        )
        assert res.status_code == 400
