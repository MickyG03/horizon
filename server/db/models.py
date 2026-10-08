"""Tables.

Env   - a registered tasks file (one HUD environment + its task templates)
Job   - one launch of an env against an agent: tasks x group_size runs
Run   - one rollout (id = hud trace id); carries reward, answer, error and the triage cause
Step  - one recorded step of a run (agent turn, tool call, system error, task setup/evaluate)
ProbeResult - one grader-health probe against one task
EnvBuild - one environment created from a template by the builder
"""

from datetime import UTC, datetime
from typing import Any

from sqlmodel import JSON, Column, Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Env(SQLModel, table=True):
    __tablename__ = "envs"

    id: str = Field(primary_key=True)
    name: str  # Environment(name=...) from the tasks file
    taskset_name: str  # file stem, what the hud CLI calls the job
    path: str = Field(unique=True)
    task_count: int = 0
    tasks: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    registered_at: datetime = Field(default_factory=utcnow)
    last_loaded_at: datetime | None = None
    load_error: str | None = None
    probe_score: float | None = None  # fraction of probes the graders correctly rejected
    # The env project's own interpreter (see services/interpreters.py); None means Horizon's.
    python: str | None = None
    # A Docker image every task runs in (desktop envs); None means a local subprocess.
    image: str | None = None
    template: str | None = None  # builder template it was created from, if any


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: str = Field(primary_key=True)
    env_id: str = Field(foreign_key="envs.id", index=True)
    name: str
    agent_type: str  # claude | openai | gemini | openai_compatible
    model: str
    group_size: int = 1
    max_steps: int = 10
    max_concurrent: int = 8
    # Extra agent config (base_url for OpenAI-compatible servers, temperature, ...). Never keys.
    agent_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    task_filter: list[str] | None = Field(default=None, sa_column=Column(JSON))
    status: str = Field(default="queued", index=True)  # queued|running|finished|cancelled|failed
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Run(SQLModel, table=True):
    __tablename__ = "runs"

    id: str = Field(primary_key=True)  # hud trace id
    job_id: str = Field(foreign_key="jobs.id", index=True)
    task_id: str
    slug: str
    args: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    group_id: str | None = None
    attempt: int = 0  # index within the group
    status: str = Field(default="pending", index=True)  # pending|running|completed|error|cancelled
    reward: float | None = None
    answer: str | None = None
    stop_reason: str | None = None
    error: str | None = None
    cause: str | None = None  # see services/triage.py
    cause_kind: str | None = None  # ok | agent | infra | env | grader
    excluded: bool = False  # manually excluded from aggregate scores
    started_at: datetime | None = None
    ended_at: datetime | None = None
    usage: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Step(SQLModel, table=True):
    __tablename__ = "steps"

    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(foreign_key="runs.id", index=True)
    seq: int
    source: str  # user | agent | tool | task | system | subagent
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    started_at: str | None = None  # ISO strings as recorded by the SDK
    ended_at: str | None = None


class ProbeResult(SQLModel, table=True):
    __tablename__ = "probe_results"

    id: int | None = Field(default=None, primary_key=True)
    env_id: str = Field(foreign_key="envs.id", index=True)
    task_id: str
    slug: str
    probe: str
    answer: str
    reward: float | None = None
    accepted: bool = False  # True means the grader rewarded a junk answer
    error: str | None = None
    ran_at: datetime = Field(default_factory=utcnow)


class EnvBuild(SQLModel, table=True):
    """One run of the environment builder: fetch a template, configure, install, register."""

    __tablename__ = "env_builds"

    id: str = Field(primary_key=True)
    template: str
    name: str
    directory: str
    options: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))  # never secrets
    status: str = Field(default="running", index=True)  # running|succeeded|failed
    # [{key, label, status: pending|running|done|skipped|failed, detail}]
    steps: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    log: str = ""
    env_id: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: datetime | None = None
