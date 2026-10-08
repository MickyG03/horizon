"""Environment registry: a HUD tasks file registered by path.

Loading a tasks file means executing user code, so it happens in a subprocess
(scripts/inspect_tasks.py) and only the JSON description comes back.
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from config import SERVER_DIR
from db.models import Env, Job, ProbeResult, Run, Step
from services.interpreters import child_env, find_python

INSPECT_SCRIPT = SERVER_DIR / "scripts" / "inspect_tasks.py"
INSPECT_TIMEOUT_S = 120


class EnvError(Exception):
    """A tasks file could not be registered or loaded."""


def resolve_tasks_path(raw: str) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise EnvError("Path must be absolute.")
    path = path.resolve()
    if not path.exists():
        raise EnvError(f"No such file: {path}")
    if path.suffix not in {".py", ".json", ".jsonl"}:
        raise EnvError("Expected a .py, .json or .jsonl tasks file.")
    return path


async def inspect_tasks_file(path: Path) -> dict[str, Any]:
    """Describe a tasks file, with the env project's interpreter when it has one."""
    python = find_python(path)
    env = {**child_env(path), "HUD_TELEMETRY_ENABLED": "false"}
    proc = await asyncio.create_subprocess_exec(
        str(python) if python else sys.executable,
        str(INSPECT_SCRIPT),
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(path.parent),
        env=env,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=INSPECT_TIMEOUT_S)
    except TimeoutError:
        proc.kill()
        raise EnvError(f"Loading {path.name} took longer than {INSPECT_TIMEOUT_S}s.") from None

    text = out.decode(errors="replace").strip()
    # The script prints exactly one JSON line last; user code may print before it.
    last_line = text.rsplit("\n", 1)[-1] if text else ""
    try:
        payload = json.loads(last_line)
    except json.JSONDecodeError:
        detail = err.decode(errors="replace").strip()[-2000:] or text[-2000:]
        raise EnvError(detail or "Inspector produced no output.") from None
    if proc.returncode != 0 or "error" in payload:
        raise EnvError(payload.get("error") or err.decode(errors="replace")[-2000:])
    return payload


def _apply(env: Env, info: dict[str, Any], path: Path) -> None:
    python = find_python(path)
    env.python = str(python) if python else None
    env.name = info.get("env_name") or info["taskset_name"]
    env.taskset_name = info["taskset_name"]
    env.tasks = info["tasks"]
    env.task_count = len(info["tasks"])
    env.last_loaded_at = datetime.now(UTC)
    env.load_error = None


async def register(
    session: Session, raw_path: str, *, template: str | None = None, image: str | None = None
) -> Env:
    path = resolve_tasks_path(raw_path)
    existing = session.exec(select(Env).where(Env.path == str(path))).first()
    info = await inspect_tasks_file(path)

    env = existing or Env(id=uuid.uuid4().hex[:12], name="", taskset_name="", path=str(path))
    _apply(env, info, path)
    if template is not None:
        env.template = template
    if image is not None:
        env.image = image
    session.add(env)
    session.commit()
    session.refresh(env)
    return env


async def reload(session: Session, env: Env) -> Env:
    path = resolve_tasks_path(env.path)
    try:
        info = await inspect_tasks_file(path)
    except EnvError as exc:
        env.load_error = str(exc)
        session.add(env)
        session.commit()
        raise
    _apply(env, info, path)
    session.add(env)
    session.commit()
    session.refresh(env)
    return env


def list_envs(session: Session) -> list[Env]:
    return list(session.exec(select(Env).order_by(Env.registered_at.desc())).all())


def get_env(session: Session, env_id: str) -> Env | None:
    return session.get(Env, env_id)


def delete_env(session: Session, env: Env) -> None:
    """Remove the env and everything recorded under it."""
    for job in session.exec(select(Job).where(Job.env_id == env.id)).all():
        for run in session.exec(select(Run).where(Run.job_id == job.id)).all():
            for step in session.exec(select(Step).where(Step.run_id == run.id)).all():
                session.delete(step)
            session.delete(run)
        session.delete(job)
    for probe in session.exec(select(ProbeResult).where(ProbeResult.env_id == env.id)).all():
        session.delete(probe)
    # No ORM relationships tie these rows together, so the unit of work may order the env's
    # DELETE first; flush the children so the foreign keys never see an orphan.
    session.flush()
    session.delete(env)
    session.commit()
