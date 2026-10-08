"""Describe a HUD tasks file as JSON.

Run in a throwaway subprocess (see services/envs.py) so that importing user code, and the hud
SDK's module caching, never touch the server process.

    python scripts/inspect_tasks.py path/to/tasks.py
"""

from __future__ import annotations

import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any

os.environ.setdefault("HUD_TELEMETRY_ENABLED", "false")


def _jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return repr(value)


def _annotation(param: inspect.Parameter) -> str | None:
    if param.annotation is inspect.Parameter.empty:
        return None
    ann = param.annotation
    return ann.__name__ if isinstance(ann, type) else str(ann)


def _spec(task: Any) -> dict[str, Any] | None:
    try:
        spec = task.model_dump(mode="json")
        json.dumps(spec)
        return spec
    except Exception:  # noqa: BLE001 - args that aren't data; the task can only run from source
        return None


def describe(path: Path) -> dict[str, Any]:
    from hud.eval import Taskset

    taskset = Taskset.from_file(path)
    tasks: list[dict[str, Any]] = []

    for slug, task in taskset.items():
        env = getattr(task, "_env", None)
        factory = env.tasks.get(task.id) if env is not None else None

        params: dict[str, Any] = {}
        if factory is not None:
            for name, param in factory.sig.parameters.items():
                required = param.default is inspect.Parameter.empty
                params[name] = {
                    "required": required,
                    "default": None if required else _jsonable(param.default),
                    "type": _annotation(param),
                }

        tasks.append(
            {
                "id": task.id,
                "slug": slug,
                "env": task.env,
                "args": {k: _jsonable(v) for k, v in (task.args or {}).items()},
                "description": (factory.description if factory is not None else "") or "",
                "params": params,
                # The task as plain data, so a server without the env's dependencies can still
                # rebuild it (see services/runner.py).
                "spec": _spec(task),
            }
        )

    env_names = list(taskset.environment_names())
    return {
        "taskset_name": taskset.name,
        "env_name": env_names[0] if env_names else None,
        "env_names": env_names,
        "tasks": tasks,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(json.dumps({"error": "usage: inspect_tasks.py <tasks-file>"}))
        return 2
    try:
        print(json.dumps(describe(Path(argv[1]).resolve())))
        return 0
    except Exception as exc:  # noqa: BLE001 - report everything to the caller as JSON
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
