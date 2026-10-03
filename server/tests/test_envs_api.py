from pathlib import Path

from fastapi.testclient import TestClient

from main import app

FIXTURE = Path(__file__).parent / "fixtures" / "letter_count.py"


def test_register_list_and_delete_env():
    with TestClient(app) as client:
        res = client.post("/api/envs", json={"path": str(FIXTURE)})
        assert res.status_code == 201, res.text
        env = res.json()
        assert env["name"] == "letter-count"
        assert env["taskset_name"] == "letter_count"
        assert env["task_count"] == 3

        slugs = [t["slug"] for t in env["tasks"]]
        assert len(set(slugs)) == 3
        assert all(s.startswith("count_letter-") for s in slugs)
        first = env["tasks"][0]
        assert first["params"]["word"]["default"] == "strawberry"
        assert first["params"]["letter"]["default"] == "r"
        assert "letter appears" in first["description"]

        # registering the same path again updates in place
        again = client.post("/api/envs", json={"path": str(FIXTURE)})
        assert again.status_code == 201
        assert again.json()["id"] == env["id"]

        listed = client.get("/api/envs").json()
        assert [e["id"] for e in listed] == [env["id"]]

        tasks = client.get(f"/api/envs/{env['id']}/tasks").json()
        assert len(tasks) == 3

        assert client.delete(f"/api/envs/{env['id']}").status_code == 204
        assert client.get("/api/envs").json() == []


def test_register_rejects_bad_paths():
    with TestClient(app) as client:
        assert client.post("/api/envs", json={"path": "relative/tasks.py"}).status_code == 400
        assert client.post("/api/envs", json={"path": "/nope/tasks.py"}).status_code == 400


def test_providers_never_leak_key_values():
    with TestClient(app) as client:
        providers = client.get("/api/providers").json()
        types = {p["agent_type"] for p in providers}
        assert types == {"gemini", "claude", "openai", "openai_compatible"}
        for p in providers:
            assert set(p) >= {"available", "via", "default_model", "models", "label"}
            assert "key" not in p or p["key_env"] in {None, p["key_env"]}
            assert not any(str(v).startswith(("sk-", "AIza")) for v in p.values())
