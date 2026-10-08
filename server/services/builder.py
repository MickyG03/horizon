"""The environment builder: from a template to a registered, runnable environment in one go.

What `hud init` + README + `uv sync` + `hud eval` would have you do by hand, as five steps run in
the background:

    fetch      download the template from GitHub into envs/<name>
    configure  name the Environment, write the env's .env, save provider keys to ~/.hud/.env
    install    `uv sync`, so the env gets its own .venv (see services/interpreters.py)
    image      `docker build -f Dockerfile.hud` for desktop envs, when Docker is available
    register   describe the tasks file and add it to Horizon

Secret values are only ever held in memory for the duration of a build, written to the env's own
.env (mode 600) or ~/.hud/.env, and scrubbed from the build log.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import logging
import os
import re
import shutil
import tarfile
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

import httpx
from sqlmodel import Session, select

from config import settings
from db.engine import engine
from db.models import EnvBuild
from services import envs, keys
from services.templates import TEMPLATES, Template

log = logging.getLogger(__name__)

STEPS: list[tuple[str, str]] = [
    ("fetch", "Fetch template"),
    ("configure", "Configure"),
    ("install", "Install dependencies"),
    ("image", "Build Docker image"),
    ("register", "Load tasks"),
]

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
LOG_LINES = 600
INSTALL_TIMEOUT_S = 45 * 60
IMAGE_TIMEOUT_S = 60 * 60


class BuildError(Exception):
    """A build could not be started."""


class StepFailed(Exception):
    """The current step failed; the message is shown to the user."""


class StepSkipped(Exception):
    """The current step doesn't apply; the message says why."""


def utcnow() -> datetime:
    return datetime.now(UTC)


# -- the machine ------------------------------------------------------------------------------


