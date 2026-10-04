"""Grader probes against the fixture env, whose grader is `str(n) in answer`."""

from pathlib import Path

from fastapi.testclient import TestClient

from main import app

FIXTURE = Path(__file__).parent / "fixtures" / "letter_count.py"


def test_probes_flag_the_substring_grader():
    with TestClient(app) as client:
        env = client.post("/api/envs", json={"path": str(FIXTURE)}).json()

        res = client.post(f"/api/envs/{env['id']}/probes", json={"max_concurrent": 8})
        assert res.status_code == 200, res.text
        report = res.json()

        assert report["probe_count"] == 10
        assert len(report["tasks"]) == 3
        for task in report["tasks"]:
            accepted = {a["probe"] for a in task["accepted"]}
            # "0 1 2 3 ..." contains every count, so the substring grader rewards it
            assert "all_digits" in accepted, task
            # "The answer is one of: 1, 2, 3, 4, 5." contains 2 and 3 as well
            assert "hedge" in accepted, task
            assert "empty" not in accepted and "yes" not in accepted
            assert task["errors"] == []
            assert task["score"] is not None and task["score"] < 1

        assert 0 < report["score"] < 1

        # the env now carries the health score, and GET returns the stored report
        env_after = client.get(f"/api/envs/{env['id']}").json()
        assert env_after["probe_score"] == report["score"]
        again = client.get(f"/api/envs/{env['id']}/probes").json()
        assert again["score"] == report["score"]
