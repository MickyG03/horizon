"""The environment builder, offline: the GitHub download is replaced by a local tarball."""

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app
from services import builder as builder_mod
from services.interpreters import find_python, project_dir, read_dotenv
from services.templates import Secret, Template

FIXTURE = Path(__file__).parent / "fixtures" / "letter_count.py"


def _tarball(files: dict[str, bytes], root: str = "repo-HEAD") -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(f"{root}/{name}")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def _wait(client: TestClient, build_id: str, timeout: float = 60) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        build = client.get(f"/api/builder/builds/{build_id}").json()
        if build["status"] != "running":
            return build
        time.sleep(0.2)
    raise AssertionError(f"build {build_id} still running")


@pytest.fixture
def envs_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "envs_dir", tmp_path / "envs")
    return tmp_path / "envs"


def test_extract_takes_one_subdirectory(tmp_path):
    archive = _tarball(
        {
            "environments/blank/env.py": b"x = 1\n",
            "environments/blank/tasks.py": b"y = 2\n",
            "environments/coding/env.py": b"nope\n",
            "README.md": b"top level\n",
        }
    )
    count = builder_mod._extract(archive, "environments/blank", tmp_path / "out")
    assert count == 2
    assert sorted(p.name for p in (tmp_path / "out").iterdir()) == ["env.py", "tasks.py"]


def test_extract_rejects_paths_outside_the_target(tmp_path):
    archive = _tarball({"../evil.py": b"boom"})
    with pytest.raises(builder_mod.StepFailed):
        builder_mod._extract(archive, None, tmp_path / "out")
    assert not (tmp_path / "evil.py").exists()
    assert not (tmp_path / "out").exists()  # a half-written tree is cleaned up


def test_dotenv_and_project_interpreter(tmp_path):
    project = tmp_path / "proj"
    (project / "environment").mkdir(parents=True)
    (project / "pyproject.toml").write_text("[project]\nname = 'x'\n")
    (project / ".env").write_text(
        '# comment\nEXA_API_KEY=abc123\nexport QUOTED="hello world"\nEMPTY=\n'
    )
    tasks = project / "environment" / "tasks.py"
    tasks.write_text("")

    assert project_dir(tasks) == project
    assert read_dotenv(project / ".env") == {"EXA_API_KEY": "abc123", "QUOTED": "hello world"}
    assert find_python(tasks) is None
    (project / ".venv" / "bin").mkdir(parents=True)
    (project / ".venv" / "bin" / "python").write_text("")
    assert find_python(tasks) == project / ".venv" / "bin" / "python"


def test_catalog_and_name_checks(envs_dir):
    with TestClient(app) as client:
        templates = client.get("/api/builder/templates").json()
        ids = {t["id"] for t in templates}
        assert {"blank", "coding", "cua", "browser", "deepresearch", "worldsim", "ml"} <= ids
        research = next(t for t in templates if t["id"] == "deepresearch")
        exa = next(s for s in research["secrets"] if s["env"] == "EXA_API_KEY")
        assert set(exa) >= {"present", "required", "scope"} and "value" not in exa

        assert client.get("/api/builder/names/Bad_Name").json()["available"] is False
        assert client.get("/api/builder/names/fine-name").json()["available"] is True
        bad = client.post("/api/builder/builds", json={"template": "nope", "name": "x"})
        assert bad.status_code == 400


def _letters_template(monkeypatch, tasks_py: bytes) -> None:
    """A "letters" template whose download is a local tarball holding `tasks_py`."""
    archive = _tarball(
        {
            "pyproject.toml": b"[project]\nname = 'letters'\n",
            "tasks.py": tasks_py,
        }
    )

    async def fake_fetch(self, template, target, live):
        builder_mod._extract(archive, None, target)
        live.write("stubbed download")
        return "local tarball"

    monkeypatch.setattr(builder_mod.Builder, "_fetch", fake_fetch)
    monkeypatch.setitem(
        builder_mod.TEMPLATES,
        "letters",
        Template(
            id="letters",
            name="Letters",
            summary="",
            description="",
            repo="local/letters",
            subdir=None,
            sdk_example=False,
            tasks_file="tasks.py",
            env_file="tasks.py",
            env_name="letter-count",
            runtime="local",
            secrets=(Secret("LETTERS_TOKEN", "Token", "test", required=False),),
        ),
    )


