"""Request/response models. Table rows (db/models.py) are returned directly where they fit."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from db.models import Job, Run, Step
from services.agents import AGENT_TYPES


class EnvCreate(BaseModel):
    path: str = Field(min_length=1, description="Absolute path to a HUD tasks file")


class BuildCreate(BaseModel):
    template: str
    name: str = Field(min_length=1, max_length=48)
    # Secret values by variable name. Written to disk, never stored on the build or logged.
    secrets: dict[str, str] = Field(default_factory=dict)
    install: bool | None = Field(default=None, description="uv sync; template default if omitted")
    build_image: bool = True


class BuildRetry(BaseModel):
    install: bool | None = None
    build_image: bool | None = None


class JobCreate(BaseModel):
    env_id: str
    agent_type: str = Field(pattern="^(" + "|".join(AGENT_TYPES) + ")$")
    model: str = Field(min_length=1)
    name: str | None = None
    group_size: int = Field(default=1, ge=1, le=64)
    max_steps: int = Field(default=10, ge=1, le=500)
    max_concurrent: int = Field(default=8, ge=1, le=64)
    task_ids: list[str] | None = Field(
        default=None, description="Task slugs to run; all if omitted"
    )
    agent_config: dict[str, Any] = Field(default_factory=dict)


class RunPatch(BaseModel):
    excluded: bool


class JobOut(BaseModel):
    id: str
    env_id: str
    env_name: str | None = None
    name: str
    agent_type: str
    model: str
    group_size: int
    max_steps: int
    max_concurrent: int
    agent_config: dict[str, Any]
    task_filter: list[str] | None
    status: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    summary: dict[str, Any]
    runs_total: int = 0
    runs_done: int = 0

    @classmethod
    def from_row(cls, job: Job, runs: list[Run], env_name: str | None = None) -> JobOut:
        done = sum(1 for r in runs if r.status in ("completed", "error", "cancelled"))
        return cls(
            **job.model_dump(),
            env_name=env_name,
            runs_total=len(runs),
            runs_done=done,
        )


class JobDetail(JobOut):
    runs: list[Run] = []


class RunDetail(BaseModel):
    run: Run
    steps: list[Step]
    job: JobOut
