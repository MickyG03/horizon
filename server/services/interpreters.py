"""Which Python an environment runs under.

By default an env is described and served with Horizon's own interpreter, so everything it imports
has to be installed next to Horizon. Real environments have their own dependencies (fastmcp,
playwright, flask, ...), declared in their own uv project. When the tasks file sits in a project
that has a `.venv` (the builder makes one with `uv sync`), Horizon uses that interpreter instead and
applies the project's `.env`, so the env's dependencies and secrets never touch Horizon's process.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

# How far above the tasks file to look for the project root: the file's own directory and its
# parent (worldsim-template keeps its tasks in environment/tasks.py).
PROJECT_DEPTH = 2


def project_dir(tasks_path: Path) -> Path | None:
    """The nearest directory holding a pyproject.toml, within PROJECT_DEPTH levels."""
    for parent in [tasks_path.parent, *tasks_path.parent.parents][:PROJECT_DEPTH]:
        if (parent / "pyproject.toml").is_file():
            return parent
    return None


def find_python(tasks_path: Path) -> Path | None:
    """The project venv's interpreter, if the env has one. Not resolved: that leaves the venv."""
    root = project_dir(tasks_path)
    if root is None:
        return None
    for rel in ("bin/python", "Scripts/python.exe"):
        candidate = root / ".venv" / rel
        if candidate.exists():
            return candidate
    return None


def read_dotenv(path: Path) -> dict[str, str]:
    """KEY=VALUE lines from a .env file. Comments, blanks and empty values are skipped."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key.strip() and value:
            values[key.strip()] = value
    return values


def child_env(tasks_path: Path) -> dict[str, str]:
    """Environment for a child process serving or describing this env.

    The project's .env fills in what the process environment doesn't set, the same precedence the
    hud CLI uses. The venv's bin directory goes first on PATH so tools the env shells out to (its
    own pytest, playwright) are the project's.
    """
    env = dict(os.environ)
    root = project_dir(tasks_path)
    if root is not None:
        for key, value in read_dotenv(root / ".env").items():
            env.setdefault(key, value)
    python = find_python(tasks_path)
    if python is not None:
        env["VIRTUAL_ENV"] = str(python.parent.parent)
        env["PATH"] = os.pathsep.join([str(python.parent), env.get("PATH", "")])
        env.pop("PYTHONHOME", None)
    env["PYTHONUNBUFFERED"] = "1"
    return env


def container_env(tasks_path: Path) -> dict[str, str]:
    """Variables for an env running in its Docker image: the project's .env, plus the HUD key the
    SDK holds (graders that call an LLM judge go through the HUD gateway)."""
    from hud.settings import settings as hud_settings

    root = project_dir(tasks_path)
    values = read_dotenv(root / ".env") if root is not None else {}
    if hud_settings.api_key:
        values.setdefault("HUD_API_KEY", hud_settings.api_key)
    return values


class ProjectRuntime:
    """Serve an env from source with its project's interpreter.

    The same thing `hud.eval.SubprocessRuntime` does (run `python -m hud.environment.server`, wait
    for the port announcement, yield a tcp Runtime, terminate on exit), except that the SDK's
    version always uses the parent's `sys.executable`.
    """

    def __init__(self, source: Path, python: Path, *, ready_timeout: float = 120.0) -> None:
        self.source = source
        self.python = python
        self.ready_timeout = ready_timeout

    @asynccontextmanager
    async def __call__(self, task: Any) -> AsyncIterator[Any]:
        from hud.environment.server import PORT_ANNOUNCEMENT
        from hud.eval.runtime.core import Runtime
        from hud.utils.process import create_process_group_exec

        if task.runtime_config is not None:
            raise ValueError("ProjectRuntime does not support task runtime_config")
        proc = await create_process_group_exec(
            str(self.python),
            "-m",
            "hud.environment.server",
            str(self.source),
            "--env",
            task.env,
            term_timeout=10.0,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(self.source.parent),
            env=child_env(self.source),
        )
        assert proc.stdout is not None and proc.stderr is not None
        tail: deque[str] = deque(maxlen=40)

        async def drain(stream: asyncio.StreamReader) -> None:
            while line := await stream.readline():
                tail.append(line.decode("utf-8", "replace").rstrip()[-1024:])

        stderr_drain = asyncio.create_task(drain(proc.stderr))
        stdout_drain: asyncio.Task[None] | None = None
        try:
            port = None
            with contextlib.suppress(TimeoutError):
                async with asyncio.timeout(self.ready_timeout):
                    while line := await proc.stdout.readline():
                        text = line.decode("utf-8", "replace").strip()
                        if text.startswith(PORT_ANNOUNCEMENT):
                            port = int(text.removeprefix(PORT_ANNOUNCEMENT))
                            break
                        tail.append(text[-1024:])
            if port is None:
                await asyncio.sleep(0.2)  # let stderr catch up so the error says why
                detail = "\n".join(tail).strip() or "(no output captured)"
                raise RuntimeError(f"env {task.env!r} did not start under {self.python}:\n{detail}")
            stdout_drain = asyncio.create_task(drain(proc.stdout))
            yield Runtime(f"tcp://127.0.0.1:{port}")
        finally:
            await proc.terminate()
            for drain_task in (stdout_drain, stderr_drain):
                if drain_task is not None:
                    drain_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await drain_task