def test_build_from_template_end_to_end(envs_dir, monkeypatch):
    """Fetch (stubbed), configure with a secret, skip install, register, verify; then give the
    project an interpreter of its own and run probes through it."""
    _letters_template(monkeypatch, FIXTURE.read_bytes())

    with TestClient(app) as client:
        res = client.post(
            "/api/builder/builds",
            json={
                "template": "letters",
                "name": "my-letters",
                "secrets": {"LETTERS_TOKEN": "s3cret-value", "NOT_DECLARED": "ignored"},
                "install": False,
            },
        )
        assert res.status_code == 201, res.text
        build = _wait(client, res.json()["id"])
        assert build["status"] == "succeeded", build
        steps = {s["key"]: s["status"] for s in build["steps"]}
        assert steps == {
            "fetch": "done",
            "configure": "done",
            "install": "skipped",
            "image": "skipped",
            "register": "done",
            "verify": "done",
        }
        verify = next(s for s in build["steps"] if s["key"] == "verify")
        assert verify["detail"] == "3/3 tasks served and graded"
        assert "s3cret-value" not in build["log"]
        assert build["options"]["secrets"] == ["LETTERS_TOKEN"]
        assert build["options"]["verify"] is True

        target = envs_dir / "my-letters"
        assert 'Environment(name="my-letters")' in (target / "tasks.py").read_text()
        assert read_dotenv(target / ".env") == {"LETTERS_TOKEN": "s3cret-value"}
        assert (target / ".env").stat().st_mode & 0o777 == 0o600

        env = client.get(f"/api/envs/{build['env_id']}").json()
        assert env["name"] == "my-letters" and env["task_count"] == 3
        assert env["template"] == "letters" and env["python"] is None
        assert all(t["spec"]["env"] == "my-letters" for t in env["tasks"])

        # A project interpreter (a shim to this one): after a reload the env is described and
        # served through it, and its tasks are rebuilt from plain data.
        shim = target / ".venv" / "bin" / "python"
        shim.parent.mkdir(parents=True)
        shim.write_text(f'#!/bin/sh\nexec "{sys.executable}" "$@"\n')
        os.chmod(shim, 0o755)
        env = client.post(f"/api/envs/{env['id']}/reload").json()
        assert env["python"] == str(shim)

        first = env["tasks"][0]["slug"]
        report = client.post(f"/api/envs/{env['id']}/probes", json={"task_ids": [first]})
        assert report.status_code == 200, report.text
        probes = report.json()["tasks"][0]["probes"]
        assert len(probes) == 10
        assert all(p["error"] is None for p in probes), probes

        again = client.post(
            "/api/builder/builds", json={"template": "letters", "name": "my-letters"}
        )
        assert again.status_code == 400  # the directory exists now

        assert client.delete(f"/api/envs/{env['id']}").status_code == 204


def test_verify_fails_when_a_grader_raises(envs_dir, monkeypatch):
    """Tasks load, but every grade throws: verify fails with the first error, and a retry with
    verify off skips it."""
    grade = b"    yield 1.0 if answer and str(word.count(letter)) in answer else 0.0\n"
    broken = FIXTURE.read_bytes().replace(grade, b'    raise RuntimeError("grader exploded")\n')
    assert broken != FIXTURE.read_bytes()
    _letters_template(monkeypatch, broken)

    with TestClient(app) as client:
        res = client.post(
            "/api/builder/builds",
            json={"template": "letters", "name": "broken-letters", "install": False},
        )
        assert res.status_code == 201, res.text
        build = _wait(client, res.json()["id"])
        assert build["status"] == "failed", build
        steps = {s["key"]: s for s in build["steps"]}
        assert steps["register"]["status"] == "done"
        assert steps["verify"]["status"] == "failed"
        assert steps["verify"]["detail"].startswith("3/3 tasks failed.")
        assert "grader exploded" in steps["verify"]["detail"]
        assert build["error"] == steps["verify"]["detail"]

        retry = client.post(f"/api/builder/builds/{build['id']}/retry", json={"verify": False})
        assert retry.status_code == 200, retry.text
        build = _wait(client, build["id"])
        assert build["status"] == "succeeded", build
        steps = {s["key"]: s["status"] for s in build["steps"]}
        assert steps["register"] == "done" and steps["verify"] == "skipped"
        assert build["options"]["verify"] is False

        assert client.delete(f"/api/envs/{build['env_id']}").status_code == 204


def test_cancel_a_running_build_then_retry(envs_dir, monkeypatch):
    """Cancel while install runs a slow process: the process is killed, the build and its step
    are cancelled, later steps stay pending, and Retry carries on from there."""

    async def slow_install(self, template, target, options, live):
        script = "import os, time; print('pid', os.getpid(), flush=True); time.sleep(120)"
        await builder_mod._stream([sys.executable, "-c", script], target, {}, live, 300)
        return "never"

    _letters_template(monkeypatch, FIXTURE.read_bytes())
    monkeypatch.setattr(builder_mod.Builder, "_install", slow_install)

    with TestClient(app) as client:
        build_id = client.post(
            "/api/builder/builds",
            json={"template": "letters", "name": "slow-letters", "install": True},
        ).json()["id"]

        deadline = time.monotonic() + 30
        while "pid " not in (build := client.get(f"/api/builder/builds/{build_id}").json())["log"]:
            assert time.monotonic() < deadline, build
            time.sleep(0.1)
        pid = int(build["log"].split("pid ", 1)[1].split()[0])

        res = client.post(f"/api/builder/builds/{build_id}/cancel")
        assert res.status_code == 200, res.text
        build = res.json()
        assert build["status"] == "cancelled" and build["error"] is None
        steps = {s["key"]: s for s in build["steps"]}
        assert {k: s["status"] for k, s in steps.items()} == {
            "fetch": "done",
            "configure": "done",
            "install": "cancelled",
            "image": "pending",
            "register": "pending",
            "verify": "pending",
        }
        for key in ("fetch", "configure", "install"):
            assert steps[key]["started_at"] <= steps[key]["ended_at"], steps[key]
        assert steps["image"]["started_at"] is None and steps["image"]["ended_at"] is None
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)  # killed and reaped
        assert client.post(f"/api/builder/builds/{build_id}/cancel").status_code == 409

        async def quick_install(self, template, target, options, live):
            return "stubbed"

        monkeypatch.setattr(builder_mod.Builder, "_install", quick_install)
        res = client.post(f"/api/builder/builds/{build_id}/retry", json={})
        assert res.status_code == 200, res.text
        build = _wait(client, build_id)
        assert build["status"] == "succeeded", build
        steps = {s["key"]: s for s in build["steps"]}
        assert steps["install"]["status"] == "done" and steps["install"]["detail"] == "stubbed"
        assert steps["register"]["status"] == "done" and build["env_id"]
        assert steps["verify"]["status"] == "done"
        assert all(s["ended_at"] for s in build["steps"])
        assert client.delete(f"/api/envs/{build['env_id']}").status_code == 204
