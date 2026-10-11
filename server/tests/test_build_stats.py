"""Typical step durations, which the build page uses to call out a slow step."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from db.engine import engine
from db.models import EnvBuild
from main import app
from services.build_stats import typical_seconds

T0 = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def client():
    # Startup creates the tables, and recover() marks 'running' rows from before it as
    # interrupted, so every row here is inserted after it.
    with TestClient(app) as client:
        yield client


def _step(key: str, status: str, seconds: float | None) -> dict:
    started = T0.isoformat() if seconds is not None else None
    ended = (T0 + timedelta(seconds=seconds)).isoformat() if seconds is not None else None
    return {"key": key, "label": key, "status": status, "detail": None,
            "started_at": started, "ended_at": ended}  # fmt: skip


def _build(template: str, status: str, steps: list[dict]) -> str:
    build = EnvBuild(
        id=uuid.uuid4().hex[:12], template=template, name="x", directory="/x",
        status=status, steps=steps,
    )  # fmt: skip
    with Session(engine) as session:
        session.add(build)
        session.commit()
        return build.id


def test_typical_is_the_median_of_finished_steps(client):
    template = f"stats-{uuid.uuid4().hex[:6]}"
    for install in (10, 30, 200):
        _build(
            template, "succeeded", [_step("fetch", "done", 2), _step("install", "done", install)]
        )
    # A cancelled build's done steps count; skipped, cancelled and untimed steps (builds from
    # before timing) don't. fetch: 2, 2, 2, 4 -> 2.0; install: 10, 30, 200 -> 30.0
    _build(template, "cancelled", [_step("fetch", "done", 4), _step("install", "cancelled", 5)])
    _build(template, "succeeded", [_step("fetch", "done", None), _step("image", "skipped", 0)])

    with Session(engine) as session:
        assert typical_seconds(session, template) == {"fetch": 2.0, "install": 30.0}
        assert typical_seconds(session, "no-such-template") == {}


def test_running_build_carries_typical_durations(client):
    template = f"stats-{uuid.uuid4().hex[:6]}"
    _build(template, "succeeded", [_step("install", "done", 90)])
    running = _build(template, "running", [_step("install", "running", None)])
    assert client.get(f"/api/builder/builds/{running}").json()["typical"] == {"install": 90.0}

    finished = _build(template, "succeeded", [_step("install", "done", 10)])
    assert "typical" not in client.get(f"/api/builder/builds/{finished}").json()