def _which(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    # uv's installer puts it in ~/.local/bin, which a service's PATH often lacks.
    candidate = Path.home() / ".local" / "bin" / name
    return str(candidate) if candidate.exists() else None


async def _docker_ready(docker: str | None) -> tuple[bool, str | None]:
    if docker is None:
        return False, "Docker is not installed."
    proc = await asyncio.create_subprocess_exec(
        docker,
        "info",
        "--format",
        "{{.ServerVersion}}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=10)
    except TimeoutError:
        proc.kill()
        return False, "The Docker daemon didn't answer."
    if proc.returncode != 0:
        text = err.decode(errors="replace").strip().splitlines()
        return False, (text[-1] if text else "The Docker daemon is not running.")
    return True, out.decode().strip() or None


async def machine() -> dict[str, Any]:
    """What this machine can build and run."""
    docker = _which("docker")
    docker_ok, docker_detail = await _docker_ready(docker)
    return {
        "uv": _which("uv"),
        "git": _which("git"),
        "docker": docker,
        "docker_ready": docker_ok,
        "docker_detail": docker_detail,
        "envs_dir": str(settings.envs_dir),
    }


def secret_status(template: Template) -> list[dict[str, Any]]:
    """Each secret the template wants, and whether this machine already has it (never the value)."""
    out = []
    for secret in template.secrets:
        present = bool(os.environ.get(secret.env))
        if secret.scope == "global":
            present = present or any(k["env"] == secret.env and k["set"] for k in keys.status())
        out.append({**secret.__dict__, "present": present})
    return out


def catalog() -> list[dict[str, Any]]:
    return [{**t.public(), "secrets": secret_status(t)} for t in TEMPLATES.values()]


def check_name(name: str) -> str | None:
    """Why a name can't be used, or None."""
    if not NAME_RE.match(name):
        return "Use lowercase letters, digits and dashes, starting with a letter or digit."
    target = settings.envs_dir / name
    if target.exists() and any(target.iterdir()):
        return f"{target} already exists."
    return None


# -- state ------------------------------------------------------------------------------------


class _Live:
    """A running build's log, kept in memory and flushed to the database at step boundaries."""

    def __init__(self, build_id: str, secrets: list[str]) -> None:
        self.build_id = build_id
        self.lines: list[str] = []
        self.secrets = [s for s in secrets if len(s) >= 4]

    def write(self, text: str) -> None:
        for line in text.rstrip("\n").splitlines() or [""]:
            for secret in self.secrets:
                line = line.replace(secret, "••••")
            self.lines.append(line[:2000])
        if len(self.lines) > LOG_LINES:
            del self.lines[: len(self.lines) - LOG_LINES]


class Builder:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._live: dict[str, _Live] = {}
        self._names: dict[str, str] = {}  # build id -> env name, while running

    def recover(self) -> None:
        """Builds left 'running' by a previous server process will never finish; say so."""
        with Session(engine) as session:
            for build in session.exec(select(EnvBuild).where(EnvBuild.status == "running")):
                build.status = "failed"
                build.error = "Interrupted: Horizon restarted while this was building. Retry it."
                build.steps = [
                    {**s, "status": "failed"} if s["status"] == "running" else s
                    for s in build.steps
                ]
                build.finished_at = utcnow()
                session.add(build)
            session.commit()

    # public API

    def start(
        self,
        session: Session,
        *,
        template_id: str,
        name: str,
        secrets: dict[str, str],
        install: bool | None,
        build_image: bool,
    ) -> EnvBuild:
        template = TEMPLATES.get(template_id)
        if template is None:
            raise BuildError(f"Unknown template: {template_id}")
        if problem := check_name(name):
            raise BuildError(problem)
        known = {s.env for s in template.secrets}
        secrets = {k: v.strip() for k, v in secrets.items() if k in known and v.strip()}
        if any("\n" in v or "\r" in v for v in secrets.values()):
            raise BuildError("Secret values must be a single line.")
        if name in self._names.values():
            raise BuildError(f"{name} is already being built.")

        build = EnvBuild(
            id=uuid.uuid4().hex[:12],
            template=template.id,
            name=name,
            directory=str(settings.envs_dir / name),
            options={
                "install": template.install_default if install is None else install,
                "build_image": build_image,
                "secrets": sorted(secrets),  # names only
            },
            steps=[
                {"key": key, "label": label, "status": "pending", "detail": None}
                for key, label in STEPS
            ],
        )
        session.add(build)
        session.commit()
        session.refresh(build)
        self._launch(build.id, secrets)
        return build

    def retry(
        self, session: Session, build: EnvBuild, *, install: bool | None, build_image: bool | None
    ) -> EnvBuild:
        """Run every step that didn't finish again (and re-register, to pick up a new image).
        Secrets aren't kept, so configure only redoes the rename; keys entered earlier are saved."""
        if build.id in self._tasks:
            raise BuildError("This build is still running.")
        options = dict(build.options)
        if install is not None:
            options["install"] = install
        if build_image is not None:
            options["build_image"] = build_image
        redo = [s["key"] for s in build.steps if s["status"] != "done"]
        if redo:
            redo.append("register")
        build.options = options
        build.status = "running"
        build.error = None
        build.finished_at = None
        build.steps = [
            {**s, "status": "pending", "detail": None} if s["key"] in redo else s
            for s in build.steps
        ]
        session.add(build)
        session.commit()
        session.refresh(build)
        self._launch(build.id, {}, previous=build.log)
        return build

    def view(self, build: EnvBuild) -> dict[str, Any]:
        """The build as the API returns it: the live log while running."""
        data = build.model_dump(mode="json")
        live = self._live.get(build.id)
        if live is not None:
            data["log"] = "\n".join(live.lines)
        template = TEMPLATES.get(build.template)
        data["template_name"] = template.name if template else build.template
        data["runtime"] = template.runtime if template else "local"
        data["next_steps"] = list(template.next_steps) if template else []
        return data

    def is_running(self, build_id: str) -> bool:
        return build_id in self._tasks

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        for task in list(self._tasks.values()):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    # pipeline

    def _launch(self, build_id: str, secrets: dict[str, str], previous: str = "") -> None:
        live = _Live(build_id, list(secrets.values()))
        if previous:
            live.write(previous)
            live.write("— retrying —")
        self._live[build_id] = live
        with Session(engine) as session:
            build = session.get(EnvBuild, build_id)
            assert build is not None
            self._names[build_id] = build.name
        task = asyncio.create_task(self._run(build_id, secrets, live))
        self._tasks[build_id] = task

        def done(_: asyncio.Task[None]) -> None:
            self._tasks.pop(build_id, None)
            self._names.pop(build_id, None)

        task.add_done_callback(done)

    async def _run(self, build_id: str, secrets: dict[str, str], live: _Live) -> None:
        with Session(engine) as session:
            build = session.get(EnvBuild, build_id)
            assert build is not None
            template = TEMPLATES[build.template]
            target = Path(build.directory)
            options = dict(build.options)
            pending = [s["key"] for s in build.steps if s["status"] == "pending"]

        handlers: dict[str, Callable[[], Any]] = {
            "fetch": lambda: self._fetch(template, target, live),
            "configure": lambda: self._configure(template, target, secrets, live),
            "install": lambda: self._install(template, target, options, live),
            "image": lambda: self._image(template, target, options, live),
            "register": lambda: self._register(template, target, live, build_id),
        }
        status, error = "succeeded", None
        try:
            for key in pending:
                self._set_step(build_id, key, "running", None, live)
                try:
                    detail = await handlers[key]()
                except StepSkipped as skip:
                    live.write(f"↷ {skip}")
                    self._set_step(build_id, key, "skipped", str(skip), live)
                    continue
                except StepFailed as exc:
                    live.write(f"✗ {exc}")
                    self._set_step(build_id, key, "failed", str(exc), live)
                    status, error = "failed", str(exc)
                    break
                self._set_step(build_id, key, "done", detail, live)
        except asyncio.CancelledError:
            status, error = "failed", "Horizon stopped while this was building."
            raise
        except Exception as exc:  # noqa: BLE001 - surface anything unexpected on the build
            log.exception("build %s crashed", build_id)
            status, error = "failed", f"{type(exc).__name__}: {exc}"
            live.write(f"✗ {error}")
        finally:
            with Session(engine) as session:
                build = session.get(EnvBuild, build_id)
                if build is not None:
                    build.steps = [
                        {**s, "status": "failed"} if s["status"] == "running" else s
                        for s in build.steps
                    ]
                    build.status = status
                    build.error = error
                    build.log = "\n".join(live.lines)
                    build.finished_at = utcnow()
                    session.add(build)
                    session.commit()
            self._live.pop(build_id, None)

    def _set_step(self, build_id: str, key: str, status: str, detail: str | None, live: _Live):
        with Session(engine) as session:
            build = session.get(EnvBuild, build_id)
            assert build is not None
            build.steps = [
                {**s, "status": status, "detail": detail} if s["key"] == key else s
                for s in build.steps
            ]
            build.log = "\n".join(live.lines)
            session.add(build)
            session.commit()

    # steps

    async def _fetch(self, template: Template, target: Path, live: _Live) -> str:
        if target.exists() and any(target.iterdir()):
            raise StepFailed(f"{target} already exists.")
        refs = await _refs(template)
        archive = None
        async with httpx.AsyncClient(follow_redirects=True, timeout=120) as client:
            for ref in refs:
                url = f"https://codeload.github.com/{template.repo}/tar.gz/{ref}"
                live.write(f"GET {url}")
                res = await client.get(url, headers=_github_headers())
                if res.status_code == 200:
                    archive, used = res.content, ref
                    break
                live.write(f"  {res.status_code}")
        if archive is None:
            raise StepFailed(f"Couldn't download {template.repo} (tried {', '.join(refs)}).")
        live.write(f"  {len(archive) / 1e6:.1f} MB")
        count = await asyncio.to_thread(_extract, archive, template.subdir, target)
        live.write(f"Wrote {count} files to {target}")
        return f"{template.repo}@{used} · {count} files"

    async def _configure(
        self, template: Template, target: Path, secrets: dict[str, str], live: _Live
    ) -> str:
        done: list[str] = []
        name = target.name
        if name != template.env_name:
            env_file = target / template.env_file
            text = env_file.read_text(encoding="utf-8") if env_file.exists() else ""
            declaration = f'Environment(name="{template.env_name}")'
            if text.count(declaration) == 1:
                env_file.write_text(
                    text.replace(declaration, f'Environment(name="{name}")'), encoding="utf-8"
                )
                live.write(f"Renamed the environment to {name!r} in {template.env_file}")
                done.append(f"named {name}")
            else:
                live.write(f"Kept the environment name {template.env_name!r}")

        by_env = {k.env: k for k in keys.KEYS.values()}
        local: dict[str, str] = {}
        for secret in template.secrets:
            value = secrets.get(secret.env)
            if not value:
                continue
            if secret.scope == "global" and secret.env in by_env:
                try:
                    keys.set_key(by_env[secret.env].provider, value)
                except keys.KeyError_ as exc:
                    raise StepFailed(f"{secret.label}: {exc}") from None
                live.write(f"Saved {secret.env} to ~/.hud/.env")
            else:
                local[secret.env] = value
        if local:
            _write_env_file(target / ".env", local)
            live.write(f"Wrote {', '.join(sorted(local))} to {target / '.env'} (mode 600)")
            done.append(f"{len(local)} secret{'s' if len(local) != 1 else ''} in .env")

        missing = [
            s.env
            for s in template.secrets
            if s.required and not secrets.get(s.env) and not os.environ.get(s.env)
        ]
        if missing:
            live.write(f"Not set yet: {', '.join(missing)}. Tasks that need them will fail.")
        return ", ".join(done) or "defaults"

    async def _install(
        self, template: Template, target: Path, options: dict[str, Any], live: _Live
    ) -> str:
        if not options.get("install"):
            raise StepSkipped(template.install_note or "Turned off.")
        if not (target / "pyproject.toml").exists():
            raise StepSkipped("No pyproject.toml; runs with Horizon's interpreter.")
        uv = _which("uv")
        if uv is None:
            raise StepFailed("uv is not installed: https://docs.astral.sh/uv/")
        env = {k: v for k, v in os.environ.items() if k not in ("VIRTUAL_ENV", "PYTHONHOME")}
        env["UV_NO_PROGRESS"] = "1"
        await _stream([uv, "sync"], target, env, live, INSTALL_TIMEOUT_S)
        return "uv sync → .venv"

    async def _image(
        self, template: Template, target: Path, options: dict[str, Any], live: _Live
    ) -> str:
        if template.runtime != "docker":
            raise StepSkipped("Runs as a local process; no image needed.")
        if not options.get("build_image"):
            raise StepSkipped("Turned off.")
        docker = _which("docker")
        ready, detail = await _docker_ready(docker)
        if not ready or docker is None:
            raise StepSkipped(f"{detail} Install Docker, then retry this build.")
        tag = image_tag(target.name)
        await _stream(
            [docker, "build", "-f", "Dockerfile.hud", "-t", tag, "."],
            target,
            dict(os.environ),
            live,
            IMAGE_TIMEOUT_S,
        )
        return tag

    async def _register(self, template: Template, target: Path, live: _Live, build_id: str):
        if template.runtime == "external":
            raise StepSkipped("Runs on Modal, outside Horizon. See the next steps.")
        image = None
        with Session(engine) as session:
            build = session.get(EnvBuild, build_id)
            assert build is not None
            image_step = next(s for s in build.steps if s["key"] == "image")
            if image_step["status"] == "done":
                image = image_step["detail"]
            tasks_path = target / template.tasks_file
            live.write(f"Describing {tasks_path}")
            try:
                env = await envs.register(
                    session, str(tasks_path), template=template.id, image=image
                )
            except envs.EnvError as exc:
                raise StepFailed(str(exc)) from None
            env_name, task_count, isolated = env.name, env.task_count, bool(env.python)
            build = session.get(EnvBuild, build_id)
            assert build is not None
            build.env_id = env.id
            session.add(build)
            session.commit()
        where = f"image {image}" if image else ("its own .venv" if isolated else "Horizon's venv")
        live.write(f"Registered {env_name}: {task_count} tasks, runs in {where}")
        return f"{task_count} tasks"


def image_tag(name: str) -> str:
    return f"horizon-{name}:dev"


# -- helpers ----------------------------------------------------------------------------------


def _github_headers() -> dict[str, str]:
    token = os.environ.get("GITHUB_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


async def _refs(template: Template) -> list[str]:
    """Git refs to try. SDK examples match the installed SDK's release tag, which has been
    published both as v0.6.19 and v.0.6.19; fall back to main."""
    if not template.sdk_example:
        return ["HEAD"]
    from hud.version import __version__

    return [f"v{__version__}", f"v.{__version__}", "main"]


def _extract(archive: bytes, subdir: str | None, target: Path) -> int:
    """Unpack `subdir` of a GitHub tarball (or all of it) into target. Files and dirs only."""
    prefix = PurePosixPath(*subdir.split("/")).parts if subdir else ()
    created = not target.exists()
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    count = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            for member in tar.getmembers():
                parts = PurePosixPath(member.name).parts[1:]  # drop "<repo>-<ref>/"
                if parts[: len(prefix)] != prefix or len(parts) == len(prefix):
                    continue
                dest = (root / Path(*parts[len(prefix) :])).resolve()
                if not dest.is_relative_to(root):
                    raise StepFailed(f"Unsafe path in archive: {member.name!r}")
                if member.isdir():
                    dest.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    source = tar.extractfile(member)
                    assert source is not None
                    dest.write_bytes(source.read())
                    if member.mode & 0o111:
                        dest.chmod(dest.stat().st_mode | (member.mode & 0o111))
                    count += 1
    except BaseException:
        if created:
            shutil.rmtree(target, ignore_errors=True)
        raise
    if count == 0:
        shutil.rmtree(target, ignore_errors=True)
        raise StepFailed(f"Nothing under {subdir or '/'} in the archive.")
    return count


def _write_env_file(path: Path, values: dict[str, str]) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    lines = [ln for ln in lines if ln.split("=", 1)[0].strip() not in values]
    lines += [f"{k}={v}" for k, v in values.items()]
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(path)


async def _stream(
    cmd: list[str], cwd: Path, env: dict[str, str], live: _Live, timeout: float
) -> None:
    live.write(f"$ {' '.join(Path(cmd[0]).name if i == 0 else c for i, c in enumerate(cmd))}")
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    assert proc.stdout is not None

    async def pump() -> None:
        assert proc.stdout is not None
        while line := await proc.stdout.readline():
            live.write(line.decode("utf-8", "replace"))

    try:
        await asyncio.wait_for(asyncio.gather(pump(), proc.wait()), timeout=timeout)
    except TimeoutError:
        proc.kill()
        minutes = f"{timeout / 60:.0f} minutes"
        raise StepFailed(f"{Path(cmd[0]).name} took longer than {minutes}.") from None
    except asyncio.CancelledError:
        proc.kill()
        raise
    if proc.returncode != 0:
        raise StepFailed(f"{Path(cmd[0]).name} {cmd[1]} exited with code {proc.returncode}.")


builder = Builder()
